import type { SanityImageSource } from '@sanity/image-url/lib/types/types';

export interface SeoFields {
  metaTitle?: string;
  metaDescription?: string;
  ogImage?: SanityImageSource;
  noIndex?: boolean;
}

export interface NavItem {
  label?: string;
  href?: string;
}

export interface SocialLink {
  platform?: string;
  url?: string;
}

export interface SiteSettings {
  title?: string;
  tagline?: string;
  logo?: SanityImageSource;
  /** When false, the Merch link is hidden from the site navigation. */
  merchEnabled?: boolean;
  nav?: NavItem[];
  socials?: SocialLink[];
  defaultSeo?: SeoFields;
  analytics?: { ga4Id?: string; cloudflareToken?: string };
  footerText?: string;
}

export interface Overlay {
  enabled?: boolean;
  color?: string;
  opacity?: number;
  duotone?: boolean;
}

/** Cover page — single full-screen section. */
export interface Page {
  title?: string;
  slug?: string;
  isHome?: boolean;
  coverImage?: SanityImageSource;
  overlay?: Overlay;
  heading?: string;
  subheading?: string;
  ctaLabel?: string;
  ctaHref?: string;
  seo?: SeoFields;
}

export interface Video {
  _id: string;
  title?: string;
  source?: 'stream' | 'url';
  streamId?: string;
  videoUrl?: string;
  poster?: SanityImageSource;
  order?: number;
}

export interface Geopoint {
  lat: number;
  lng: number;
  alt?: number;
}

export interface Show {
  _id: string;
  title?: string;
  date?: string;
  venueName?: string;
  city?: string;
  state?: string;
  ticketsUrl?: string;
  ticketsLabel?: string;
  location?: Geopoint;
  soldOut?: boolean;
}

/* ---- Merch / commerce ---- */

export interface ProductVariant {
  label?: string;
  sku?: string;
  /** Overrides the product base price when set. */
  price?: number;
  /** Units on hand; auto-decrements on sale. */
  stock?: number;
}

export interface Product {
  _id: string;
  title?: string;
  slug?: string;
  images?: SanityImageSource[];
  description?: unknown[];
  /** Base price (USD). Variants may override per-option. */
  price?: number;
  /** Base stock (units) for products with no variants; 0 = sold out. */
  stock?: number;
  /** Stripe Tax product tax code; falls back to the store default. */
  taxCode?: string;
  variants?: ProductVariant[];
  /** Dereferenced category title (for /merch filters). */
  category?: string;
  tags?: string[];
  seo?: SeoFields;
}

/** Extra fields projected onto grid cards by `allProductsQuery`. */
export interface ProductCardData extends Product {
  fromPrice?: number;
  inStock?: boolean;
}

export interface ShippingRate {
  label?: string;
  amount?: number;
  taxCode?: string;
  taxBehavior?: 'exclusive' | 'inclusive';
}

export interface CommerceSettings {
  currency?: string;
  allowedShippingCountries?: string[];
  defaultTaxCode?: string;
  lowStockThreshold?: number;
  storeEnabled?: boolean;
  shippingRates?: ShippingRate[];
}

/** A line in the client-side cart (localStorage). */
export interface CartItem {
  productId: string;
  slug: string;
  title: string;
  sku: string;
  variantLabel?: string;
  unitPrice: number;
  qty: number;
  image?: string;
}
