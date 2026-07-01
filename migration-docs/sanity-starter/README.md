# Sanity schema starter — Wake the Nile

Drop-in starter content model for the new site. Written for **Sanity Studio 5.x** using the
`defineType` / `defineField` API. Adjust field-by-field as needed.

> **Design principle: templatized, not a page builder.** Every type here exposes *content* fields
> only — titles, subtitles, body, images, dates, links. There are no color/spacing/alignment/layout
> controls. A `page` picks a fixed `template` (developer-built layout) and the client fills in
> content; a `fullScreenSection` is content for a section, not a design surface. New look = new
> template, built by the developer. This is the deliberate fix for what made WordPress/Gutenberg
> unusable for the client.

## Files

```
sanity.config.ts                  # Studio config + structure (singletons)
schemaTypes/
  index.ts                        # registers every type
  objects/
    seo.ts                        # reusable SEO/meta object
    blockContent.ts               # Portable Text config (body content)
    fullScreenSection.ts          # the 100vh section primitive
    socialLink.ts                 # platform + url
  documents/
    siteSettings.ts               # singleton: nav, socials, default SEO, analytics
    page.ts                       # page = fixed template + content sections (Music, Connect, songs…)
    post.ts                       # blog post (v2 — deferred)
    show.ts                       # tour date (replaces ACF `show` + Show Fields blocks)
    video.ts                      # video for the coverflow slider (replaces ACF `video`)
    release.ts                    # album/single hub (v2 — deferred: Spotify + presale)
    product.ts                    # optional self-hosted merch product
```

## Install (reference)

```bash
npm create sanity@latest -- --template clean --typescript
# then copy schemaTypes/ and sanity.config.ts in, and:
npm i @sanity/image-url
```

## Notes

- The **show date** was a free-text ACF string (`d/m/Y g:i a`) in WordPress. Here it's a real
  `datetime`. When importing the 3 sample shows, parse the old string into ISO.
- The **Google Map** ACF field (`{lat,lng}`) becomes a `geopoint` (`location`).
- **Video files** are NOT stored in Sanity — store the playback URL / Cloudflare Stream ID on the
  `video` (and `release`) documents; upload the actual files to your video host.
- `page` selects a fixed `template` (developer-built layout) and holds an array of
  `fullScreenSection` **content** blocks — that's how "one big 100vh section per page" is authored
  without giving the client any design control. The template, not the editor, decides how a section
  looks.
- Singletons (`siteSettings`) are enforced in `sanity.config.ts` structure + a documentId.
