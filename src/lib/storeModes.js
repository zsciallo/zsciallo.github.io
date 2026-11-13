// Store modes (PVP / SMP ...) from the Tebex category tree. Pure: no DOM, no
// storage, never mutates its input. A mode is a top-level Tebex category with
// at least one sub-category that has packages; the page shows one mode at a time.

const hasPackages = (c) => Array.isArray(c?.packages) && c.packages.length > 0;
const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0);
const parentId = (c) => (c?.parent && typeof c.parent === 'object' ? c.parent.id : null);

/** The mode key: the slug lowercased, else the name lowercased with non [a-z0-9] runs as one '-'. */
function modeKey(cat) {
  if (cat.slug) return String(cat.slug).toLowerCase();
  return String(cat.name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

/**
 * @param {Array<object>} rawCategories the raw Tebex Headless list, before any filtering
 * @returns {{ modes: Array<{id, key, name, order, categoryIds: number[]}>, shared: number[] }}
 */
export function buildModes(rawCategories) {
  const list = Array.isArray(rawCategories) ? rawCategories : [];
  const tops = list.filter((c) => parentId(c) == null);
  const modes = [];
  for (const t of tops) {
    const children = list.filter((c) => parentId(c) === t.id && hasPackages(c));
    if (children.length === 0) continue;
    modes.push({
      id: t.id,
      key: modeKey(t),
      name: t.name,
      order: t.order,
      categoryIds: [...children].sort(byOrder).map((c) => c.id),
    });
  }
  if (modes.length === 0) return { modes: [], shared: [] };
  modes.sort(byOrder);
  const shared = tops.filter(hasPackages).map((c) => c.id);
  return { modes, shared };
}

/** A valid URL value wins, then a valid stored value, else null (the pop-up). Case-insensitive. */
export function resolveMode(modes, urlValue, storedValue) {
  const find = (v) => (v ? modes.find((m) => m.key.toLowerCase() === String(v).toLowerCase()) : undefined);
  const hit = find(urlValue) ?? find(storedValue);
  return hit ? hit.key : null;
}

/** The given categories (same objects, same order) of mode `key` plus the shared ones. */
export function categoriesForMode(categories, modesResult, key) {
  const mode = key == null ? undefined : modesResult.modes.find((m) => m.key === key);
  if (!mode) return categories;
  const keep = new Set([...mode.categoryIds, ...modesResult.shared]);
  return categories.filter((c) => keep.has(c.id));
}
