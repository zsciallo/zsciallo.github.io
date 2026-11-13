import { cropFrame } from '../lib/imageCrop';
import imageCrops from '../data/imageCrops.json';

/**
 * A store image, cropped to its art when src/data/imageCrops.json has an entry
 * for it: a clipping frame with the art's aspect ratio, `size` px on its larger
 * side's height (the width follows, capped at the container), the full canvas
 * placed inside it. With no entry it is the bare <img> exactly as before.
 * `--crop-h` carries that height for browsers without aspect-ratio (index.css).
 * `slot` wraps a cropped image in an extra box (the cart's 40px thumbnail).
 */
export function CropImage({ src, size, slot, class: cls, ...rest }) {
  const crop = cropFrame(src, imageCrops);
  if (!crop) return <img class={cls} src={src} alt="" {...rest} />;
  const [bw, bh] = crop.frame.aspectRatio.split('/').map(Number);
  const frame = (
    <span class="crop-frame" data-crop-frame style={{ ...crop.frame, width: `min(100%, ${Math.round((size * bw / bh) * 100) / 100}px)`, '--crop-h': `${size}px` }}>
      <img class={cls} src={src} alt="" data-cropped="true" style={crop.img} {...rest} />
    </span>
  );
  return slot ? <span class={slot}>{frame}</span> : frame;
}
