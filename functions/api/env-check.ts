/**
 * TEMPORARY diagnostic — reports which env keys the running Pages Function can
 * see (presence booleans + key names only, never values). Remove after we
 * confirm the Preview environment is wired correctly.
 */
export const onRequestGet = async (context: { env: Record<string, unknown> }): Promise<Response> => {
  const env = context.env || {};
  const expected = [
    'SANITY_PROJECT_ID',
    'SANITY_DATASET',
    'SANITY_API_VERSION',
    'SANITY_READ_TOKEN',
    'SANITY_WRITE_TOKEN',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'PUBLIC_STRIPE_PUBLISHABLE_KEY',
    'EMAIL_API_KEY',
    'NODE_VERSION',
  ];
  const present = Object.fromEntries(expected.map((k) => [k, Boolean(env[k])]));
  const allKeys = Object.keys(env).sort();
  return new Response(JSON.stringify({ present, allKeys }, null, 2), {
    headers: { 'content-type': 'application/json' },
  });
};
