# ⚠️ DEPRECATED: Express Server

This Express server has been **replaced by Cloudflare Workers** as of the `cloudflare-workers` branch.

## Why Deprecated?

The Express server (`server.js`) has been migrated to a **Cloudflare Worker** (`worker/src/index.ts`) for the following reasons:

1. **Serverless deployment**: No need to maintain a server instance
2. **Better bandwidth**: 300 GB/month free tier (vs 100 GB on Vercel)
3. **Lower latency**: Edge computing with global distribution
4. **Zero maintenance**: No server updates or monitoring required
5. **Cost-effective**: Free for most usage patterns

## Migration Path

If you're using this Express server, please migrate to the Cloudflare Worker:

### 1. Switch to the `cloudflare-workers` branch

```bash
git checkout cloudflare-workers
```

### 2. Set up the Cloudflare Worker

```bash
cd worker
npm install
npx wrangler login
npm run deploy
```

### 3. Update environment variables

Set `VITE_WORKER_URL` to your deployed Worker URL in:
- Cloudflare Pages dashboard (production)
- `rubric-grader/.env` (local development - optional)

### 4. Remove Express server dependencies (optional)

The Worker is a drop-in replacement. You can safely delete the `server/` directory after confirming everything works.

## What Changed?

The Worker implements the **exact same API endpoints** as the Express server:

- ✅ All Canvas API endpoints preserved
- ✅ Grade format conversion logic identical
- ✅ PDF proxying maintained
- ✅ CORS headers configured
- ✅ Request pagination supported

**No frontend changes required** - the Worker is API-compatible.

## Documentation

See **[CLOUDFLARE_SETUP.md](../CLOUDFLARE_SETUP.md)** for complete deployment instructions.

## Questions?

Open an issue on GitHub if you have questions about the migration.
