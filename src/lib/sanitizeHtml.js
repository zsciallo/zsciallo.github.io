// Tebex package descriptions are HTML typed into the Tebex panel, and the store
// drops them straight into the page. Anyone with panel access - or anything that
// compromises it - could otherwise run script on a page that handles a player's
// basket, so the markup is reduced to an allowlist first.
import DOMPurify from 'dompurify';

const ALLOWED_TAGS = [
  'p', 'br', 'hr', 'strong', 'b', 'em', 'i', 'u', 's', 'span', 'blockquote', 'code',
  'h2', 'h3', 'h4', 'h5', 'ul', 'ol', 'li',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'a', 'img',
];
const ALLOWED_ATTR = ['href', 'src', 'alt', 'title', 'colspan', 'rowspan'];

let configured = false;

function configure() {
  // Links leave the store, so they open in a new tab without handing the new
  // page a reference back to this one. Anything that is not plain https - which
  // covers javascript: and data: - loses its target or is removed outright.
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      if (!/^https:\/\//i.test(node.getAttribute('href') || '')) node.removeAttribute('href');
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
    if (node.tagName === 'IMG') {
      if (!/^https:\/\//i.test(node.getAttribute('src') || '')) node.remove();
      else node.setAttribute('loading', 'lazy');
    }
  });
  configured = true;
}

export function sanitizeHtml(html) {
  // ssg.js pre-renders every page in Node, where there is no DOM to sanitize
  // with. The package popout is closed during that render, so nothing is lost by
  // returning nothing - and returning the raw string would be the one unsafe path.
  if (typeof window === 'undefined' || !html) return '';
  if (!configured) configure();
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR });
}
