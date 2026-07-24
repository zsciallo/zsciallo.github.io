import { useState, useEffect, useRef } from 'preact/hooks';

// Every image dropped into src/assets/serverImages is picked up
// automatically at build time, sorted by filename.
const images = Object.entries(
  import.meta.glob('../assets/serverImages/*.{png,jpg,jpeg,webp,gif}', { eager: true, import: 'default' })
)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([, src]) => src);

function ZoomIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.35-4.35M11 8v6M8 11h6" />
    </svg>
  );
}

export function ServerCarousel() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const touchX = useRef(null);
  const swiped = useRef(false);
  const dialogRef = useRef(null);

  useEffect(() => {
    if (paused || zoomed || images.length < 2) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % images.length), 5000);
    return () => clearInterval(id);
  }, [paused, zoomed]);

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
      class="carousel reveal"
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
        {images.map((src, i) => (
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
            aria-label={`Enlarge Chromabit SMP screenshot ${i + 1}`}
          >
            <img
              class="carousel-slide"
              src={src}
              alt={`Chromabit SMP screenshot ${i + 1}`}
              loading={i === 0 ? 'eager' : 'lazy'}
            />
          </button>
        ))}
      </div>

      <span class="carousel-zoom-hint"><ZoomIcon /> Click to enlarge</span>

      {images.length > 1 && (
        <>
          <button class="carousel-arrow prev" onClick={() => go(-1)} aria-label="Previous image">‹</button>
          <button class="carousel-arrow next" onClick={() => go(1)} aria-label="Next image">›</button>
          <div class="carousel-dots">
            {images.map((_, i) => (
              <button
                key={i}
                class={`carousel-dot${i === index ? ' active' : ''}`}
                onClick={() => setIndex(i)}
                aria-label={`Go to image ${i + 1}`}
              />
            ))}
          </div>
        </>
      )}

      {zoomed && (
        <dialog
          ref={dialogRef}
          class="lightbox"
          aria-label={`Chromabit SMP screenshot ${index + 1}`}
          onClose={() => setZoomed(false)}
          onClick={(e) => { if (e.target === e.currentTarget) setZoomed(false); }}
        >
          <button type="button" class="lightbox-close" aria-label="Close" onClick={() => setZoomed(false)}>×</button>
          <img
            class="lightbox-img"
            src={images[index]}
            alt={`Chromabit SMP screenshot ${index + 1}`}
          />
        </dialog>
      )}
    </div>
  );
}
