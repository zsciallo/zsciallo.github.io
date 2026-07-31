import { useState, useEffect } from 'preact/hooks';
import config from '../config.json';
import { useScrollReveal } from '../hooks/useScrollReveal';
import { useTebexStore } from '../hooks/useTebexStore';
import { useTebexBasket } from '../hooks/useTebexBasket';
import { SectionHeader } from '../components/SectionHeader';
import { PackageCard } from '../components/PackageCard';
import { UsernameModal } from '../components/UsernameModal';
import { PackageModal } from '../components/PackageModal';
import { CartFab, CartDrawer } from '../components/CartDrawer';
import { Footer } from '../components/Footer';

const USERNAME_KEY = 'chromabit_username';

// Tebex 404s basket creation when it can't resolve the name against Mojang
// (Java) or Xbox (Bedrock, dot-prefixed via Geyser). Usually a stale saved
// name, so send the buyer back to the modal instead of a dead-end banner.
const BAD_USERNAME = /invalid username/i;

export function StorePage() {
  const store = useTebexStore(config.tebexToken);
  const cart = useTebexBasket(config.tebexToken);
  const [activeCat, setActiveCat] = useState(null); // null = all categories
  useScrollReveal([store.categories, activeCat]);

  const [username, setUsername] = useState('');
  const [pending, setPending] = useState(null); // { pkg, mode: 'buy' | 'cart' }
  const [busyPkgId, setBusyPkgId] = useState(null);
  const [cartBusy, setCartBusy] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [viewPkg, setViewPkg] = useState(null);
  const [checkoutError, setCheckoutError] = useState(null);
  const [purchaseComplete, setPurchaseComplete] = useState(false);

  useEffect(() => {
    setUsername(localStorage.getItem(USERNAME_KEY) || '');
    const params = new URLSearchParams(window.location.search);
    if (params.get('checkout') === 'complete') {
      setPurchaseComplete(true);
      cart.clearBasket();
      history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  async function runAction(pkg, mode, name, quantity) {
    setBusyPkgId(pkg.id);
    setCheckoutError(null);
    try {
      const basket = await cart.addItem(pkg, name, quantity);
      if (mode === 'buy') {
        window.location.href = basket.links.checkout;
        return;
      }
      setPending(null);
      setViewPkg(null);
      setCartOpen(true);
      setBusyPkgId(null);
    } catch (err) {
      if (BAD_USERNAME.test(err.message)) {
        setCheckoutError(
          `We couldn't find "${name}" in-game. Bedrock players must include the leading dot (e.g. .Toast).`,
        );
        setPending({ pkg, mode, quantity });
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
      setPending({ pkg, mode, quantity });
    }
  }

  function handleConfirmUsername(name) {
    // A basket is tied to its username, so drop it if the name changed.
    if (name !== username) cart.clearBasket();
    localStorage.setItem(USERNAME_KEY, name);
    setUsername(name);
    if (pending?.pkg) {
      runAction(pending.pkg, pending.mode, name, pending.quantity);
    } else {
      setPending(null);
    }
  }

  function changeUsername() {
    setCheckoutError(null);
    setPending({ pkg: null, mode: 'change' });
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
            {purchaseComplete && (
              <div class="store-banner success">
                <strong>Thanks for your purchase!</strong> Your items will be delivered in-game within a few minutes. Make sure you're online on <strong>{config.serverIP}</strong>.
              </div>
            )}

            {username && (
              <p class="store-user">
                Buying as <strong>{username}</strong>
                <button class="store-user-change" onClick={changeUsername}>change</button>
              </p>
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
                      onView={setViewPkg}
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
        onSetQuantity={handleSetQuantity}
        onRemove={handleRemove}
        onClose={() => setCartOpen(false)}
      />

      {viewPkg && !pending && (
        <PackageModal
          pkg={viewPkg}
          busy={busyPkgId === viewPkg.id}
          onBuy={(p, qty) => handleAction(p, 'buy', qty)}
          onAddToCart={(p, qty) => handleAction(p, 'cart', qty)}
          onClose={() => setViewPkg(null)}
        />
      )}

      {pending && (
        <UsernameModal
          initial={username}
          error={checkoutError}
          busy={pending.pkg != null && busyPkgId === pending.pkg.id}
          onConfirm={handleConfirmUsername}
          onClose={() => { setPending(null); setCheckoutError(null); }}
        />
      )}
    </>
  );
}
