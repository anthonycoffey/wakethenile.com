import { createClient, type SanityClient } from '@sanity/client';

const projectId = import.meta.env.SANITY_PROJECT_ID ?? '';
const dataset = import.meta.env.SANITY_DATASET ?? 'production';
const apiVersion = import.meta.env.SANITY_API_VERSION ?? '2026-03-01';
const token = import.meta.env.SANITY_READ_TOKEN;

/**
 * Returns a configured Sanity client, or `null` when no projectId is set.
 * The null-guard keeps scaffolding / CI builds from crashing before the
 * project is wired up (mirrors the 24hrcarunlocking.com pattern).
 */
export function getSanityClient(): SanityClient | null {
  if (!projectId) return null;
  return createClient({
    projectId,
    dataset,
    apiVersion,
    token,
    // Use the CDN for anonymous reads; bypass it when a token is present
    // so drafts/fresh content are visible at build time.
    useCdn: !token,
  });
}

/**
 * Fetch helper that tolerates a missing client (returns the provided
 * fallback instead of throwing), so pages can render in scaffolding mode.
 */
export async function sanityFetch<T>(
  query: string,
  params: Record<string, unknown> = {},
  fallback: T,
): Promise<T> {
  const client = getSanityClient();
  if (!client) return fallback;
  // Retry transient CDN/network failures before falling back to empty — a
  // single blip during the build otherwise ships a contentless page.
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await client.fetch<T>(query, params);
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  console.error('[sanity] query failed after 3 attempts:', lastErr);
  return fallback;
}
