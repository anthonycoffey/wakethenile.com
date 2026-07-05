import { sanityFetch } from './sanity';
import { commerceSettingsQuery } from './queries';
import { isPreviewDeploy } from './env';
import type { CommerceSettings } from './types';

export interface StoreStatus {
  /** True when the storefront should be shown / accept orders. */
  open: boolean;
  /** The commerce settings behind the decision (for maintenance copy, etc.). */
  settings: CommerceSettings | null;
}

/**
 * Whether the storefront is open, plus the commerce settings behind it.
 *
 * `storeEnabled` on the `commerceSettings` singleton is the single source of
 * truth for the store. When it's `false` the live site enters maintenance mode
 * (nav link hidden, store pages show the maintenance page, checkout refused).
 *
 * Preview branch and local builds always report open (via `isPreviewDeploy`)
 * so the store can be reviewed before launch — mirroring the nav behaviour in
 * BaseLayout. Note: this build-time override does not reach the checkout
 * function, which honours `storeEnabled` strictly at runtime.
 */
export async function getStoreStatus(): Promise<StoreStatus> {
  const settings = await sanityFetch<CommerceSettings | null>(commerceSettingsQuery, {}, null);
  const open = isPreviewDeploy || settings?.storeEnabled !== false;
  return { open, settings };
}
