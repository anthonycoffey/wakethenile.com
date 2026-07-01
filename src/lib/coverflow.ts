import { urlFor } from './sanityImage';
import type { Video } from './types';

export interface CoverflowItem {
  id: string;
  title: string;
  /** Direct video file URL (R2/MP4) when source === 'url'. */
  src?: string;
  /** Cloudflare Stream iframe URL when source === 'stream'. */
  streamSrc?: string;
  poster?: string;
}

/**
 * Resolve raw Sanity `video` docs into plain, serializable props for the
 * React coverflow island. Poster URLs are built server-side here because the
 * hydrated client has no Sanity credentials.
 */
export function toCoverflowItems(videos: Video[]): CoverflowItem[] {
  return (videos ?? []).map((v) => {
    const poster = urlFor(v.poster) ?? undefined;
    if (v.source === 'stream' && v.streamId) {
      return {
        id: v._id,
        title: v.title ?? '',
        streamSrc: `https://iframe.cloudflarestream.com/${v.streamId}?muted=true&autoplay=true&loop=true&controls=false`,
        poster,
      };
    }
    return {
      id: v._id,
      title: v.title ?? '',
      src: v.videoUrl ?? undefined,
      poster,
    };
  });
}
