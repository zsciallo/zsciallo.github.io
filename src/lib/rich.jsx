// The site's tiny inline markup (faq.json answers, wiki pages): **bold**, `code` and [text](href).
// Anything else is plain text, so no raw HTML can reach the page; plainAnswer() in
// src/data/seo.js strips the same marks for head tags and JSON-LD.
const TOKEN = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
// The wiki adds {{icon:material}}: a 20 px sprite. Only when a resolver is passed (the FAQ passes none).
const WIKI_TOKEN = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\)|\{\{icon:[^}]*\}\})/g;

/**
 * `text` as Preact children. `icon(material)` (wiki only) returns { src, width, height } or null; an
 * icon token with a material outside [a-z0-9_] stays text, a material without a sprite renders nothing.
 */
export function rich(text, icon = null) {
  return text.split(icon ? WIKI_TOKEN : TOKEN).map((part, i) => {
    if (!part) return null;
    if (part.startsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`')) return <code key={i}>{part.slice(1, -1)}</code>;
    if (icon && part.startsWith('{{icon:')) {
      const name = part.slice(7, -2);
      if (!/^[a-z0-9_]+$/.test(name)) return part;
      const pic = icon(name);
      return pic ? <img key={i} class="wiki-sprite" src={pic.src} alt="" width="20" height="20" loading="lazy" decoding="async" /> : null;
    }
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    // Only site paths, anchors and https links; any other target (javascript:, data:, http:, //host) shows its label as text.
    if (link && !/^(\/(?!\/)|#|https:\/\/)/.test(link[2])) return link[1];
    if (link) {
      const external = /^https?:/.test(link[2]);
      return <a key={i} href={link[2]} target={external ? '_blank' : undefined} rel={external ? 'noopener' : undefined}>{link[1]}</a>;
    }
    return part;
  });
}
