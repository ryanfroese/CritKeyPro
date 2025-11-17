# Cloudflare Deployment Guide

This guide walks you through deploying CritKey Pro to Cloudflare Pages (frontend) and Cloudflare Workers (backend proxy).

## Prerequisites

1. A Cloudflare account (free tier works fine)
2. Node.js 18+ installed
3. Git repository connected to GitHub (for Cloudflare Pages)

## Architecture Overview

CritKey Pro uses a two-part serverless architecture:

- **Frontend (Cloudflare Pages)**: React app built with Vite
- **Worker (Cloudflare Workers)**: TypeScript-based CORS proxy for Canvas API

## Part 1: Deploy the Cloudflare Worker

The Worker acts as a CORS-enabled proxy for Canvas API requests.

### 1.1 Install Dependencies

```bash
cd worker
npm install
```

### 1.2 Authenticate with Cloudflare

```bash
npx wrangler login
```

This will open your browser to authenticate. Grant Wrangler access to your Cloudflare account.

### 1.3 Update Worker Name (Optional)

Edit `worker/wrangler.toml` to customize your Worker name:

```toml
name = "critkey-worker"  # Change this to your preferred name
```

### 1.4 Deploy the Worker

```bash
npm run deploy
```

After deployment, Wrangler will show your Worker URL:
```
Published critkey-worker
  https://critkey-worker.YOUR_ACCOUNT.workers.dev
```

**Save this URL** - you'll need it for the frontend configuration.

### 1.5 Configure Environment Variables (Optional)

If your Canvas instance is not `cos.instructure.com`, update the `CANVAS_BASE` variable:

**Option A: Edit wrangler.toml**
```toml
[vars]
CANVAS_BASE = "https://your-canvas-instance.com/api/v1"
```

**Option B: Set in Cloudflare Dashboard**
1. Go to Workers & Pages → Your Worker → Settings → Variables
2. Add environment variable: `CANVAS_BASE` = `https://your-canvas-instance.com/api/v1`
3. Click "Save and Deploy"

## Part 2: Deploy the Frontend to Cloudflare Pages

### 2.1 Push to GitHub

Ensure your code is pushed to GitHub:

```bash
git add .
git commit -m "Configure for Cloudflare deployment"
git push origin cloudflare-workers  # Or your branch name
```

### 2.2 Create Cloudflare Pages Project

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to **Workers & Pages** → **Create application** → **Pages**
3. Click **Connect to Git**
4. Select your GitHub repository
5. Configure the build:
   - **Project name**: `critkey-pro` (or your preferred name)
   - **Production branch**: `cloudflare-workers` (or `main` if you've merged)
   - **Build command**: `npm run build`
   - **Build output directory**: `rubric-grader/dist`

### 2.3 Set Environment Variables

Before deploying, add the Worker URL as an environment variable:

1. In the Pages setup screen, expand **Environment variables**
2. Add a new variable:
   - **Variable name**: `VITE_WORKER_URL`
   - **Value**: `https://critkey-worker.YOUR_ACCOUNT.workers.dev` (from Part 1.4)
3. Click **Save and Deploy**

### 2.4 Wait for Build

Cloudflare Pages will build and deploy your app. This takes 2-5 minutes.

Once complete, you'll see your app URL:
```
https://critkey-pro.pages.dev
```

## Part 3: Test Your Deployment

1. Visit your Cloudflare Pages URL
2. Click **Connect to Canvas** in the side panel
3. Enter your Canvas API token (get from Canvas → Account → Settings → New Access Token)
4. Enter your Canvas base URL (e.g., `https://cos.instructure.com`)
5. Select a course and assignment
6. Test grading a submission

## Troubleshooting

### "Failed to fetch" errors

**Cause**: Frontend can't reach the Worker.

**Solution**: Verify `VITE_WORKER_URL` is set correctly:
1. Go to Cloudflare Pages → Your project → Settings → Environment variables
2. Check that `VITE_WORKER_URL` matches your Worker URL
3. Redeploy if you made changes

### CORS errors

**Cause**: Worker CORS headers not configured.

**Solution**: The Worker already includes CORS headers. If you're still seeing errors:
1. Check browser console for the exact error
2. Verify the Worker is deployed and accessible
3. Test the Worker directly: `https://YOUR-WORKER.workers.dev/api/courses` (should return 401 without token)

### Canvas API errors

**Cause**: Invalid Canvas API token or base URL.

**Solution**:
1. Generate a new Canvas API token (Account → Settings → New Access Token)
2. Verify your Canvas base URL (usually `https://INSTITUTION.instructure.com`)
3. Check Worker logs in Cloudflare dashboard for detailed errors

### Worker not found (404)

**Cause**: Worker name mismatch or not deployed.

**Solution**:
1. Run `cd worker && npm run deploy` again
2. Verify the Worker name in `wrangler.toml` matches your deployment
3. Update `VITE_WORKER_URL` if the Worker name changed

## Custom Domain (Optional)

### For Cloudflare Pages:
1. Go to Pages → Your project → Custom domains
2. Click **Set up a custom domain**
3. Enter your domain and follow DNS instructions

### For Worker:
1. Go to Workers & Pages → Your Worker → Settings → Triggers
2. Click **Add Custom Domain**
3. Enter your subdomain (e.g., `api.yourdomain.com`)
4. Update frontend `VITE_WORKER_URL` to use the custom domain
5. Redeploy Pages with the new environment variable

## Local Development

### Two-Terminal Setup

**Terminal 1 - Worker:**
```bash
cd worker
npm run dev  # Runs on http://localhost:8787
```

**Terminal 2 - Frontend:**
```bash
npm run dev  # Runs on http://localhost:5173
```

The frontend auto-detects `localhost` and uses `http://localhost:8787` for the Worker URL.

### Environment Variables (Local)

**Worker** (`worker/.dev.vars`):
```bash
# Optional: Override Canvas base URL
CANVAS_BASE=https://your-canvas-instance.com/api/v1
```

**Frontend** (`rubric-grader/.env`):
```bash
# Not needed for local dev (auto-detects localhost:8787)
# Only needed if testing with a deployed Worker locally
# VITE_WORKER_URL=https://critkey-worker.YOUR_ACCOUNT.workers.dev
```

## Cost Estimate

**Cloudflare Free Tier:**
- **Pages**: Unlimited sites, 500 builds/month
- **Workers**: 100,000 requests/day, no egress fees
- **Bandwidth**: First 10 GB free, then $0.02/GB (Workers), unlimited for Pages

**Typical usage** (1 course, 30 students, 5 assignments):
- ~1,500 Worker requests/week (well within free tier)
- ~500 MB bandwidth/week (easily within free tier)

**Cost**: $0/month for most users

## Updating Your Deployment

### Update Worker:
```bash
cd worker
git pull
npm install
npm run deploy
```

### Update Frontend:
1. Push changes to GitHub
2. Cloudflare Pages auto-deploys on push (if configured)
3. Or manually redeploy from Cloudflare dashboard

## Support

For issues with:
- **CritKey Pro**: [GitHub Issues](https://github.com/Chokichi/CritKey/issues)
- **Cloudflare Workers**: [Cloudflare Docs](https://developers.cloudflare.com/workers/)
- **Cloudflare Pages**: [Cloudflare Docs](https://developers.cloudflare.com/pages/)
