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
