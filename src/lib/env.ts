/**
 * Unified env access for on-demand (SSR) routes.
 *
 * On Cloudflare, per-request secrets/bindings live on `locals.runtime.env` —
 * they are NOT on `process.env` and secret-typed vars are not inlined into the
 * bundle. During `astro dev` (and for build-inlined PUBLIC_/config values) they
 * come through `import.meta.env`. Merge both, with the runtime env winning.
 */
export interface AppEnv {
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  PUBLIC_STRIPE_PUBLISHABLE_KEY?: string;
  SANITY_PROJECT_ID?: string;
  SANITY_DATASET?: string;
  SANITY_API_VERSION?: string;
  SANITY_READ_TOKEN?: string;
  SANITY_WRITE_TOKEN?: string;
  SANITY_WEBHOOK_SECRET?: string;
  EMAIL_API_KEY?: string;
  [key: string]: string | undefined;
}

export function getEnv(locals: unknown): AppEnv {
  const runtimeEnv =
    (locals as { runtime?: { env?: Record<string, string> } } | undefined)?.runtime?.env ?? {};
  return { ...(import.meta.env as unknown as AppEnv), ...runtimeEnv };
}
