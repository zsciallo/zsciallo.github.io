import { useState } from 'preact/hooks';
import { iconUrl } from '../../lib/market';

// A handful of materials have no vendored sprite. Rather than a broken image,
// they get a tinted tile keyed off the material id, which stays stable between
// renders and is at least distinguishable in a list.
function hue(id) {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) % 360;
  return h;
}

export function ItemIcon({ item, size = 34 }) {
  const [failed, setFailed] = useState(false);
  const style = `width:${size}px;height:${size}px`;

  // A pool can trade a custom item with no sprite to point at, and says so with
  // a null id rather than a URL that is known to 404.
  if (failed || !item.id) {
    const h = hue(item.id ?? item.materialName);
    return (
      <span class="item-icon item-icon--glyph" style={`${style};background:hsl(${h} 45% 22%);color:hsl(${h} 70% 78%)`}
        aria-hidden="true">
        {item.materialName.slice(0, 2).toUpperCase()}
      </span>
    );
  }

  return (
    <img class="item-icon" style={style} src={iconUrl(item.id)} alt="" loading="lazy"
      width={size} height={size} onError={() => setFailed(true)} />
  );
}
