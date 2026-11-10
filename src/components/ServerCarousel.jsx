import { useState, useEffect, useRef } from 'preact/hooks';
import { useReducedMotion } from 'motion/react';
import sizes from 'virtual:image-sizes';

// Every image dropped into src/assets/serverImages is picked up
// automatically at build time. Captions come from any .json file in the same
// directory mapping filename -> description, and the order images are listed
// in there is the order they show; anything not listed follows, sorted by
// filename.
const descriptions = Object.assign(
  {},
  ...Object.values(import.meta.glob('../assets/serverImages/*.json', { eager: true, import: 'default' }))
);
const listed = Object.keys(descriptions);
const rank = (name) => (listed.includes(name) ? listed.indexOf(name) : listed.length);

const images = Object.entries(
  import.meta.glob('../assets/serverImages/*.{png,jpg,jpeg,webp,gif}', { eager: true, import: 'default' })
)
  .map(([path, src]) => ({ name: path.split('/').pop(), src }))
  .sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name))
  .map(({ name, src }) => ({ src, desc: descriptions[name] || '', size: sizes[name] ?? null }));

function ZoomIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.35-4.35M11 8v6M8 11h6" />
    </svg>
  );
}

/**
 * Player builds, rotating: the SMP card's picture on the landing page. Card
 * size, so no arrows or dots; it advances on its own (not for visitors who
 * asked for less motion), pauses under the pointer, swipes on touch, and a
 * click opens the lightbox.
 */
export function ServerCarousel() {
  const still = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const touchX = useRef(null);
  const swiped = useRef(false);
  const dialogRef = useRef(null);

  useEffect(() => {
    if (still || paused || zoomed || images.length < 2) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % images.length), 5000);
    return () => clearInterval(id);
  }, [still, paused, zoomed]);

  // showModal() puts the lightbox in the browser's top layer, above any
  // ancestor transforms that would otherwise trap a position:fixed overlay.
  useEffect(() => {
    if (!zoomed) return;
    const dlg = dialogRef.current;
    dlg?.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
      if (dlg?.open) dlg.close();
    };
  }, [zoomed]);

  if (images.length === 0) return null;

  const go = (dir) => setIndex((i) => (i + dir + images.length) % images.length);

  return (
    <div
      class="carousel carousel--banner"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (touchX.current == null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        if (Math.abs(dx) > 40) {
          go(dx < 0 ? 1 : -1);
          swiped.current = true;
        }
        touchX.current = null;
      }}
    >
      <div class="carousel-track" style={{ transform: `translateX(-${index * 100}%)` }}>
        {images.map(({ src, desc, size }, i) => (
          <button
            key={src}
            type="button"
            class="carousel-slide-btn"
            tabIndex={i === index ? 0 : -1}
            onClick={() => {
              if (swiped.current) {
                swiped.current = false;
                return;
              }
              setZoomed(true);
            }}
            aria-label={`Enlarge Chromabit screenshot ${i + 1}`}
          >
            <img
              class="carousel-slide"
              src={src}
              alt={desc || `Chromabit screenshot ${i + 1}`}
              width={size?.[0]}
              height={size?.[1]}
              loading="lazy"
              decoding="async"
            />
            {desc && <span class="carousel-caption">{desc}</span>}
          </button>
        ))}
      </div>

      <span class="carousel-zoom-hint"><ZoomIcon /> Click to enlarge</span>


      {zoomed && (
        <dialog
          ref={dialogRef}
          class="lightbox"
          aria-label={`Chromabit screenshot ${index + 1}`}
          onClose={() => setZoomed(false)}
          onClick={(e) => { if (e.target === e.currentTarget) setZoomed(false); }}
        >
          <button type="button" class="lightbox-close" aria-label="Close" onClick={() => setZoomed(false)}>×</button>
          <figure class="lightbox-figure">
            <img
              class="lightbox-img"
              src={images[index].src}
              alt={images[index].desc || `Chromabit screenshot ${index + 1}`}
            />
            {images[index].desc && <span class="lightbox-caption">{images[index].desc}</span>}
          </figure>
        </dialog>
      )}
    </div>
  );
}
