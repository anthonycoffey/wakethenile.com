import { createClient, type SanityClient } from '@sanity/client';
import type { AppEnv } from './env';

/**
 * Server-side Sanity client built from the request env (not module-load
 * `import.meta.env`). Uses `useCdn: false` for fresh reads — important for
 * stock/price validation at checkout. Pass `{ write: true }` for mutations
 * (order creation, stock decrement) which require SANITY_WRITE_TOKEN.
 */
export function getSanityServerClient(
  env: AppEnv,
  opts: { write?: boolean } = {},
): SanityClient | null {
  const projectId = env.SANITY_PROJECT_ID;
  if (!projectId) return null;
  return createClient({
    projectId,
    dataset: env.SANITY_DATASET ?? 'production',
    apiVersion: env.SANITY_API_VERSION ?? '2026-03-01',
    token: opts.write ? env.SANITY_WRITE_TOKEN : env.SANITY_READ_TOKEN,
    useCdn: false,
  });
}
