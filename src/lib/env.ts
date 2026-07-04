/**
 * Deploy-environment helpers for the Cloudflare Pages build.
 *
 * Cloudflare injects `CF_PAGES_BRANCH` into the build environment. A build of
 * the production branch (`main`) is the live site; every other branch is a
 * preview deploy. Local `astro dev` / `astro build` has no `CF_PAGES_BRANCH`,
 * which we treat as a preview so local work always sees the full site.
 */

/** The Git branch Cloudflare Pages treats as the production deploy. */
const PRODUCTION_BRANCH = 'main';

/** The branch Cloudflare Pages is currently building, if any. */
const deployBranch = import.meta.env.CF_PAGES_BRANCH;

/**
 * `true` only for the live production deploy (a Pages build of the production
 * branch). Preview branch builds and local builds are `false`.
 */
export const isProductionDeploy = deployBranch === PRODUCTION_BRANCH;

/**
 * `true` on preview branch deploys and local builds — anywhere that isn't the
 * live production site.
 */
export const isPreviewDeploy = !isProductionDeploy;
