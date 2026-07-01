/**
 * GROQ queries for the static build. All authorable docs filter out drafts
 * with `!(_id in path("drafts.**"))` so unpublished content never ships.
 */

const NOT_DRAFT = `!(_id in path("drafts.**"))`;

/* Shared projections */
const SEO = `seo{metaTitle, metaDescription, ogImage, noIndex}`;
const PAGE = `{
  title, "slug": slug.current, isHome,
  coverImage,
  overlay{enabled, color, opacity, duotone},
  heading, subheading, ctaLabel, ctaHref,
  ${SEO}
}`;

export const siteSettingsQuery = `*[_type == "siteSettings" && _id == "siteSettings"][0]{
  title, tagline, logo,
  nav[]{label, href},
  socials[]{platform, url},
  defaultSeo{metaTitle, metaDescription, ogImage, noIndex},
  analytics{ga4Id, cloudflareToken},
  footerText
}`;

export const allPageSlugsQuery = `*[_type == "page" && ${NOT_DRAFT} && defined(slug.current) && isHome != true]{
  "slug": slug.current
}`;

export const homePageQuery = `*[_type == "page" && ${NOT_DRAFT} && isHome == true][0]${PAGE}`;

export const pageBySlugQuery = `*[_type == "page" && ${NOT_DRAFT} && slug.current == $slug][0]${PAGE}`;

export const showsPageQuery = `*[_type == "page" && _id == "page-shows"][0]${PAGE}`;

export const videosQuery = `*[_type == "video" && ${NOT_DRAFT}] | order(order asc){
  _id, title, source, streamId, videoUrl, poster, order
}`;

export const upcomingShowsQuery = `*[_type == "show" && ${NOT_DRAFT} && dateTime(date) >= dateTime(now())] | order(date asc){
  _id, title, date, venueName, city, state, ticketsUrl, ticketsLabel, location, soldOut
}`;

export const pastShowsQuery = `*[_type == "show" && ${NOT_DRAFT} && dateTime(date) < dateTime(now())] | order(date desc){
  _id, title, date, venueName, city, state, ticketsUrl, ticketsLabel, location, soldOut
}`;

/* ---- Merch / commerce ---- */

const VARIANT = `{ label, sku, price, stock }`;

// Grid card: enough to render a tile + a derived "from" price and stock state.
export const allProductsQuery = `*[_type == "product" && ${NOT_DRAFT} && active == true] | order(title asc){
  _id, title, "slug": slug.current, images, price, soldOut,
  "category": category->title, tags,
  variants[]${VARIANT},
  "fromPrice": coalesce(price, math::min(variants[].price)),
  "inStock": soldOut != true && (
    count(variants) == 0 || count(variants[coalesce(stock, 0) > 0]) > 0
  )
}`;

export const productBySlugQuery = `*[_type == "product" && ${NOT_DRAFT} && slug.current == $slug][0]{
  _id, title, "slug": slug.current, images, description, price, soldOut, active, taxCode,
  variants[]${VARIANT},
  ${SEO}
}`;

// Only need slugs of purchasable products for getStaticPaths.
export const allProductSlugsQuery = `*[_type == "product" && ${NOT_DRAFT} && active == true && defined(slug.current)]{
  "slug": slug.current
}`;

// Optional cover for the /shop landing (reuses the COVER `page` model).
export const shopPageQuery = `*[_type == "page" && (slug.current == "shop" || _id == "page-shop")][0]${PAGE}`;

export const commerceSettingsQuery = `*[_type == "commerceSettings" && _id == "commerceSettings"][0]{
  currency, allowedShippingCountries, defaultTaxCode, enableTax, lowStockThreshold, storeEnabled,
  shippingRates[]{ label, amount, taxCode, taxBehavior }
}`;

// Server-side authoritative lookup for checkout validation (fresh price + stock).
export const productsForCheckoutQuery = `*[_type == "product" && ${NOT_DRAFT} && _id in $ids]{
  _id, title, price, taxCode, active, soldOut, "image": images[0],
  variants[]{ label, sku, price, stock }
}`;
