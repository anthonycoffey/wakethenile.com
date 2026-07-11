import type { CartLineOption } from './types';

/**
 * Customer-selectable options for the bundle products that include a tee.
 *
 * Both bundles ship with a tee, but the customer must tell us WHICH tee
 * (Obuntu vs Champion) and what SIZE. That choice doesn't change the bundle
 * price or stock — it's a fulfillment annotation — so we model it as a per-line
 * `options` array rather than a Sanity variant. See ADR 0007.
 *
 * Keyed by Sanity product _id. If a bundle product is ever recreated with a new
 * id, update the key here. The checkout Pages Function
 * (functions/api/checkout.ts) keeps a mirrored allow-list for server-side
 * validation — keep the two in sync (it lives in a separate Workers bundle and
 * can't import this module).
 */
export interface OptionGroup {
  /** Display + stored option name, e.g. "Tee" or "Size". */
  name: string;
  /** Allowed values, in display order. */
  values: string[];
}

const TEE_AND_SIZE: OptionGroup[] = [
  { name: 'Tee', values: ['Obuntu Tee', 'Champion Tee'] },
  { name: 'Size', values: ['S', 'M', 'L', 'XL', 'XXL'] },
];

export const BUNDLE_OPTION_GROUPS: Record<string, OptionGroup[]> = {
  // Ultimate Fan Experience (sold on /superfans)
  'b351d11f-4c78-4a1f-b36b-c10d951c96ea': TEE_AND_SIZE,
  // Ultimate Fan Merch Bundle (sold on /merch/merch-bundle)
  'ca04e096-228b-4bee-a28b-46829ed68ecf': TEE_AND_SIZE,
};

/** Option groups for a product, or `undefined` if it has no bundle options. */
export function bundleOptionGroupsFor(productId: string): OptionGroup[] | undefined {
  return BUNDLE_OPTION_GROUPS[productId];
}

/** Compact one-line summary of chosen options, e.g. "Champion Tee · L". */
export function formatOptions(options: CartLineOption[] | undefined): string {
  if (!options?.length) return '';
  return options.map((o) => o.value).join(' · ');
}
