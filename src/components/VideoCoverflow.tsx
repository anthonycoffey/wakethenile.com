import { useEffect, useRef, useState } from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { EffectCoverflow, Navigation, Pagination } from 'swiper/modules';
import type { Swiper as SwiperClass } from 'swiper';
import type { CoverflowItem } from '../lib/coverflow';

import 'swiper/css';
import 'swiper/css/effect-coverflow';
import 'swiper/css/navigation';
import 'swiper/css/pagination';

interface Props {
  videos: CoverflowItem[];
}

export default function VideoCoverflow({ videos }: Props) {
  const videoRefs = useRef<Array<HTMLVideoElement | null>>([]);
  const [muted, setMuted] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  // Gate the reveal on Swiper finishing init. Until then the carousel is a
  // left-aligned, untransformed strip; showing it would flash and then jump to
  // the centered coverflow layout (a Cumulative Layout Shift). We keep Swiper
  // at opacity:0 over a poster skeleton and cross-fade once it's laid out.
  const [ready, setReady] = useState(false);
  // Mirror `muted` in a ref so the (per-render) video ref callback applies the
  // CURRENT state instead of hard-resetting to muted — otherwise paginating to
  // a new slide re-mutes it right after we unmute.
  const mutedRef = useRef(true);

  // Sync muted state to DOM imperatively — React's muted prop doesn't re-apply on updates.
  useEffect(() => {
    mutedRef.current = muted;
    videoRefs.current.forEach((vid) => {
      if (vid) vid.muted = muted;
    });
  }, [muted]);

  const syncPlayback = (active: number) => {
    videoRefs.current.forEach((vid, i) => {
      if (!vid) return;
      if (i === active) {
        vid.muted = mutedRef.current;
        const p = vid.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } else {
        vid.pause();
        vid.currentTime = 0;
      }
    });
  };

  const handleSlideChange = (swiper: SwiperClass) => {
    setActiveIndex(swiper.realIndex);
    syncPlayback(swiper.realIndex);
  };

  const unmute = () => {
    // Unmute AND play the active video synchronously inside the tap gesture.
    // Browsers only allow audible playback when it's initiated by the gesture
    // itself — deferring the unmute to a React effect gets the video paused by
    // the autoplay policy (no video, no audio). Setting mutedRef first also
    // stops the per-render ref callback from re-muting it.
    mutedRef.current = false;
    const vid = videoRefs.current[activeIndex];
    if (vid) {
      vid.muted = false;
      const p = vid.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    }
    setMuted(false);
  };

  useEffect(() => {
    syncPlayback(activeIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!videos || videos.length === 0) {
    return <p style={{ color: 'var(--muted)', textAlign: 'center' }}>No videos yet.</p>;
  }

  return (
    <div className={`coverflow${ready ? ' is-ready' : ''}`}>
      {/* Reserved-height stage: occupies the carousel's final footprint from
          first paint so hydration adds zero layout shift. The skeleton fills it
          until Swiper reveals over the top. */}
      <div className="coverflow__stage">
        <div className="coverflow__skeleton" aria-hidden="true">
          {videos.slice(0, 3).map((v, i) => (
            <div
              key={v.id}
              className={`coverflow__skeleton-card${i === 0 ? ' is-center' : ''}`}
              // Poster as a background image, not an <img>: a background is
              // painted, never laid out, so it can't shift the card as it loads
              // (an unsized <img> here was a CLS culprit). The card's size comes
              // from aspect-ratio below, independent of the image.
              style={v.poster ? { backgroundImage: `url("${v.poster}")` } : undefined}
            />
          ))}
        </div>
      <Swiper
        modules={[EffectCoverflow, Navigation, Pagination]}
        effect="coverflow"
        grabCursor
        centeredSlides
        slidesPerView="auto"
        loop={false}
        navigation
        pagination={{ clickable: true }}
        coverflowEffect={{ rotate: 20, stretch: 0, depth: 150, modifier: 1, slideShadows: false }}
        onSlideChange={handleSlideChange}
        onSwiper={(s) => {
          setActiveIndex(s.realIndex);
          // Init is done and the coverflow transform is applied — reveal now,
          // so the fade-in shows the already-centered layout (no visible jump).
          setReady(true);
        }}
      >
        {videos.map((v, i) => (
          <SwiperSlide key={v.id} className="coverflow__slide">
            <div className={`coverflow__media${i === activeIndex ? ' is-active' : ''}`}>
              {v.streamSrc ? (
                <iframe
                  src={v.streamSrc}
                  title={v.title}
                  allow="autoplay; fullscreen"
                  loading="lazy"
                />
              ) : (
                <video
                  ref={(el) => {
                    videoRefs.current[i] = el;
                    if (el) el.muted = mutedRef.current;
                  }}
                  src={v.src}
                  poster={v.poster}
                  loop
                  playsInline
                  preload={i === activeIndex ? 'auto' : 'none'}
                  onCanPlay={(e) => {
                    if (i === activeIndex) {
                      // Play with the current audio state — so a slide that
                      // finishes loading while active also comes in with sound
                      // once the user has unmuted.
                      e.currentTarget.muted = mutedRef.current;
                      const p = e.currentTarget.play();
                      if (p && typeof p.catch === 'function') p.catch(() => {});
                    }
                  }}
                />
              )}
              {muted && !v.streamSrc && i === activeIndex && (
                <button className="coverflow__unmute swiper-no-swiping" onClick={unmute} type="button" aria-label="Unmute video">
                  <svg viewBox="0 0 24 24" fill="currentColor" width="46" height="46" aria-hidden="true">
                    <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
                  </svg>
                  <span>Tap to Unmute</span>
                </button>
              )}
            </div>
            {v.title && <p className="coverflow__title">{v.title}</p>}
          </SwiperSlide>
        ))}
      </Swiper>
      </div>

      <style>{`
        .coverflow {
          width: 100%;
          padding: 1rem 0 2.5rem;
          /* Shared sizing so the skeleton and the real slides occupy an
             identical footprint. --media-h drives the reserved stage height. */
          --slide-w: min(68vw, 360px);
          --media-h: calc(var(--slide-w) * 16 / 9);
        }
        /* Fixed-height stage: reserves the carousel's final footprint from the
           first paint, so Swiper hydrating over the top shifts nothing in flow
           (CLS = 0). Swiper and skeleton are both absolutely positioned inside. */
        .coverflow__stage {
          position: relative;
          height: calc(var(--media-h) + 6.5rem);
        }
        .coverflow .swiper {
          position: absolute;
          inset: 0;
          padding: 1rem 0 3rem;
          overflow: hidden;
          /* Hidden until Swiper reports init complete — hides the pre-init
             left-aligned strip and the jump to the centered coverflow. */
          opacity: 0;
          transition: opacity 0.5s ease;
        }
        .coverflow.is-ready .swiper {
          opacity: 1;
        }
        /* Vertically center the slide row within the (slightly taller) stage. */
        .coverflow .swiper-wrapper {
          align-items: center;
        }
        .coverflow__slide {
          width: var(--slide-w);
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        /* Poster skeleton — a static mock of the coverflow (dimmed side cards
           flanking a bright centre) that holds the space and reads as the media
           already loading. Cross-fades out as Swiper fades in. */
        .coverflow__skeleton {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          padding-bottom: 2rem;
          opacity: 1;
          transition: opacity 0.5s ease;
        }
        .coverflow.is-ready .coverflow__skeleton {
          opacity: 0;
          pointer-events: none;
        }
        .coverflow__skeleton-card {
          flex: 0 0 auto;
          width: var(--slide-w);
          aspect-ratio: 9 / 16;
          border-radius: 14px;
          overflow: hidden;
          background-color: #0a0a0a;
          background-size: cover;
          background-position: center;
          background-repeat: no-repeat;
          border: 1px solid var(--border);
        }
        .coverflow__skeleton-card.is-center {
          order: 2;
          z-index: 2;
          box-shadow: 0 12px 40px rgba(0,0,0,0.55);
        }
        .coverflow__skeleton-card:not(.is-center) {
          filter: brightness(0.5);
          transform: scale(0.88);
          margin-inline: calc(var(--slide-w) * -0.3);
        }
        .coverflow__skeleton-card:not(.is-center):first-child { order: 1; }
        .coverflow__skeleton-card:not(.is-center):last-child { order: 3; }
        @media (prefers-reduced-motion: no-preference) {
          .coverflow:not(.is-ready) .coverflow__skeleton-card {
            animation: coverflow-pulse 1.4s ease-in-out infinite;
          }
        }
        @keyframes coverflow-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.72; }
        }
        .coverflow__media {
          position: relative;
          width: 100%;
          aspect-ratio: 9 / 16;
          border-radius: 14px;
          overflow: hidden;
          background: #000;
          border: 1px solid var(--border);
          filter: brightness(0.5);
          transition: filter 0.35s ease;
        }
        .coverflow__media.is-active {
          filter: brightness(1);
          box-shadow: 0 12px 40px rgba(0,0,0,0.55);
        }
        .coverflow__media video,
        .coverflow__media iframe {
          width: 100%;
          height: 100%;
          object-fit: cover;
          background: #000;
          border: 0;
          display: block;
        }
        /* Dead-center tap control. Not full-cover, so dragging elsewhere on the
           video still swipes; the swiper-no-swiping class lets the tap fire
           through Swiper's touch handling (which otherwise swallows clicks). */
        .coverflow__unmute {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.55rem;
          padding: 1.1rem 1.6rem;
          background: transparent;
          color: #fff;
          border: none;
          cursor: pointer;
          font-family: inherit;
          font-size: 0.82rem;
          font-weight: 700;
          letter-spacing: 1px;
          text-transform: uppercase;
          text-shadow: 0 2px 10px rgba(0,0,0,0.75);
        }
        .coverflow__unmute svg {
          filter: drop-shadow(0 2px 10px rgba(0,0,0,0.65));
        }
        .coverflow__unmute:hover svg { opacity: 0.85; }
        .coverflow__title {
          margin: 0.85rem 0 0;
          color: var(--text);
          font-weight: 700;
        }
        .coverflow .swiper-button-next,
        .coverflow .swiper-button-prev {
          color: var(--accent);
        }
        .coverflow .swiper-pagination-bullet {
          background: var(--muted);
        }
        .coverflow .swiper-pagination-bullet-active {
          background: var(--accent);
        }
      `}</style>
    </div>
  );
}
