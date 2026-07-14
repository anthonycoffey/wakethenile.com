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

// The bundles now include TWO tees — the customer picks a style + size for
// each (so: two of one style, or one of each). Keep the group NAMES in lockstep
// with the mirrored allow-list in functions/api/checkout.ts.
const TEE_VALUES = ['Obuntu Tee (Red)', 'Champion Tee (Black)'];
const SIZES = ['S', 'M', 'L', 'XL', 'XXL'];

const TWO_TEES: OptionGroup[] = [
  { name: 'Tee #1', values: TEE_VALUES },
  { name: 'Size #1', values: SIZES },
  { name: 'Tee #2', values: TEE_VALUES },
  { name: 'Size #2', values: SIZES },
];

export const BUNDLE_OPTION_GROUPS: Record<string, OptionGroup[]> = {
  // VIP Fan Experience (sold on /superfans)
  'b351d11f-4c78-4a1f-b36b-c10d951c96ea': TWO_TEES,
  // Ultimate Fan Merch Bundle (sold on /merch/merch-bundle)
  'ca04e096-228b-4bee-a28b-46829ed68ecf': TWO_TEES,
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
