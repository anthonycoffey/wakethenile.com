import { toHTML, type PortableTextHtmlComponents } from '@portabletext/to-html';
import { urlFor } from './sanityImage';

const components: Partial<PortableTextHtmlComponents> = {
  types: {
    image: ({ value }) => {
      const url = urlFor(value);
      if (!url) return '';
      const alt = (value?.alt as string) ?? '';
      return `<img src="${url}" alt="${alt}" loading="lazy" />`;
    },
    embed: ({ value }) => {
      const url = value?.url as string | undefined;
      if (!url) return '';
      const caption = value?.caption as string | undefined;
      return `<figure class="embed"><iframe src="${url}" loading="lazy" allowfullscreen></iframe>${
        caption ? `<figcaption>${caption}</figcaption>` : ''
      }</figure>`;
    },
  },
  marks: {
    link: ({ children, value }) => {
      const href = (value?.href as string) ?? '#';
      const blank = value?.blank as boolean | undefined;
      const rel = blank ? ' target="_blank" rel="noopener"' : '';
      return `<a href="${href}"${rel}>${children}</a>`;
    },
  },
};

/** Render Portable Text body to an HTML string (empty string when missing). */
export function renderPortableText(value: unknown): string {
  if (!value) return '';
  try {
    return toHTML(value as never, { components });
  } catch {
    return '';
  }
}
