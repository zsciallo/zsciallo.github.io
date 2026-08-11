import { useState, useEffect } from 'preact/hooks';
import config from '../config.json';
import { useScrollReveal } from '../hooks/useScrollReveal';
import { capture } from '../lib/funnel';
import {
  loadUnavailable,
  markUnavailable,
  unmarkUnavailable,
  applyProbe,
  shouldProbe,
  invalidateProbe,
} from '../lib/unavailable';
import { probeOwnership, NOT_PURCHASABLE } from '../lib/probeOwnership';
import { limitCount } from '../lib/packageLimit';
import { normalizeName, displayName, platformOf } from '../lib/minecraftName';
import { useTebexStore } from '../hooks/useTebexStore';
import { useTebexBasket } from '../hooks/useTebexBasket';
import { SectionHeader } from '../components/SectionHeader';
import { PackageCard } from '../components/PackageCard';
import { UsernameModal } from '../components/UsernameModal';
import { PackageModal } from '../components/PackageModal';
import { CartFab, CartDrawer, WELCOME_CODE } from '../components/CartDrawer';
import { PurchaseModal } from '../components/PurchaseModal';
import { Footer } from '../components/Footer';

const USERNAME_KEY = 'chromabit_username';
const PLATFORM_KEY = 'chromabit_platform';

// Tebex 404s basket creation when it can't resolve the name against Mojang
// (Java) or Xbox (Bedrock, dot-prefixed via Geyser). Usually a stale saved
// name, so send the buyer back to the modal instead of a dead-end banner.
const BAD_USERNAME = /invalid username/i;

// Distinct from NOT_PURCHASABLE: the package is fine, but this basket already
// holds the maximum allowed quantity.
const OVER_QUANTITY = /quantity cannot be greater than/i;

export function StorePage() {
  const cart = useTebexBasket(config.tebexToken);
  // Scoping the catalog to the basket is what surfaces rank upgrade discounts;
  // without an ident every player is quoted the full price.
  const store = useTebexStore(config.tebexToken, cart.basket?.ident);
  const [activeCat, setActiveCat] = useState(null); // null = all categories
  useScrollReveal([store.categories, activeCat]);

  const [username, setUsername] = useState('');
  const [platform, setPlatform] = useState('java');
  const [pending, setPending] = useState(null); // { pkg, mode: 'buy' | 'cart' }
  const [busyPkgId, setBusyPkgId] = useState(null);
  const [cartBusy, setCartBusy] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [viewPkg, setViewPkg] = useState(null);
  const [checkoutError, setCheckoutError] = useState(null);
  const [purchaseComplete, setPurchaseComplete] = useState(false);
  // Package ids Tebex has refused for the current player, inferred from failed
  // basket adds and remembered across visits.
  const [unavailable, setUnavailable] = useState([]);

  useEffect(() => {
    const saved = localStorage.getItem(USERNAME_KEY) || '';
    setUsername(saved);
    // Buyers saved before the platform toggle existed have no stored edition,
    // so read it back off the dot Geyser left on the name.
    setPlatform(localStorage.getItem(PLATFORM_KEY) || platformOf(saved));
    setUnavailable(loadUnavailable(saved));
    // Funnel entry point. `returning` separates first-time browsers from
    // players who have already bought once and know the flow.
    capture('store_viewed', { returning: Boolean(saved) });
    const params = new URLSearchParams(window.location.search);
    if (params.get('checkout') === 'complete') {
      setPurchaseComplete(true);
      // Client-side and best-effort: buyers who close the tab on Tebex's
      // confirmation page never get here. Tebex remains the source of truth
      // for revenue; this only gives the funnel its final step.
      capture('purchase_completed');
      // What they own just changed, so the cached probe is stale by definition.
      invalidateProbe(saved);
      cart.clearBasket();
      history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  // A basket is what ties catalog pricing to a player, so make sure one exists
  // as soon as we know who they are.
  useEffect(() => {
    if (username) cart.ensureBasket(username);
  }, [username]);

  /*
   * Ownership probe. The cached result is already on screen (loaded on mount),
   * so this only runs when that cache is stale and never blocks rendering.
   *
   * Only capped packages are probed — nothing without a `user_limit` can be
   * exhausted — which is 4 of the 8 packages rather than all of them.
   */
  useEffect(() => {
    if (!username || !store.categories.length || !shouldProbe(username)) return;
    let cancelled = false;

    const capped = Object.values(store.packagesById)
      .filter((p) => limitCount(p.user_limit) > 0)
      .map((p) => p.id);
    if (!capped.length) return;

    probeOwnership(config.tebexToken, username, capped)
      .then((owned) => {
        if (cancelled) return;
        setUnavailable(applyProbe(username, capped, owned));
        if (owned.length) capture('packages_owned', { count: owned.length });
      })
      .catch(() => {
        // Bad username, rate limit, offline — keep showing the cached view.
      });

    return () => { cancelled = true; };
  }, [username, store.packagesById]);

  async function runAction(pkg, mode, name, quantity) {
    setBusyPkgId(pkg.id);
    setCheckoutError(null);
    try {
      // No auto-retry with a dot prefix here any more. That silently moved a
      // purchase into the Bedrock namespace, and since plenty of gamertags also
      // exist as Java usernames, the undotted name often resolved to a
      // different real player instead of failing. The platform is asked for up
      // front now, so the name we were given is the name we send.
      const basket = await cart.addItem(pkg, name, quantity);
      // Succeeded, so any remembered refusal is stale — Battle Pass limits
      // expire, and a rank may have been refunded.
      if (unavailable.includes(pkg.id)) setUnavailable(unmarkUnavailable(name, pkg.id));

      capture(mode === 'buy' ? 'checkout_started' : 'add_to_cart', {
        package: pkg.name,
        package_id: pkg.id,
        quantity,
        // Everything past this point happens on Tebex's domain, so the drop
        // between checkout_started and purchase_completed is the payment step.
        value: basket.total_price,
      });
      if (mode === 'buy') {
        window.location.href = basket.links.checkout;
        return;
      }
      setPending(null);
      setViewPkg(null);
      setCartOpen(true);
      setBusyPkgId(null);
    } catch (err) {
      const owned = NOT_PURCHASABLE.test(err.message);
      const overQty = OVER_QUANTITY.test(err.message);

      // The clearest "why they didn't buy" signal on the whole site — these
      // are buyers who tried and were stopped.
      capture('checkout_failed', {
        reason: BAD_USERNAME.test(err.message)
          ? 'invalid_username'
          : owned ? 'not_purchasable' : overQty ? 'over_quantity' : 'other',
        message: err.message,
        package: pkg.name,
        mode,
      });

      if (BAD_USERNAME.test(err.message)) {
        setCheckoutError(
          platform === 'bedrock'
            ? `We couldn't find the Xbox gamertag "${name.replace(/^\./, '')}". Check the spelling, or switch to Java if that's where you play.`
            : `We couldn't find the Java username "${name}". Check the spelling, or switch to Bedrock if that's where you play.`,
        );
        setPending({ pkg, mode, quantity });
      } else if (owned) {
        // Remember the refusal so the card greys out from here on, rather than
        // letting them hit the same wall on every visit.
        setUnavailable(markUnavailable(name, pkg.id));
        setCheckoutError(`You already have ${pkg.name} — it's limited to one per player.`);
      } else if (overQty) {
        setCheckoutError(`${pkg.name} is limited to one per player, and it's already in your cart.`);
      } else {
        setCheckoutError(err.message);
      }
      setBusyPkgId(null);
    }
  }

  function handleAction(pkg, mode, quantity = 1) {
    setCheckoutError(null);
    if (username) {
      runAction(pkg, mode, username, quantity);
    } else {
      // Buyers who reach the prompt but never fire add_to_cart / checkout_started
      // abandoned at the username gate — the one step unique to this store.
      capture('username_prompted', { package: pkg.name, mode });
      setPending({ pkg, mode, quantity });
    }
  }

  function handleConfirmUsername(raw, chosenPlatform) {
    // What Tebex sees: Bedrock gamertags get the Geyser dot and lose spaces.
    const name = normalizeName(raw, chosenPlatform);
    // A basket is tied to its username, so drop it if the name changed.
    if (name !== username) cart.clearBasket();
    localStorage.setItem(USERNAME_KEY, name);
    localStorage.setItem(PLATFORM_KEY, chosenPlatform);
    setUsername(name);
    setPlatform(chosenPlatform);
    // Refusals belong to the player, not the browser — swap in this account's.
    setUnavailable(loadUnavailable(name));
    if (pending?.pkg) {
      runAction(pending.pkg, pending.mode, name, pending.quantity);
    } else {
      setPending(null);
    }
  }

  function handleView(pkg) {
    capture('package_viewed', { package: pkg.name, package_id: pkg.id, price: pkg.total_price });
    setViewPkg(pkg);
  }

  // Serves both the logged-out LOG IN button and the "change" link, since both
  // just open the username modal with nothing queued behind it.
  function openLogin() {
    setCheckoutError(null);
    capture('login_opened', { had_username: Boolean(username) });
    setPending({ pkg: null, mode: 'change' });
  }

  // Quantity of each package already in the basket, so limited packages can
  // grey themselves out instead of failing at checkout.
  const cartQtyById = {};
  cart.items.forEach((i) => { cartQtyById[i.id] = i.in_basket?.quantity || 0; });

  async function handleApplyCoupon(code) {
    await cart.addCoupon(code);
    capture('coupon_applied', { code });
  }

  async function handleRemoveCoupon(code) {
    await cart.dropCoupon(code);
    capture('coupon_removed', { code });
  }

  async function handleRemove(packageId) {
    setCartBusy(true);
    try {
      await cart.removeItem(packageId);
    } catch {
      // Leave the item in place; the next interaction will retry.
    }
    setCartBusy(false);
  }

  async function handleSetQuantity(packageId, quantity) {
    setCartBusy(true);
    try {
      await cart.setQuantity(packageId, quantity);
    } catch {
      // Keep the last known quantity; the next interaction will retry.
    }
    setCartBusy(false);
  }

  return (
    <>
      <main>
        <section class="page-hero container" aria-label="Chromabit SMP Store">
          <a href="/" class="logo-link" aria-label="Back to Chromabit SMP home">
            <img class="logo-sm" src="/server-icon-old-2.png" alt="Chromabit SMP" />
          </a>

          <p class="section-eyebrow">SERVER STORE</p>
          <h1 class="hero-title hero-title--inline">
            GEAR <span class="accent">UP.</span>
          </h1>
          <p class="hero-sub">Ranks, crate keys, and more. Every purchase directly supports Chromabit SMP.</p>

          <p class="store-powered">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
            SECURE CHECKOUT POWERED BY <a href="https://www.tebex.io/" target="_blank" rel="noopener">TEBEX</a>
          </p>

          <div class="rule" />
        </section>

        <section class="store-section" aria-label="Store packages">
          <div class="container">
            {/* Always rendered, so there's a visible account control before the
                buyer ever reaches a Buy button — not just a modal that ambushes
                them at checkout. */}
            <p class="store-user">
              {username ? (
                <>
                  Buying as <strong>{username}</strong>
                  <span class="store-user-platform">{platform === 'bedrock' ? 'BEDROCK' : 'JAVA'}</span>
                  <button class="store-user-change" onClick={openLogin}>change</button>
                </>
              ) : (
                <>
                  <button class="store-login" onClick={openLogin}>LOG IN</button>
                  <span class="store-user-hint">Set your Minecraft username to buy</span>
                </>
              )}
            </p>

            {!username && (
              <div class="store-promo">
                <span class="store-promo-tag">NEW HERE?</span>
                <span>
                  Use code <strong>{WELCOME_CODE}</strong> at checkout for <strong>20% off</strong> your first order.
                </span>
              </div>
            )}

            {checkoutError && !pending && (
              <div class="store-banner error">{checkoutError}</div>
            )}

            {store.loading && <p class="store-status-msg">LOADING PACKAGES…</p>}

            {store.error && (
              <div class="store-banner error">
                The store couldn't be loaded right now. You can still shop at{' '}
                <a href="https://chromabitstore.tebex.io/" target="_blank" rel="noopener">chromabitstore.tebex.io</a>.
              </div>
            )}

            {store.categories.length > 1 && (
              <nav class="store-tabs" aria-label="Package categories">
                <button
                  class={`store-tab${activeCat == null ? ' active' : ''}`}
                  onClick={() => setActiveCat(null)}
                >
                  ALL
                </button>
                {store.categories.map((c) => (
                  <button
                    key={c.id}
                    class={`store-tab${activeCat === c.id ? ' active' : ''}`}
                    onClick={() => setActiveCat(c.id)}
                  >
                    {c.name.toUpperCase()}
                  </button>
                ))}
              </nav>
            )}

            {store.categories.filter((c) => activeCat == null || c.id === activeCat).map((category) => (
              <div class="store-category" key={category.id}>
                <SectionHeader title={category.name.toUpperCase()} />
                <div class="store-grid">
                  {category.packages.map((pkg) => (
                    <PackageCard
                      key={pkg.id}
                      pkg={pkg}
                      busy={busyPkgId === pkg.id}
                      cartQty={cartQtyById[pkg.id] || 0}
                      owned={unavailable.includes(pkg.id)}
                      onView={handleView}
                      onBuy={(p, qty) => handleAction(p, 'buy', qty)}
                      onAddToCart={(p, qty) => handleAction(p, 'cart', qty)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
      <Footer />

      <CartFab count={cart.count} onClick={() => setCartOpen(true)} />
      <CartDrawer
        open={cartOpen}
        basket={cart.basket}
        items={cart.items}
        packagesById={store.packagesById}
        busy={cartBusy}
        coupons={cart.coupons}
        onSetQuantity={handleSetQuantity}
        onRemove={handleRemove}
        onApplyCoupon={handleApplyCoupon}
        onRemoveCoupon={handleRemoveCoupon}
        onClose={() => setCartOpen(false)}
      />

      {purchaseComplete && (
        <PurchaseModal
          serverIP={config.serverIP}
          username={username}
          onClose={() => setPurchaseComplete(false)}
        />
      )}

      {viewPkg && !pending && (
        <PackageModal
          pkg={viewPkg}
          busy={busyPkgId === viewPkg.id}
          cartQty={cartQtyById[viewPkg.id] || 0}
          owned={unavailable.includes(viewPkg.id)}
          onBuy={(p, qty) => handleAction(p, 'buy', qty)}
          onAddToCart={(p, qty) => handleAction(p, 'cart', qty)}
          onClose={() => setViewPkg(null)}
        />
      )}

      {pending && (
        <UsernameModal
          initial={displayName(username, platform)}
          initialPlatform={platform}
          error={checkoutError}
          busy={pending.pkg != null && busyPkgId === pending.pkg.id}
          onConfirm={handleConfirmUsername}
          onClose={() => {
            // Closed the username gate without completing it — an explicit
            // abandon, as opposed to simply going idle on the page.
            if (pending.pkg) capture('username_prompt_dismissed', { package: pending.pkg.name });
            setPending(null);
            setCheckoutError(null);
          }}
        />
      )}
    </>
  );
}
