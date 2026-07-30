const API = 'https://headless.tebex.io/api';

async function request(url, options) {
  const res = await fetch(url, options);
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message = body?.detail || body?.title || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return body;
}

function post(url, payload) {
  return request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

function put(url, payload) {
  return request(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

/** Fetch all categories with their packages included. */
export async function fetchCategories(token) {
  const body = await request(`${API}/accounts/${token}/categories?includePackages=1`);
  return body.data || [];
}

/**
 * Create a basket for the given Minecraft username — Tebex needs the
 * username up front to attribute the purchase and deliver in-game.
 */
export async function createBasket(token, username) {
  const base = `${window.location.origin}/store/`;
  const body = await post(`${API}/accounts/${token}/baskets`, {
    username,
    complete_url: `${base}?checkout=complete`,
    cancel_url: base,
    complete_auto_redirect: true,
  });
  return body.data;
}

/** Fetch an existing basket by ident. */
export async function getBasket(token, ident) {
  const body = await request(`${API}/accounts/${token}/baskets/${ident}`);
  return body.data;
}

/**
 * Add a package to a basket. Quantity is added to whatever is already in the
 * basket, so adding 2 of a package that's already there leaves 3. Returns the
 * updated basket.
 */
export async function addToBasket(ident, packageId, quantity = 1) {
  const body = await post(`${API}/baskets/${ident}/packages`, { package_id: packageId, quantity });
  return body.data;
}

/**
 * Set the absolute quantity of a package already in the basket (0 removes it).
 * Returns the updated basket.
 */
export async function setBasketQuantity(ident, packageId, quantity) {
  const body = await put(`${API}/baskets/${ident}/packages/${packageId}`, { quantity });
  return body.data;
}

/** Remove a package from a basket. Returns the updated basket. */
export async function removeFromBasket(ident, packageId) {
  const body = await post(`${API}/baskets/${ident}/packages/remove`, { package_id: packageId });
  return body.data;
}
