/**
 * Seed the Wake the Nile Sanity dataset to mirror the live site exactly.
 * Run:  node --env-file=.env scripts/seed.mjs
 * Idempotent: deterministic _ids + createOrReplace.
 */
import { createClient } from '@sanity/client';
import { createReadStream, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const IMG = resolve(ROOT, '_archive/img-staging');
const VID = resolve(ROOT, '_archive/video-optimized');

const projectId = process.env.SANITY_PROJECT_ID;
const dataset = process.env.SANITY_DATASET || 'production';
const token = process.env.SANITY_WRITE_TOKEN;
const R2 = (process.env.PUBLIC_R2_VIDEO_BASE || '/videos').replace(/\/$/, '');

if (!projectId || !token) {
  console.error('Missing SANITY_PROJECT_ID or SANITY_WRITE_TOKEN.');
  process.exit(1);
}
const client = createClient({ projectId, dataset, token, apiVersion: '2026-03-01', useCdn: false });

const key = (() => { let n = 0; return () => `k${(n++).toString(36)}${Date.now().toString(36).slice(-3)}`; })();

async function upload(dir, filename) {
  const path = resolve(dir, filename);
  if (!existsSync(path)) { console.warn(`  ! missing image: ${filename}`); return undefined; }
  const asset = await client.assets.upload('image', createReadStream(path), { filename });
  return { _type: 'image', asset: { _type: 'reference', _ref: asset._id } };
}

async function main() {
  console.log(`Seeding ${projectId}/${dataset} …`);

  console.log('Uploading cover images + posters…');
  const homeCover = await upload(IMG, 'home-cover.jpg');
  const musicCover = await upload(IMG, 'music-cover.jpg');
  const connectCover = await upload(IMG, 'connect-cover.jpg');
  const posters = {
    'champion-ff1': await upload(VID, 'champion-ff1-poster.jpg'),
    'champion-ff2': await upload(VID, 'champion-ff2-poster.jpg'),
    'champion-ff3': await upload(VID, 'champion-ff3-poster.jpg'),
    mercy: await upload(VID, 'mercy-poster.jpg'),
  };

  const docs = [];

  // Site settings: nav + real social profiles
  docs.push({
    _id: 'siteSettings',
    _type: 'siteSettings',
    title: 'Wake the Nile',
    nav: [
      { _key: key(), label: 'Music', href: '/music' },
      { _key: key(), label: 'Videos', href: '/videos' },
      { _key: key(), label: 'Connect', href: '/connect' },
      { _key: key(), label: 'Shows', href: '/shows' },
    ],
    socials: [
      { _key: key(), platform: 'Instagram', url: 'https://www.instagram.com/wakethenile/' },
      { _key: key(), platform: 'Spotify', url: 'https://open.spotify.com/artist/338CYOqZUdguUfJdw4EM8d' },
      { _key: key(), platform: 'Facebook', url: 'https://www.facebook.com/profile.php?id=61565037302694' },
      { _key: key(), platform: 'TikTok', url: 'https://www.tiktok.com/@wakethenile' },
      { _key: key(), platform: 'YouTube', url: 'https://www.youtube.com/@WakeTheNile' },
    ],
    defaultSeo: { metaDescription: 'Wake the Nile — official site. Music, videos, and live shows.' },
    footerText: 'Follow Us on Social Media',
  });

  // Home (wordmark cover)
  docs.push({
    _id: 'page-home', _type: 'page', title: 'Home', slug: { _type: 'slug', current: 'home' },
    isHome: true,
    ...(homeCover ? { coverImage: homeCover } : {}),
    overlay: { enabled: true, color: '#000000', opacity: 0.7 },
    seo: { metaDescription: 'Wake the Nile — official site.' },
  });

  // Music (cover page: heading + Spotify CTA, light overlay)
  docs.push({
    _id: 'page-music', _type: 'page', title: 'Music', slug: { _type: 'slug', current: 'music' },
    isHome: false,
    ...(musicCover ? { coverImage: musicCover } : {}),
    overlay: { enabled: true, color: '#000000', opacity: 0.2 },
    heading: 'Listen to our new single “Mercy”',
    ctaLabel: 'Click Here',
    ctaHref: 'https://open.spotify.com/track/29AKOzxWFXpR312arV8K9O',
    seo: { metaDescription: 'Listen to the latest from Wake the Nile.' },
  });

  // Connect (cover page: CONNECT heading + Contact CTA, gold-tint overlay)
  docs.push({
    _id: 'page-connect', _type: 'page', title: 'Connect', slug: { _type: 'slug', current: 'connect' },
    isHome: false,
    ...(connectCover ? { coverImage: connectCover } : {}),
    overlay: { enabled: true, color: '#ddae2d', opacity: 0.35 },
    heading: 'Connect',
    ctaLabel: 'Contact Us',
    ctaHref: '/contact-us',
    seo: { metaDescription: 'Connect with Wake the Nile.' },
  });

  // Videos (4 real clips on Pages static at /videos/*.mp4)
  const videoDefs = [
    { slug: 'champion-ff1', title: 'Champion (FF1)', order: 0 },
    { slug: 'champion-ff2', title: 'Champion (FF2)', order: 1 },
    { slug: 'champion-ff3', title: 'Champion (FF3)', order: 2 },
    { slug: 'mercy', title: 'Mercy', order: 3 },
  ];
  for (const v of videoDefs) {
    docs.push({
      _id: `video-${v.slug}`, _type: 'video', title: v.title,
      source: 'url', videoUrl: `${R2}/${v.slug}.mp4`,
      ...(posters[v.slug] ? { poster: posters[v.slug] } : {}),
      order: v.order,
    });
  }

  // Shows — placeholder sample data (future-dated so "upcoming" is populated)
  const shows = [
    { id: 'show-austin', title: 'Austin Blues Fest', date: '2026-07-18T02:00:00.000Z', venueName: 'The Far Out Lounge', city: 'Austin', state: 'TX', location: { _type: 'geopoint', lat: 30.2076, lng: -97.766 } },
    { id: 'show-nola', title: 'New Orleans Jazz Fest', date: '2026-08-22T23:00:00.000Z', venueName: 'Fair Grounds Race Course', city: 'New Orleans', state: 'LA', location: { _type: 'geopoint', lat: 29.9799, lng: -90.0782 } },
    { id: 'show-chicago', title: 'Lollapalooza', date: '2026-09-05T01:00:00.000Z', venueName: 'Grant Park', city: 'Chicago', state: 'IL', location: { _type: 'geopoint', lat: 41.8742, lng: -87.6196 } },
  ];
  for (const s of shows) {
    docs.push({
      _id: s.id, _type: 'show', title: s.title, date: s.date,
      venueName: s.venueName, city: s.city, state: s.state,
      ticketsUrl: 'https://www.ticketmaster.com', ticketsLabel: 'Get Tickets',
      location: s.location, soldOut: false,
    });
  }

  // Remove stale page docs from the old schema (champion/mercy/privacy/old music)
  const stale = ['page-champion', 'page-mercy', 'page-privacy-policy'];

  console.log(`Writing ${docs.length} documents…`);
  let tx = client.transaction();
  for (const d of docs) tx = tx.createOrReplace(d);
  for (const id of stale) { tx = tx.delete(id); tx = tx.delete(`drafts.${id}`); }
  await tx.commit();
  console.log('✓ Seed complete.');
}

main().catch((err) => { console.error('Seed failed:', err.message); process.exit(1); });
