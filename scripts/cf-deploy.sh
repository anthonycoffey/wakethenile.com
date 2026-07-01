#!/usr/bin/env bash
# Cloudflare R2 (video hosting) + Pages (site) deploy for Wake the Nile.
# Prereq: `npx wrangler login` completed.
# Run from repo root:  bash scripts/cf-deploy.sh
set -euo pipefail

BUCKET="wakethenile-media"
PAGES_PROJECT="wakethenile"
VID_DIR="_archive/video-optimized"

echo "== 1. Verify auth =="
npx wrangler whoami

echo "== 2. Create R2 bucket (idempotent) =="
npx wrangler r2 bucket create "$BUCKET" 2>&1 | tail -2 || echo "(bucket may already exist — continuing)"

echo "== 3. Enable public dev URL on the bucket =="
npx wrangler r2 bucket dev-url enable "$BUCKET" 2>&1 | tail -5 || true

echo "== 4. Upload the 4 compressed videos =="
for v in champion-ff1 champion-ff2 champion-ff3 mercy; do
  echo "  -> $v.mp4"
  npx wrangler r2 object put "$BUCKET/$v.mp4" \
    --file "$VID_DIR/$v.mp4" \
    --content-type "video/mp4" \
    --remote 2>&1 | tail -1
done

cat <<'NOTE'

== NEXT (manual, needs the public URL) ==
1. Copy the bucket's public dev URL printed in step 3
   (looks like: https://pub-XXXXXXXX.r2.dev).
2. Set it in .env:   PUBLIC_R2_VIDEO_BASE=https://pub-XXXX.r2.dev
3. Re-seed video docs:  node --env-file=.env scripts/seed.mjs
4. Rebuild:  npm run build
5. Deploy to Pages:
     npx wrangler pages project create wakethenile --production-branch main || true
     npx wrangler pages deploy dist --project-name wakethenile
NOTE
