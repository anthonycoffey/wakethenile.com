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
    <div className="coverflow">
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
        onSwiper={(s) => setActiveIndex(s.realIndex)}
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
                  preload="auto"
                  onCanPlay={(e) => {
                    if (i === activeIndex) {
                      const p = e.currentTarget.play();
                      if (p && typeof p.catch === 'function') p.catch(() => {});
                    }
                  }}
                />
              )}
              {muted && !v.streamSrc && i === activeIndex && (
                <button className="coverflow__unmute" onClick={unmute} type="button" aria-label="Unmute video">
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

      <style>{`
        .coverflow {
          width: 100%;
          padding: 1rem 0 2.5rem;
        }
        .coverflow .swiper {
          padding: 1rem 0 3rem;
          overflow: hidden;
        }
        .coverflow__slide {
          width: min(68vw, 360px);
          display: flex;
          flex-direction: column;
          align-items: center;
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
        /* Full-cover, dead-center tap target — the whole video unmutes. */
        .coverflow__unmute {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.55rem;
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
