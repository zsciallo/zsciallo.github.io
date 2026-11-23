// The site's tiny inline markup (faq.json answers, wiki pages): **bold**, `code` and [text](href).
// Anything else is plain text, so no raw HTML can reach the page; plainAnswer() in
// src/data/seo.js strips the same marks for head tags and JSON-LD.
const TOKEN = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;

export function rich(text) {
  return text.split(TOKEN).map((part, i) => {
    if (!part) return null;
    if (part.startsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`')) return <code key={i}>{part.slice(1, -1)}</code>;
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
