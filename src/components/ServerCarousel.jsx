import { useState, useEffect, useRef } from 'preact/hooks';

// Every image dropped into src/assets/serverImages is picked up
// automatically at build time, sorted by filename.
const images = Object.entries(
  import.meta.glob('../assets/serverImages/*.{png,jpg,jpeg,webp,gif}', { eager: true, import: 'default' })
)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([, src]) => src);

export function ServerCarousel() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchX = useRef(null);

  useEffect(() => {
    if (paused || images.length < 2) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % images.length), 5000);
    return () => clearInterval(id);
  }, [paused]);

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
        if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
        touchX.current = null;
      }}
    >
      <div class="carousel-track" style={{ transform: `translateX(-${index * 100}%)` }}>
        {images.map((src, i) => (
          <img
            key={src}
            class="carousel-slide"
            src={src}
            alt={`Chromabit SMP screenshot ${i + 1}`}
            loading={i === 0 ? 'eager' : 'lazy'}
          />
        ))}
      </div>

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
    </div>
  );
}
