/**
 * Download the shows cover image from the live WP site and create the page-shows
 * Sanity document with a configurable cover image + dark overlay.
 * Run: node --env-file=.env scripts/patch-shows.mjs
 */
import { createClient } from '@sanity/client';
import { createWriteStream, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import https from 'node:https';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const projectId = process.env.SANITY_PROJECT_ID;
const dataset = process.env.SANITY_DATASET || 'production';
const token = process.env.SANITY_WRITE_TOKEN;

if (!projectId || !token) {
  console.error('Missing SANITY_PROJECT_ID or SANITY_WRITE_TOKEN.');
  process.exit(1);
}

const client = createClient({ projectId, dataset, token, apiVersion: '2026-03-01', useCdn: false });

async function download(url, dest) {
  if (existsSync(dest)) { console.log(`  cached: ${dest}`); return; }
  console.log(`  downloading ${url}`);
  const file = createWriteStream(dest);
  await new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        download(res.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
      file.on('error', reject);
    }).on('error', reject);
  });
}

async function main() {
  const imgPath = resolve(ROOT, '_archive/img-staging/shows-cover.jpg');
  await download(
    'https://wakethenile.com/wp-content/uploads/2025/01/IMA07168-1-scaled.jpg',
    imgPath,
  );

  console.log('Uploading shows cover image to Sanity…');
  const { createReadStream } = await import('node:fs');
  const asset = await client.assets.upload('image', createReadStream(imgPath), {
    filename: 'shows-cover.jpg',
  });

  const coverImage = { _type: 'image', asset: { _type: 'reference', _ref: asset._id } };

  console.log('Creating/updating page-shows document…');
  await client.createOrReplace({
    _id: 'page-shows',
    _type: 'page',
    title: 'Shows',
    slug: { _type: 'slug', current: 'shows' },
    isHome: false,
    coverImage,
    overlay: { enabled: true, color: '#212121', opacity: 0.5 },
    seo: { metaDescription: 'Wake the Nile — upcoming shows and tour dates.' },
  });

  console.log('✓ Done.');
}

main().catch((err) => { console.error(err.message); process.exit(1); });
