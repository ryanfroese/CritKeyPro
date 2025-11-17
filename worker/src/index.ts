/**
 * Cloudflare Worker for CritKey Pro
 *
 * This Worker replaces the Express server and acts as a CORS-enabled proxy
 * for Canvas API requests. It handles:
 * - Canvas API authentication
 * - Grade format conversion
 * - PDF file proxying
 * - Request pagination
 */

interface Env {
  CANVAS_BASE: string;
}

// CORS headers for allowing frontend requests
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*', // Will be restricted in production
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

// Helper to parse Link header for pagination
function parseLinkHeader(header: string | null): Record<string, string> {
  if (!header) return {};
  return header.split(',').reduce((acc, part) => {
    const match = part.match(/<([^>]+)>;\s*rel="([^"]+)"/);
    if (match) {
      acc[match[2]] = match[1];
    }
    return acc;
  }, {} as Record<string, string>);
}

// Make a Canvas API request
async function canvasRequest(
  endpoint: string,
  apiToken: string,
  options: RequestInit = {},
  baseUrl: string
): Promise<{ data: any; requestUrl: string }> {
  const url = `${baseUrl}${endpoint}`;
  const headers = {
    'Authorization': `Bearer ${apiToken}`,
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    console.error('Canvas API request failed:', {
      status: response.status,
      statusText: response.statusText,
      endpoint: endpoint,
    });
    throw new Error(`Canvas API request failed: ${response.status}`);
  }

  if (response.status === 204) {
    return { data: null, requestUrl: url };
  }

  const data = await response.json();
  return { data, requestUrl: url };
}

// Make paginated Canvas API requests
async function canvasRequestAllPages(
  endpoint: string,
  apiToken: string,
  options: RequestInit = {},
  baseUrl: string
): Promise<{ data: any; requestUrl: string }> {
  const headers = {
    'Authorization': `Bearer ${apiToken}`,
    'Content-Type': 'application/json',
    ...options.headers,
  };

  let nextUrl: string | null = `${baseUrl}${endpoint}`;
  const firstUrl = nextUrl;
  const results: any[] = [];

  while (nextUrl) {
    const response = await fetch(nextUrl, {
      ...options,
      headers,
    });

    if (!response.ok) {
      console.error('Canvas API pagination request failed:', {
        status: response.status,
        statusText: response.statusText,
        endpoint: endpoint,
      });
      throw new Error(`Canvas API request failed: ${response.status}`);
    }

    const data = await response.json();
    if (!Array.isArray(data)) {
      return { data, requestUrl: nextUrl };
    }
    results.push(...data);

    const linkHeader = response.headers.get('link');
    const links = parseLinkHeader(linkHeader);
    nextUrl = links.next || null;
  }

  return { data: results, requestUrl: firstUrl };
}

// Format grade based on assignment grading type
function formatGrade(
  postedGrade: string,
  gradingType: string = 'points'
): string {
  // If grade is in "earned/possible" format (e.g., "85/100")
  if (typeof postedGrade === 'string' && postedGrade.includes('/')) {
    const [earnedStr, possibleStr] = postedGrade.split('/').map(s => s.trim());
    const earned = parseFloat(earnedStr);
    const possible = parseFloat(possibleStr);

    if (!isNaN(earned) && !isNaN(possible) && possible > 0) {
      switch (gradingType) {
        case 'points':
          return earned.toString();
        case 'percent':
          const percentage = (earned / possible) * 100;
          return `${percentage.toFixed(2)}%`;
        case 'letter_grade':
        case 'gpa_scale':
          return earned.toString();
        case 'pass_fail':
          const passPercentage = (earned / possible) * 100;
          return passPercentage >= 60 ? 'pass' : 'fail';
        default:
          return earned.toString();
      }
    }
  }

  return postedGrade;
}

// Main request handler
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const canvasBase = env.CANVAS_BASE || 'https://cos.instructure.com/api/v1';

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    // Extract API token from Authorization header
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Authorization required' }), {
        status: 401,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }
    const apiToken = authHeader.substring(7); // Remove 'Bearer ' prefix

    try {
      // Route handling
      const path = url.pathname;

      // GET /api/courses - Fetch instructor courses
      if (path === '/api/courses' && request.method === 'GET') {
        const unfiltered = url.searchParams.get('unfiltered');
        const customBase = url.searchParams.get('canvasBase') || canvasBase;

        const { data } = await canvasRequest(
          '/courses?enrollment_type=teacher&include[]=term&per_page=100',
          apiToken,
          {},
          customBase
        );

        // Filter for active courses unless unfiltered=true
        let courses = data;
        if (unfiltered !== 'true') {
          const now = new Date();
          courses = data.filter((course: any) => {
            if (course.workflow_state !== 'available') return false;
            if (course.term && course.term.end_at) {
              const endDate = new Date(course.term.end_at);
              return now <= endDate;
            }
            return true;
          });
        }

        return new Response(JSON.stringify(courses), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }

      // GET /api/courses/:courseId/assignment-groups
      if (path.match(/^\/api\/courses\/\d+\/assignment-groups$/) && request.method === 'GET') {
        const courseId = path.split('/')[3];
        const customBase = url.searchParams.get('canvasBase') || canvasBase;

        const { data } = await canvasRequest(
          `/courses/${courseId}/assignment_groups?per_page=100`,
          apiToken,
          {},
          customBase
        );

        return new Response(JSON.stringify(data), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }

      // GET /api/courses/:courseId/assignments
      if (path.match(/^\/api\/courses\/\d+\/assignments$/) && request.method === 'GET') {
        const courseId = path.split('/')[3];
        const customBase = url.searchParams.get('canvasBase') || canvasBase;
        const assignmentGroupId = url.searchParams.get('assignment_group_id');

        const params = new URLSearchParams();
        params.append('per_page', '100');
        params.append('only_published', 'true');
        params.append('include[]', 'submission_summary');
        params.append('include[]', 'rubric');
        if (assignmentGroupId) {
          params.append('assignment_group_id', assignmentGroupId);
        }

        const endpoint = `/courses/${courseId}/assignments?${params.toString()}`;
        const { data } = await canvasRequestAllPages(endpoint, apiToken, {}, customBase);

        return new Response(JSON.stringify(data), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }

      // GET /api/courses/:courseId/assignments/:assignmentId/submissions
      if (path.match(/^\/api\/courses\/\d+\/assignments\/\d+\/submissions$/) && request.method === 'GET') {
        const parts = path.split('/');
        const courseId = parts[3];
        const assignmentId = parts[5];
        const customBase = url.searchParams.get('canvasBase') || canvasBase;

        const { data } = await canvasRequest(
          `/courses/${courseId}/assignments/${assignmentId}/submissions?include[]=user&include[]=submission_history&per_page=100`,
          apiToken,
          {},
          customBase
        );

        return new Response(JSON.stringify(data), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }

      // GET /api/courses/:courseId/assignments/:assignmentId/submissions/:userId
      if (path.match(/^\/api\/courses\/\d+\/assignments\/\d+\/submissions\/\d+$/) && request.method === 'GET') {
        const parts = path.split('/');
        const courseId = parts[3];
        const assignmentId = parts[5];
        const userId = parts[7];
        const customBase = url.searchParams.get('canvasBase') || canvasBase;

        const { data } = await canvasRequest(
          `/courses/${courseId}/assignments/${assignmentId}/submissions/${userId}?include[]=user&include[]=submission_history`,
          apiToken,
          {},
          customBase
        );

        return new Response(JSON.stringify(data), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }

      // PUT /api/courses/:courseId/assignments/:assignmentId/submissions/:userId
      if (path.match(/^\/api\/courses\/\d+\/assignments\/\d+\/submissions\/\d+$/) && request.method === 'PUT') {
        const parts = path.split('/');
        const courseId = parts[3];
        const assignmentId = parts[5];
        const userId = parts[7];

        const requestBody = await request.json() as any;
        const { posted_grade, comment, canvasBase: customBase } = requestBody;
        const base = customBase || canvasBase;

        // Fetch assignment to determine grading type
        let gradingType = 'points';
        try {
          const { data: assignment } = await canvasRequest(
            `/courses/${courseId}/assignments/${assignmentId}`,
            apiToken,
            {},
            base
          );
          gradingType = assignment.grading_type || 'points';
        } catch (err) {
          console.warn('Could not fetch assignment details:', err);
        }

        const body: any = {};
        if (posted_grade !== undefined && posted_grade !== null) {
          const formattedGrade = formatGrade(posted_grade, gradingType);
          body.submission = { posted_grade: formattedGrade };
        }
        if (comment) {
          body.comment = { text_comment: comment };
        }

        const { data } = await canvasRequest(
          `/courses/${courseId}/assignments/${assignmentId}/submissions/${userId}`,
          apiToken,
          {
            method: 'PUT',
            body: JSON.stringify(body),
          },
          base
        );

        return new Response(JSON.stringify(data), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }

      // GET /api/courses/:courseId/rubrics
      if (path.match(/^\/api\/courses\/\d+\/rubrics$/) && request.method === 'GET') {
        const courseId = path.split('/')[3];
        const customBase = url.searchParams.get('canvasBase') || canvasBase;

        const { data } = await canvasRequestAllPages(
          `/courses/${courseId}/rubrics?per_page=100&include[]=associations`,
          apiToken,
          {},
          customBase
        );

        return new Response(JSON.stringify(data), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }

      // GET /api/courses/:courseId/rubrics/:rubricId
      if (path.match(/^\/api\/courses\/\d+\/rubrics\/\d+$/) && request.method === 'GET') {
        const parts = path.split('/');
        const courseId = parts[3];
        const rubricId = parts[5];
        const customBase = url.searchParams.get('canvasBase') || canvasBase;

        const { data } = await canvasRequest(
          `/courses/${courseId}/rubrics/${rubricId}?include[]=associations`,
          apiToken,
          {},
          customBase
        );

        return new Response(JSON.stringify(data), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }

      // GET /api/proxy-file - Proxy PDF downloads
      if (path === '/api/proxy-file' && request.method === 'GET') {
        const fileUrl = url.searchParams.get('url');
        if (!fileUrl) {
          return new Response(JSON.stringify({ error: 'URL parameter required' }), {
            status: 400,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }

        const response = await fetch(fileUrl, {
          headers: {
            'Authorization': `Bearer ${apiToken}`,
          },
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch file: ${response.status}`);
        }

        // Return the file with CORS headers
        return new Response(response.body, {
          headers: {
            ...CORS_HEADERS,
            'Content-Type': response.headers.get('Content-Type') || 'application/pdf',
          },
        });
      }

      // 404 - Route not found
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });

    } catch (error: any) {
      console.error('Worker error:', error.message);
      return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }
  },
};
