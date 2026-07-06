import { useEffect, useRef, useState } from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { EffectCoverflow, Navigation, Pagination } from 'swiper/modules';
import type { Swiper as SwiperClass } from 'swiper';
import type { CoverflowItem } from '../lib/coverflow';

import 'swiper/css';
import 'swiper/css/effect-coverflow';
import 'swiper/css/navigation';
import 'swiper/css/pagination';
// Imported (not a runtime <style>) so these land in the render-blocking <head>
// stylesheet and apply at first paint — critical for CLS (see VideoCoverflow.css).
import './VideoCoverflow.css';

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
    </div>
  );
}
