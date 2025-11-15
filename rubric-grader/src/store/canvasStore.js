import { create } from 'zustand';
import { 
  cachePdf, 
  getCachedPdf, 
  getCachedAssignments, 
  deleteAssignmentCache as deleteAssignmentCacheUtil, 
  clearAllCache as clearAllCacheUtil, 
  getCacheSize 
} from '../utils/pdfCache';
import {
  getRubricScores,
  saveRubricScore,
  getStagedGrades,
  stageGrade,
  clearStagedGrades,
} from '../utils/localStorage';

const API_BASE = 'http://localhost:3001';

const dedupeById = (items = []) => {
  const seen = new Set();
  const unique = [];
  for (const item of items) {
    const id = item?.id ?? item?.user_id ?? item?.submission_id;
    if (id === undefined || id === null) {
      unique.push(item);
      continue;
    }
    if (!seen.has(id)) {
      seen.add(id);
      unique.push(item);
    }
  }
  return unique;
};

const filterAssignments = (assignments = [], groupId = 'all') => {
  return assignments.filter((assignment) => {
    const isPublished = assignment?.published === true;
    const hasSubmissions = assignment?.has_submitted_submissions === true;
    const matchesGroup = groupId === 'all' || String(assignment?.assignment_group_id) === String(groupId);
    return isPublished && hasSubmissions && matchesGroup;
  });
};

const useCanvasStore = create((set, get) => ({
  // Canvas API configuration
  apiToken: null,
  canvasApiBase: null,
  
  // Current selection
  selectedCourse: null,
  selectedCourseId: null, // Saved course ID for restoration
  selectedAssignment: null,
  selectedSubmission: null,
  submissionIndex: 0,
  selectedAssignmentGroup: 'all',
  
  // Data
  courses: [],
  assignments: [],
  allAssignments: [],
  assignmentGroups: [],
  submissions: [], // Filtered/sorted submissions for display
  allSubmissions: [], // All submissions (unfiltered) for caching
  
  // Meta
  lastRequestUrls: {
    courses: null,
    assignments: null,
    submissions: null,
    assignmentGroups: null,
  },
  
  // PDF Caching
  offlineMode: false,
  cachingProgress: { current: 0, total: 0, isCaching: false },
  cachedAssignments: [],
  parallelDownloadLimit: 3, // 0 = no limit
  
  // Grading and sorting
  sortBy: 'ungraded', // 'all' | 'graded' | 'ungraded'
  rubricScores: {}, // Map of assignmentId -> { submissionId -> scoreData }
  stagedGrades: {}, // Map of assignmentId -> { submissionId -> { grade, feedback } }
  
  // Loading states
  loadingCourses: false,
  loadingAssignments: false,
  loadingSubmissions: false,
  pushingGrades: false,
  
  // Error states
  error: null,

  // Set API token
  setApiToken: (token) => {
    set({ apiToken: token });
    // Store in localStorage
    if (token) {
      localStorage.setItem('canvas_api_token', token);
    } else {
      localStorage.removeItem('canvas_api_token');
    }
  },

  // Set Canvas API base URL
  setCanvasApiBase: (baseUrl) => {
    set({ canvasApiBase: baseUrl });
    if (baseUrl) {
      localStorage.setItem('canvas_api_base', baseUrl);
    } else {
      localStorage.removeItem('canvas_api_base');
    }
  },

  // Initialize from localStorage
  initialize: async () => {
    const token = localStorage.getItem('canvas_api_token');
    const baseUrl = localStorage.getItem('canvas_api_base');
    const offlineMode = localStorage.getItem('canvas_offline_mode') === 'true';
    const savedCourseId = localStorage.getItem('canvas_selected_course_id');
    const savedAssignmentGroupId = localStorage.getItem('canvas_selected_assignment_group_id');
    const savedParallelLimit = localStorage.getItem('canvas_parallel_download_limit');
    
    if (token) {
      set({ apiToken: token });
    }
    if (baseUrl) {
      set({ canvasApiBase: baseUrl });
    }
    if (offlineMode) {
      set({ offlineMode: true });
    }
    if (savedCourseId) {
      set({ selectedCourseId: savedCourseId });
    }
    if (savedAssignmentGroupId) {
      set({ selectedAssignmentGroup: savedAssignmentGroupId });
    }
    if (savedParallelLimit !== null) {
      const limit = parseInt(savedParallelLimit, 10);
      if (!isNaN(limit) && limit >= 0) {
        set({ parallelDownloadLimit: limit });
      }
    }
    
    // Load cached assignments metadata
    try {
      const cached = await getCachedAssignments();
      set({ cachedAssignments: Array.isArray(cached) ? cached : [] });
    } catch (error) {
      console.error('Error loading cached assignments:', error);
      set({ cachedAssignments: [] });
    }
  },

  // Toggle offline mode
  setOfflineMode: (enabled) => {
    localStorage.setItem('canvas_offline_mode', enabled ? 'true' : 'false');
    set({ offlineMode: enabled });
  },

  // Set parallel download limit
  setParallelDownloadLimit: (limit) => {
    const limitValue = Math.max(0, parseInt(limit, 10) || 0);
    localStorage.setItem('canvas_parallel_download_limit', String(limitValue));
    set({ parallelDownloadLimit: limitValue });
  },

  // Cache all PDFs for current assignment (parallel downloads, 3 at a time)
  cacheAllPdfs: async () => {
    const { allSubmissions, selectedAssignment, apiToken } = get();
    if (!allSubmissions.length || !selectedAssignment) {
      return;
    }

    set({ cachingProgress: { current: 0, total: allSubmissions.length, isCaching: true } });

    try {
      // Filter submissions with PDFs and check which ones need caching
      // Use allSubmissions (unfiltered) to cache all PDFs regardless of sort filter
      const pdfsToCache = [];
      for (const sub of allSubmissions) {
        // Use the same URL extraction logic as App.jsx
        let pdfUrl = null;
        
        // Try attachments array first
        if (sub.attachments && sub.attachments.length > 0) {
          const pdfAttachment = sub.attachments.find(att => 
            att.content_type?.includes('pdf') || 
            att.filename?.toLowerCase().endsWith('.pdf') ||
            att.url
          ) || sub.attachments[0];
          pdfUrl = pdfAttachment?.url || null;
        }
        
        // Fall back to submission_history if attachments not in main object
        if (!pdfUrl && sub.submission_history && sub.submission_history.length > 0) {
          for (const historyItem of sub.submission_history) {
            if (historyItem.attachments && historyItem.attachments.length > 0) {
              const pdfAttachment = historyItem.attachments.find(att => 
                att.content_type?.includes('pdf') || 
                att.filename?.toLowerCase().endsWith('.pdf') ||
                att.url
              ) || historyItem.attachments[0];
              if (pdfAttachment?.url) {
                pdfUrl = pdfAttachment.url;
                break;
              }
            }
          }
        }
        
        if (!pdfUrl) continue;

        // Check if already cached by assignmentId + submissionId (more reliable than URL)
        const submissionId = String(sub.id || sub.user_id);
        const cached = await getCachedPdf(pdfUrl, {
          assignmentId: selectedAssignment.id,
          submissionId: submissionId,
        });
        if (!cached) {
          pdfsToCache.push({ url: pdfUrl, submission: sub });
        }
      }

      // Update total to reflect actual PDFs that need caching
      const totalToCache = pdfsToCache.length;
      const alreadyCached = allSubmissions.length - totalToCache;
      set({ cachingProgress: { current: alreadyCached, total: allSubmissions.length, isCaching: true } });

      // Download in parallel batches
      const { parallelDownloadLimit } = get();
      const batchSize = parallelDownloadLimit === 0 ? pdfsToCache.length : parallelDownloadLimit;
      
      if (batchSize >= pdfsToCache.length) {
        // Download all at once if no limit or limit >= total
        await Promise.all(
          pdfsToCache.map(async ({ url, submission }) => {
            try {
              const proxyUrl = `http://localhost:3001/api/proxy-file?url=${encodeURIComponent(url)}&apiToken=${encodeURIComponent(apiToken)}`;
              const response = await fetch(proxyUrl);
              if (!response.ok) {
                console.warn(`Failed to fetch PDF: ${response.status}`);
                return;
              }

              const blob = await response.blob();
              await cachePdf(url, blob, selectedAssignment.id, submission.id || submission.user_id, selectedAssignment.name);
              

              // Update progress
              set((state) => ({
                cachingProgress: {
                  current: state.cachingProgress.current + 1,
                  total: state.cachingProgress.total,
                  isCaching: true,
                },
              }));
            } catch (err) {
              console.warn(`Failed to cache PDF:`, err);
              // Still update progress even on error
              set((state) => ({
                cachingProgress: {
                  current: state.cachingProgress.current + 1,
                  total: state.cachingProgress.total,
                  isCaching: true,
                },
              }));
            }
          })
        );
      } else {
        // Download in batches
        for (let i = 0; i < pdfsToCache.length; i += batchSize) {
          const batch = pdfsToCache.slice(i, i + batchSize);
          
          await Promise.all(
            batch.map(async ({ url, submission }) => {
              try {
                const proxyUrl = `http://localhost:3001/api/proxy-file?url=${encodeURIComponent(url)}&apiToken=${encodeURIComponent(apiToken)}`;
                const response = await fetch(proxyUrl);
                if (!response.ok) {
                  console.warn(`Failed to fetch PDF: ${response.status}`);
                  return;
                }

                const blob = await response.blob();
                await cachePdf(url, blob, selectedAssignment.id, submission.id || submission.user_id, selectedAssignment.name);
                

                // Update progress
                set((state) => ({
                  cachingProgress: {
                    current: state.cachingProgress.current + 1,
                    total: state.cachingProgress.total,
                    isCaching: true,
                  },
                }));
              } catch (err) {
                console.warn(`Failed to cache PDF:`, err);
                // Still update progress even on error
                set((state) => ({
                  cachingProgress: {
                    current: state.cachingProgress.current + 1,
                    total: state.cachingProgress.total,
                    isCaching: true,
                  },
                }));
              }
            })
          );
        }
      }

      // Update cached assignments list
      try {
        const cached = await getCachedAssignments();
        set({ cachedAssignments: Array.isArray(cached) ? cached : [] });
      } catch (error) {
        console.error('Error updating cached assignments:', error);
      }
    } catch (error) {
      console.error('Error caching PDFs:', error);
    } finally {
      set({ cachingProgress: { current: 0, total: 0, isCaching: false } });
    }
  },

  // Get cached PDF blob URL
  getCachedPdfUrl: async (fileUrl) => {
    const cached = await getCachedPdf(fileUrl);
    if (cached) {
      return URL.createObjectURL(cached);
    }
    return null;
  },

  // Delete assignment cache
  deleteAssignmentCache: async (assignmentId) => {
    await deleteAssignmentCacheUtil(assignmentId);
    try {
      const cached = await getCachedAssignments();
      set({ cachedAssignments: Array.isArray(cached) ? cached : [] });
    } catch (error) {
      console.error('Error refreshing after delete:', error);
      set({ cachedAssignments: [] });
    }
  },

  // Clear all cache
  clearAllCache: async () => {
    await clearAllCacheUtil();
    set({ cachedAssignments: [] });
  },

  // Refresh cached assignments list
  refreshCachedAssignments: async () => {
    try {
      const cached = await getCachedAssignments();
      set({ cachedAssignments: Array.isArray(cached) ? cached : [] });
    } catch (error) {
      console.error('Error refreshing cached assignments:', error);
      set({ cachedAssignments: [] });
    }
  },

  // Fetch courses
  fetchCourses: async () => {
    const { apiToken, canvasApiBase } = get();
    if (!apiToken) {
      set({ error: 'API token not set' });
      return;
    }

    set({ loadingCourses: true, error: null });
    try {
      const params = new URLSearchParams({ apiToken });
      if (canvasApiBase) {
        params.append('canvasBase', canvasApiBase);
      }
      const response = await fetch(`${API_BASE}/api/courses?${params.toString()}`);
      if (!response.ok) {
        const errorText = await response.text().catch(() => null);
        let message = `Failed to fetch courses: ${response.status} ${response.statusText}`;
        if (errorText) {
          try {
            const errorData = JSON.parse(errorText);
            if (errorData?.error) {
              message = errorData.error;
            }
          } catch (parseError) {
            // if the response is HTML or non-JSON, include snippet
            message = `${message} - ${errorText.substring(0, 200)}`;
          }
        }
        throw new Error(message);
      }
      const requestUrl = response.headers.get('X-Canvas-Request-Url');
      const coursesDataText = await response.text();
      let courses;
      try {
        courses = JSON.parse(coursesDataText);
      } catch (parseError) {
        console.error('Failed to parse courses JSON:', coursesDataText.slice(0, 500));
        throw new Error('Canvas returned an unexpected response while loading courses. Check the Canvas base URL and token.');
      }
      // Server should already filter, but apply client-side filter as backup
      // Filter to only active courses (workflow_state: "available") that haven't ended
      const now = new Date();
      const activeCourses = courses.filter(course => {
        // Must be available (not deleted, completed, unpublished, etc.)
        if (course.workflow_state !== 'available') {
          return false;
        }
        
        // Filter by end date - only show courses that haven't ended yet
        // If no end date, include the course (assume it's active)
        if (course.term && course.term.end_at) {
          const endDate = new Date(course.term.end_at);
          // Include courses that haven't ended yet (end date is today or in the future)
          return now <= endDate;
        }
        
        // If no end date, include the course if workflow_state is available
        return true;
      });
      
      
      const dedupedCourses = dedupeById(activeCourses);
      set((state) => ({
        courses: dedupedCourses,
        loadingCourses: false,
        lastRequestUrls: {
          ...state.lastRequestUrls,
          courses: requestUrl,
        },
      }));
      
      // Auto-select saved course if it exists
      const currentState = get();
      const savedCourseId = currentState.selectedCourseId || localStorage.getItem('canvas_selected_course_id');
      if (savedCourseId && dedupedCourses.length > 0) {
        const savedCourse = dedupedCourses.find(c => String(c.id) === String(savedCourseId));
        if (savedCourse) {
          // Use setTimeout to avoid calling setState during render
          setTimeout(() => {
            get().selectCourse(savedCourse);
          }, 0);
        }
      }
    } catch (error) {
      set({ error: error.message, loadingCourses: false });
    }
  },

  // Select course and fetch assignments
  selectCourse: async (course) => {
    // Save course ID to localStorage
    if (course && course.id) {
      localStorage.setItem('canvas_selected_course_id', String(course.id));
      set({ selectedCourseId: String(course.id) });
    } else {
      localStorage.removeItem('canvas_selected_course_id');
      set({ selectedCourseId: null });
    }
    
    // Restore saved assignment group if available
    const savedGroupIdFromStorage = localStorage.getItem('canvas_selected_assignment_group_id');
    const savedGroupId = savedGroupIdFromStorage || 'all';
    
    set({
      selectedCourse: course,
      selectedAssignment: null,
      selectedSubmission: null,
      assignments: [],
      allAssignments: [],
      submissions: [],
      assignmentGroups: [],
      selectedAssignmentGroup: savedGroupId,
    });
    
    // Fetch assignment groups first - this will auto-select the saved group and fetch assignments
    await get().fetchAssignmentGroups(course.id);
    // If no saved group or saved group is 'all', fetch assignments now
    // (fetchAssignmentGroups will handle fetching if a specific group is saved)
    if (!savedGroupIdFromStorage || savedGroupIdFromStorage === 'all') {
      await get().fetchAssignments(course.id, 'all');
    }
  },

  // Fetch assignment groups for a course
  fetchAssignmentGroups: async (courseId) => {
    const { apiToken, canvasApiBase } = get();
    if (!apiToken) {
      set({ error: 'API token not set' });
      return;
    }

    try {
      const params = new URLSearchParams({ apiToken });
      if (canvasApiBase) {
        params.append('canvasBase', canvasApiBase);
      }
      const response = await fetch(`${API_BASE}/api/courses/${courseId}/assignment-groups?${params.toString()}`);
      if (!response.ok) {
        const errorText = await response.text().catch(() => null);
        let message = `Failed to fetch assignment groups: ${response.status} ${response.statusText}`;
        if (errorText) {
          try {
            const errorData = JSON.parse(errorText);
            if (errorData?.error) {
              message = errorData.error;
            }
          } catch (parseError) {
            message = `${message} - ${errorText.substring(0, 200)}`;
          }
        }
        throw new Error(message);
      }
      const requestUrl = response.headers.get('X-Canvas-Request-Url');
      const groupsText = await response.text();
      let groups;
      try {
        groups = JSON.parse(groupsText);
      } catch (parseError) {
        console.error('Failed to parse assignment groups JSON:', groupsText.slice(0, 500));
        throw new Error('Canvas returned an unexpected response while loading assignment groups.');
      }
      const dedupedGroups = dedupeById(Array.isArray(groups) ? groups : []);
      set((state) => ({
        assignmentGroups: dedupedGroups,
        lastRequestUrls: {
          ...state.lastRequestUrls,
          assignmentGroups: requestUrl,
        },
      }));
      
      // Auto-select saved assignment group if it exists
      const savedGroupId = localStorage.getItem('canvas_selected_assignment_group_id');
      if (savedGroupId) {
        if (savedGroupId === 'all') {
          // 'all' is always valid
          set({ selectedAssignmentGroup: 'all' });
          // Trigger assignment fetch with 'all'
          setTimeout(() => {
            get().fetchAssignments(courseId, 'all');
          }, 0);
        } else {
          // Check if saved group exists in the fetched groups
          const savedGroup = dedupedGroups.find(g => String(g.id) === String(savedGroupId));
          if (savedGroup) {
            // Use setTimeout to avoid calling setState during render
            setTimeout(() => {
              get().selectAssignmentGroup(savedGroup.id);
            }, 0);
          } else {
            // Saved group not found, default to 'all'
            set({ selectedAssignmentGroup: 'all' });
            setTimeout(() => {
              get().fetchAssignments(courseId, 'all');
            }, 0);
          }
        }
      }
    } catch (error) {
      set({ error: error.message });
    }
  },

  // Fetch assignments for a course
  fetchAssignments: async (courseId, groupOverride) => {
    const { apiToken, canvasApiBase, selectedAssignmentGroup } = get();
    if (!apiToken) {
      set({ error: 'API token not set' });
      return;
    }

    const groupId = groupOverride !== undefined ? groupOverride : selectedAssignmentGroup;

    set({ loadingAssignments: true, error: null });
    try {
      const params = new URLSearchParams({ apiToken });
      if (canvasApiBase) {
        params.append('canvasBase', canvasApiBase);
      }
      if (groupId && groupId !== 'all') {
        params.append('assignment_group_id', groupId);
      }
      const response = await fetch(`${API_BASE}/api/courses/${courseId}/assignments?${params.toString()}`);
      if (!response.ok) {
        const errorText = await response.text().catch(() => null);
        let message = `Failed to fetch assignments: ${response.status} ${response.statusText}`;
        if (errorText) {
          try {
            const errorData = JSON.parse(errorText);
            if (errorData?.error) {
              message = errorData.error;
            }
          } catch (parseError) {
            message = `${message} - ${errorText.substring(0, 200)}`;
          }
        }
        throw new Error(message);
      }
      const requestUrl = response.headers.get('X-Canvas-Request-Url');
      const assignmentsText = await response.text();
      let assignments;
      try {
        assignments = JSON.parse(assignmentsText);
      } catch (parseError) {
        console.error('Failed to parse assignments JSON:', assignmentsText.slice(0, 500));
        throw new Error('Canvas returned an unexpected response while loading assignments.');
      }
      const deduped = dedupeById(assignments);
      const filtered = filterAssignments(deduped, groupId || 'all');
      set((state) => ({
        assignments: filtered,
        allAssignments: deduped,
        loadingAssignments: false,
        lastRequestUrls: {
          ...state.lastRequestUrls,
          assignments: requestUrl,
        },
      }));
    } catch (error) {
      set({ error: error.message, loadingAssignments: false });
    }
  },

  // Select assignment and fetch submissions
  selectAssignment: async (assignment) => {
    const { selectedCourse } = get();
    if (!selectedCourse) {
      set({ error: 'No course selected' });
      return;
    }

    set({ selectedAssignment: assignment, selectedSubmission: null, submissions: [], allSubmissions: [], submissionIndex: 0 });
    await get().fetchSubmissions(selectedCourse.id, assignment.id);
  },

  // Change assignment group filter
  selectAssignmentGroup: async (groupId) => {
    const group = groupId || 'all';
    const { selectedCourse } = get();
    
    // Save assignment group ID to localStorage
    if (group && group !== 'all') {
      localStorage.setItem('canvas_selected_assignment_group_id', String(group));
    } else {
      localStorage.removeItem('canvas_selected_assignment_group_id');
    }
    
    set({ selectedAssignmentGroup: group });
    if (selectedCourse) {
      await get().fetchAssignments(selectedCourse.id, group);
    }
  },

  // Fetch submissions for an assignment
  fetchSubmissions: async (courseId, assignmentId) => {
    const { apiToken, canvasApiBase } = get();
    if (!apiToken) {
      set({ error: 'API token not set' });
      return;
    }

    set({ loadingSubmissions: true, error: null });
    try {
      const params = new URLSearchParams({ apiToken });
      if (canvasApiBase) {
        params.append('canvasBase', canvasApiBase);
      }
      const response = await fetch(`${API_BASE}/api/courses/${courseId}/assignments/${assignmentId}/submissions?${params.toString()}`);
      if (!response.ok) {
        const errorText = await response.text().catch(() => null);
        let message = `Failed to fetch submissions: ${response.status} ${response.statusText}`;
        if (errorText) {
          try {
            const errorData = JSON.parse(errorText);
            if (errorData?.error) {
              message = errorData.error;
            }
          } catch (parseError) {
            message = `${message} - ${errorText.substring(0, 200)}`;
          }
        }
        throw new Error(message);
      }
      const requestUrl = response.headers.get('X-Canvas-Request-Url');
      const submissionsText = await response.text();
      let submissions;
      try {
        submissions = JSON.parse(submissionsText);
      } catch (parseError) {
        console.error('Failed to parse submissions JSON:', submissionsText.slice(0, 500));
        throw new Error('Canvas returned an unexpected response while loading submissions.');
      }
      // Filter to only submissions with attachments (PDFs)
      const submissionsWithFiles = submissions.filter(sub => 
        sub.attachments && sub.attachments.length > 0
      );
      
      // Load rubric scores and staged grades from localStorage
      const rubricScores = getRubricScores(assignmentId);
      const stagedGrades = getStagedGrades(assignmentId);
      
      // Enrich submissions with graded status and rubric scores
      const enrichedSubmissions = submissionsWithFiles.map(sub => {
        const submissionId = String(sub.user_id || sub.id);
        const canvasGrade = sub.grade;
        const canvasScore = sub.score;
        
        // Check if submission is late
        const isLate = sub.late === true || (sub.submitted_at && sub.cached_due_date && 
                     new Date(sub.submitted_at) > new Date(sub.cached_due_date));
        
        // Check if graded in Canvas (but exclude auto-graded zeros)
        // A grade of "0" or score of 0 on a late submission typically means auto-graded and still needs manual grading
        const isAutoGradedZero = isLate && 
                                  (canvasGrade === "0" || canvasGrade === 0 || canvasScore === 0) && 
                                  !rubricScores[submissionId] && 
                                  !stagedGrades[submissionId];
        const isGradedInCanvas = (canvasGrade !== null && canvasGrade !== undefined) && !isAutoGradedZero;
        const hasRubricScore = rubricScores[submissionId] !== undefined;
        const hasStagedGrade = stagedGrades[submissionId] !== undefined;
        
        // Determine submission status
        const status = isLate ? 'late' : (isAutoGradedZero ? 'auto-graded' : null);
        
        return {
          ...sub,
          isGraded: isGradedInCanvas || hasRubricScore,
          canvasGrade: canvasGrade,
          canvasScore: canvasScore,
          rubricScore: rubricScores[submissionId] || null,
          stagedGrade: stagedGrades[submissionId] || null,
          isLate: isLate,
          status: status,
          isAutoGradedZero: isAutoGradedZero,
        };
      });
      
      const dedupedSubmissions = dedupeById(enrichedSubmissions);
      
      set((state) => ({
        allSubmissions: dedupedSubmissions, // Store unfiltered list for caching
        submissions: dedupedSubmissions, // Will be filtered by applySorting
        rubricScores: { ...state.rubricScores, [assignmentId]: rubricScores },
        stagedGrades: { ...state.stagedGrades, [assignmentId]: stagedGrades },
        loadingSubmissions: false,
        lastRequestUrls: {
          ...state.lastRequestUrls,
          submissions: requestUrl,
        },
      }));
      
      // Apply sorting (this will filter submissions for display)
      get().applySorting();
      
      // Auto-select first submission if available
      const { submissions: sortedSubmissions, selectedSubmission } = get();
      // Only auto-select if no submission is currently selected
      // or if the current selection is not in the filtered list
      if (sortedSubmissions.length > 0) {
        if (!selectedSubmission) {
          // No submission selected, select the first one
          get().selectSubmissionByIndex(0);
        } else {
          // Check if current selection is still in the filtered list
          const currentIndex = sortedSubmissions.findIndex(sub => 
            String(sub.user_id || sub.id) === String(selectedSubmission.user_id || selectedSubmission.id)
          );
          if (currentIndex < 0) {
            // Current selection was filtered out, select the first one
            get().selectSubmissionByIndex(0);
          }
        }
      }

      // Cache all PDFs in background if offline mode is enabled
      // Use allSubmissions (unfiltered) for caching, not the filtered list
      const { offlineMode, allSubmissions } = get();
      if (offlineMode && allSubmissions.length > 0) {
        get().cacheAllPdfs();
      }
    } catch (error) {
      set({ error: error.message, loadingSubmissions: false });
    }
  },

  // Select submission by index
  selectSubmissionByIndex: (index) => {
    const { submissions } = get();
    if (index >= 0 && index < submissions.length) {
      set({ selectedSubmission: submissions[index], submissionIndex: index });
    }
  },

  // Navigate to next submission
  nextSubmission: () => {
    const { submissionIndex, submissions } = get();
    if (submissionIndex < submissions.length - 1) {
      get().selectSubmissionByIndex(submissionIndex + 1);
    }
  },

  // Navigate to previous submission
  previousSubmission: () => {
    const { submissionIndex } = get();
    if (submissionIndex > 0) {
      get().selectSubmissionByIndex(submissionIndex - 1);
    }
  },

  // Save rubric score for current submission
  saveRubricScoreForSubmission: (score, feedback) => {
    const { selectedAssignment, selectedSubmission } = get();
    if (!selectedAssignment || !selectedSubmission) return;
    
    const submissionId = String(selectedSubmission.user_id || selectedSubmission.id);
    const scoreData = {
      score,
      feedback,
      timestamp: new Date().toISOString(),
    };
    
    // Save to localStorage
    saveRubricScore(selectedAssignment.id, submissionId, scoreData);
    
    // Update in-memory state
    set((state) => {
      const assignmentId = selectedAssignment.id;
      const newRubricScores = { ...state.rubricScores };
      if (!newRubricScores[assignmentId]) {
        newRubricScores[assignmentId] = {};
      }
      newRubricScores[assignmentId][submissionId] = scoreData;
      
      // Update submission in both filtered and unfiltered lists
      const updateSubmission = (sub) => {
        if (String(sub.user_id || sub.id) === submissionId) {
          return {
            ...sub,
            isGraded: true,
            rubricScore: scoreData,
          };
        }
        return sub;
      };
      
      const updatedSubmissions = state.submissions.map(updateSubmission);
      const updatedAllSubmissions = state.allSubmissions.map(updateSubmission);
      
      return {
        rubricScores: newRubricScores,
        submissions: updatedSubmissions,
        allSubmissions: updatedAllSubmissions,
      };
    });
    
    // Stage the grade (don't push to Canvas yet)
    stageGrade(selectedAssignment.id, submissionId, {
      grade: score.toString(),
      feedback,
    });
    
    // Update staged grades in state
    set((state) => {
      const assignmentId = selectedAssignment.id;
      const newStagedGrades = { ...state.stagedGrades };
      if (!newStagedGrades[assignmentId]) {
        newStagedGrades[assignmentId] = {};
      }
      newStagedGrades[assignmentId][submissionId] = {
        grade: score.toString(),
        feedback,
      };
      
      return { stagedGrades: newStagedGrades };
    });
    
    // Re-apply sorting to update the list
    get().applySorting();
  },

  // Set sort order
  setSortBy: (sortBy) => {
    set({ sortBy });
    get().applySorting();
  },

  // Apply sorting to submissions (for display only, doesn't affect allSubmissions)
  applySorting: () => {
    const { allSubmissions, sortBy } = get();
    if (!allSubmissions.length) return;
    
    // Start with all submissions, then filter/sort for display
    let sorted = [...allSubmissions];
    
    if (sortBy === 'ungraded') {
      // Show ungraded submissions (including auto-graded zeros)
      sorted = sorted.filter(sub => !sub.isGraded || sub.isAutoGradedZero);
    } else if (sortBy === 'graded') {
      // Show only fully graded (exclude auto-graded zeros)
      sorted = sorted.filter(sub => sub.isGraded && !sub.isAutoGradedZero);
    }
    // 'all' shows everything, no filter needed
    
    // Sort: ungraded first (including auto-graded zeros), then by student name
    sorted.sort((a, b) => {
      // First, prioritize ungraded (including auto-graded zeros)
      const aNeedsGrading = !a.isGraded || a.isAutoGradedZero;
      const bNeedsGrading = !b.isGraded || b.isAutoGradedZero;
      if (aNeedsGrading !== bNeedsGrading) {
        return aNeedsGrading ? -1 : 1;
      }
      // Then sort by student name
      const nameA = a.user?.name || a.user?.sortable_name || '';
      const nameB = b.user?.name || b.user?.sortable_name || '';
      return nameA.localeCompare(nameB);
    });
    
    set({ submissions: sorted });
    
    // Update selected submission index if needed
    const { selectedSubmission, submissionIndex } = get();
    if (selectedSubmission) {
      const newIndex = sorted.findIndex(sub => 
        String(sub.user_id || sub.id) === String(selectedSubmission.user_id || selectedSubmission.id)
      );
      if (newIndex >= 0 && newIndex !== submissionIndex) {
        set({ submissionIndex: newIndex });
      }
    }
  },

  // Push all staged grades to Canvas
  pushAllStagedGrades: async () => {
    const { selectedCourse, selectedAssignment, apiToken, canvasApiBase, stagedGrades } = get();
    if (!selectedCourse || !selectedAssignment || !apiToken) {
      set({ error: 'Missing required data for pushing grades' });
      return;
    }

    const assignmentId = selectedAssignment.id;
    const gradesToPush = stagedGrades[assignmentId] || {};
    
    if (Object.keys(gradesToPush).length === 0) {
      set({ error: 'No staged grades to push' });
      return;
    }

    set({ pushingGrades: true, error: null });
    
    try {
      const results = [];
      const errors = [];
      
      // Push all grades in parallel
      const pushPromises = Object.entries(gradesToPush).map(async ([submissionId, gradeData]) => {
        try {
          const response = await fetch(
            `${API_BASE}/api/courses/${selectedCourse.id}/assignments/${assignmentId}/submissions/${submissionId}`,
            {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                apiToken,
                posted_grade: gradeData.grade,
                comment: gradeData.feedback,
                canvasBase: canvasApiBase,
              }),
            }
          );

          if (!response.ok) {
            const errorText = await response.text().catch(() => null);
            let message = `Failed to submit grade for submission ${submissionId}: ${response.status} ${response.statusText}`;
            if (errorText) {
              try {
                const errorData = JSON.parse(errorText);
                if (errorData?.error) {
                  message = errorData.error;
                }
              } catch (parseError) {
                message = `${message} - ${errorText.substring(0, 200)}`;
              }
            }
            throw new Error(message);
          }

          const submissionText = await response.text();
          let updatedSubmission;
          try {
            updatedSubmission = JSON.parse(submissionText);
          } catch (parseError) {
            throw new Error('Failed to parse submission update response from server.');
          }
          
          results.push({ submissionId, submission: updatedSubmission });
        } catch (error) {
          errors.push({ submissionId, error: error.message });
        }
      });
      
      await Promise.all(pushPromises);
      
      // Clear staged grades for this assignment
      clearStagedGrades(assignmentId);
      
      // Update submissions in both filtered and unfiltered lists
      const { submissions, allSubmissions } = get();
      const updateSubmission = (sub) => {
        const submissionId = String(sub.user_id || sub.id);
        const pushedResult = results.find(r => String(r.submissionId) === submissionId);
        if (pushedResult) {
          return {
            ...sub,
            isGraded: true,
            canvasGrade: pushedResult.submission.grade,
            canvasScore: pushedResult.submission.score,
            stagedGrade: null,
          };
        }
        return sub;
      };
      
      const updatedSubmissions = submissions.map(updateSubmission);
      const updatedAllSubmissions = allSubmissions.map(updateSubmission);
      
      set((state) => ({
        submissions: updatedSubmissions,
        allSubmissions: updatedAllSubmissions,
        stagedGrades: {
          ...state.stagedGrades,
          [assignmentId]: {},
        },
        pushingGrades: false,
      }));
      
      // Re-apply sorting after pushing grades
      get().applySorting();
      
      if (errors.length > 0) {
        set({ 
          error: `Pushed ${results.length} grades successfully, but ${errors.length} failed. Check console for details.`,
        });
        console.error('Errors pushing grades:', errors);
      } else {
        set({ error: null });
      }
      
      return { results, errors };
    } catch (error) {
      set({ error: error.message, pushingGrades: false });
      throw error;
    }
  },

  // Submit grade and feedback to Canvas (immediate, not staged)
  submitGrade: async (grade, feedback) => {
    const { selectedCourse, selectedAssignment, selectedSubmission, apiToken, canvasApiBase } = get();
    if (!selectedCourse || !selectedAssignment || !selectedSubmission || !apiToken) {
      set({ error: 'Missing required data for submission' });
      return;
    }

    try {
      const response = await fetch(
        `${API_BASE}/api/courses/${selectedCourse.id}/assignments/${selectedAssignment.id}/submissions/${selectedSubmission.user_id}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            apiToken,
            posted_grade: grade,
            comment: feedback,
            canvasBase: canvasApiBase,
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text().catch(() => null);
        let message = `Failed to submit grade: ${response.status} ${response.statusText}`;
        if (errorText) {
          try {
            const errorData = JSON.parse(errorText);
            if (errorData?.error) {
              message = errorData.error;
            }
          } catch (parseError) {
            message = `${message} - ${errorText.substring(0, 200)}`;
          }
        }
        throw new Error(message);
      }

      const submissionText = await response.text();
      let updatedSubmission;
      try {
        updatedSubmission = JSON.parse(submissionText);
      } catch (parseError) {
        console.error('Failed to parse submission update JSON:', submissionText);
        throw new Error('Failed to parse submission update response from server.');
      }
      // Update the submission in both filtered and unfiltered lists
      const { submissions, allSubmissions } = get();
      const updateSubmission = (sub) => {
        if (String(sub.user_id || sub.id) === String(updatedSubmission.user_id || updatedSubmission.id)) {
          return {
            ...sub,
            isGraded: true,
            canvasGrade: updatedSubmission.grade,
            canvasScore: updatedSubmission.score,
          };
        }
        return sub;
      };
      
      const updatedSubmissions = submissions.map(updateSubmission);
      const updatedAllSubmissions = allSubmissions.map(updateSubmission);
      set({ submissions: updatedSubmissions, allSubmissions: updatedAllSubmissions });
      return updatedSubmission;
    } catch (error) {
      set({ error: error.message });
      throw error;
    }
  },
}));

export default useCanvasStore;

