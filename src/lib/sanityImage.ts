import { createImageUrlBuilder } from '@sanity/image-url';
import type { SanityImageSource } from '@sanity/image-url/lib/types/types';
import { getSanityClient } from './sanity';

const client = getSanityClient();
const builder = client ? createImageUrlBuilder(client) : null;

/** Auto-format, max-fit image URL (or null in scaffolding mode / missing source). */
export function urlFor(source: SanityImageSource | undefined | null): string | null {
  if (!builder || !source) return null;
  return builder.image(source).auto('format').fit('max').url();
}

/** Width-constrained variant for responsive images. */
export function urlForWidth(
  source: SanityImageSource | undefined | null,
  width: number,
): string | null {
  if (!builder || !source) return null;
  return builder.image(source).auto('format').fit('max').width(width).url();
}
