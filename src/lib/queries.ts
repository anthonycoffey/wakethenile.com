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
