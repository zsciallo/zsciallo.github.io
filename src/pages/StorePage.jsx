import { useState, useEffect } from 'preact/hooks';
import config from '../config.json';
import { useScrollReveal } from '../hooks/useScrollReveal';
import { capture } from '../lib/funnel';
import { loadUnavailable, markUnavailable, unmarkUnavailable, clearUnavailable } from '../lib/unavailable';
import { inferOwnedPackages } from '../lib/inferOwned';
import { normalizeName, displayName, platformOf } from '../lib/minecraftName';
import { resolveType } from '../lib/packageType';
import { purchaseOptions, pairedSubscriptionIds, pairMembers } from '../lib/purchaseOptions';
import { useTebexStore } from '../hooks/useTebexStore';
import { useTebexBasket } from '../hooks/useTebexBasket';
import { isNameLookupFailure } from '../lib/tebex';
import { SectionHeader } from '../components/SectionHeader';
import { PackageCard } from '../components/PackageCard';
import { UsernameModal } from '../components/UsernameModal';
import { PackageModal } from '../components/PackageModal';
import { PurchaseTypeModal } from '../components/PurchaseTypeModal';
import { CartFab, CartDrawer, WELCOME_CODE } from '../components/CartDrawer';
import { PurchaseModal } from '../components/PurchaseModal';
import { Footer } from '../components/Footer';
import { NavBar } from '../components/NavBar';

const USERNAME_KEY = 'chromabit_username';
const PLATFORM_KEY = 'chromabit_platform';

// Tebex's refusal for a package the player can't buy — in practice, one they
// already own. The `.` covers both the straight and curly apostrophe.
const NOT_PURCHASABLE = /isn.?t purchasable|not purchasable/i;

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
  const [pending, setPending] = useState(null); // { pkg, mode: 'buy' | 'cart', quantity, type }
  const [busyPkgId, setBusyPkgId] = useState(null);
  const [cartBusy, setCartBusy] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [viewPkg, setViewPkg] = useState(null);
  // Raised when a package can be bought more than one way — { pkg, mode, quantity, options }.
  const [choice, setChoice] = useState(null);
  const [checkoutError, setCheckoutError] = useState(null);
  // The action to re-run if the buyer hits TRY AGAIN — set only for failures
  // that repeating can actually fix.
  const [retry, setRetry] = useState(null);
  const [retrying, setRetrying] = useState(false);
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
      // What they own just changed, so anything learned before is stale.
      clearUnavailable(saved);
      cart.clearBasket();
      history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  // A basket is what ties catalog pricing to a player, so make sure one exists
  // as soon as we know who they are.
  useEffect(() => {
    if (username) cart.ensureBasket(username);
  }, [username]);

  async function runAction(pkg, mode, name, quantity, type) {
    setBusyPkgId(pkg.id);
    setCheckoutError(null);
    setRetry(null);
    try {
      // No auto-retry with a dot prefix here any more. That silently moved a
      // purchase into the Bedrock namespace, and since plenty of gamertags also
      // exist as Java usernames, the undotted name often resolved to a
      // different real player instead of failing. The platform is asked for up
      // front now, so the name we were given is the name we send.
      const basket = await cart.addItem(pkg, name, quantity, type);
      // Succeeded, so any remembered refusal is stale — Battle Pass limits
      // expire, and a rank may have been refunded.
      if (unavailable.includes(pkg.id)) setUnavailable(unmarkUnavailable(name, pkg.id));

      capture(mode === 'buy' ? 'checkout_started' : 'add_to_cart', {
        package: pkg.name,
        package_id: pkg.id,
        quantity,
        // Which way a dual-type package actually sells is worth knowing, and
        // it's only visible here — nothing downstream reports it back.
        purchase_type: resolveType(pkg, type),
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

      const badName = isNameLookupFailure(err);

      // The clearest "why they didn't buy" signal on the whole site — these
      // are buyers who tried and were stopped.
      capture('checkout_failed', {
        reason: badName
          ? 'invalid_username'
          : owned ? 'not_purchasable' : overQty ? 'over_quantity' : 'other',
        message: err.message,
        package: pkg.name,
        mode,
      });

      if (badName) {
        // Read the edition off the name rather than the `platform` state, which
        // is a render behind when this runs straight after a name change.
        const bedrock = platformOf(name) === 'bedrock';
        setCheckoutError(
          `We couldn't confirm the ${bedrock ? 'Xbox gamertag' : 'Java username'} `
          + `"${displayName(name, bedrock ? 'bedrock' : 'java')}" with `
          + `${bedrock ? 'Xbox Live' : 'Mojang'}. That lookup is often just slow, `
          + `so try again — and check the spelling, or your edition, if it keeps failing.`,
        );
        // Deliberately not straight back to the name modal. Tebex reports a
        // lookup that timed out and a name that doesn't exist identically, and
        // the name is usually right — buyers were "fixing" it by retyping it
        // unchanged, which only ever re-ran the lookup. So offer that directly.
        setRetry({ pkg, mode, quantity, type });
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

  function handleAction(pkg, mode, quantity = 1, type) {
    setCheckoutError(null);
    setRetry(null);
    // Ask one-time-or-subscribe before anything else. Tebex refuses the add
    // without an answer, and the answer can change which package is bought.
    if (type === undefined) {
      const options = purchaseOptions(pkg, store.packagesById, config.subscriptionPairs);
      if (options.length > 1) {
        capture('purchase_type_prompted', { package: pkg.name, package_id: pkg.id, mode });
        setChoice({ pkg, mode, quantity, options });
        return;
      }
    }
    if (username) {
      runAction(pkg, mode, username, quantity, type);
    } else {
      // Buyers who reach the prompt but never fire add_to_cart / checkout_started
      // abandoned at the username gate — the one step unique to this store.
      capture('username_prompted', { package: pkg.name, mode });
      setPending({ pkg, mode, quantity, type });
    }
  }

  function handleConfirmUsername(raw, chosenPlatform) {
    setRetry(null);
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
      runAction(pending.pkg, pending.mode, name, pending.quantity, pending.type);
    } else {
      setPending(null);
    }
  }

  /**
   * Repeat the request that failed, unchanged. The whole point: what broke was
   * the name lookup, not anything the buyer entered.
   */
  async function handleRetry() {
    const action = retry;
    setCheckoutError(null);
    setRetry(null);
    capture('checkout_retried', { package: action?.pkg?.name || null });
    // The lookup can take two round trips, so hold the button rather than
    // leaving it looking like the click did nothing.
    setRetrying(true);
    if (action?.pkg) {
      await runAction(action.pkg, action.mode, username, action.quantity, action.type);
    } else if (username) {
      await cart.ensureBasket(username);
    }
    setRetrying(false);
  }

  /**
   * Buyer picked one-time or subscribe. The chosen option carries its own
   * package, since subscribe-and-save is a separate, cheaper package rather
   * than a second price on this one.
   */
  function handleChooseType(option) {
    const { mode, quantity } = choice;
    capture('purchase_type_chosen', {
      package: choice.pkg.name,
      purchase_type: option.type,
      saved_percent: option.save || 0,
      mode,
    });
    setChoice(null);
    handleAction(option.pkg, mode, quantity, option.type);
  }

  function handleView(pkg) {
    capture('package_viewed', { package: pkg.name, package_id: pkg.id, price: pkg.total_price });
    setViewPkg(pkg);
  }

  // Serves both the logged-out LOG IN button and the "change" link, since both
  // just open the username modal with nothing queued behind it.
  function openLogin() {
    setCheckoutError(null);
    setRetry(null);
    capture('login_opened', { had_username: Boolean(username) });
    setPending({ pkg: null, mode: 'change' });
  }

  // Quantity of each package already in the basket, so limited packages can
  // grey themselves out instead of failing at checkout.
  const cartQtyById = {};
  cart.items.forEach((i) => { cartQtyById[i.id] = i.in_basket?.quantity || 0; });

  // Two sources, deliberately combined: upgrade credits in the priced catalog
  // reveal the rank ladder for free, and rejected adds cover the standalone
  // capped packages that no discount can betray.
  const ownedIds = new Set([...unavailable, ...inferOwnedPackages(store.categories)]);

  // The cheaper subscription half of a pair is reached through its partner's
  // popup, so it must not also sit in the grid as a package of its own.
  const pairedIds = pairedSubscriptionIds(config.subscriptionPairs);

  // A pair is one product to the buyer, so either half in the cart — or refused
  // for this player — has to block the other. Otherwise subscribing leaves the
  // card on BUY and the same pass can be bought twice.
  const pairOf = (pkg) => pairMembers(pkg, config.subscriptionPairs);
  const cartQtyOf = (pkg) => pairOf(pkg).reduce((n, id) => n + (cartQtyById[id] || 0), 0);
  const ownedOf = (pkg) => pairOf(pkg).some((id) => ownedIds.has(id));

  async function handleApplyCoupon(code) {
    await cart.addCoupon(code);
    capture('coupon_applied', { code });
  }

  async function handleRemoveCoupon(code) {
    await cart.dropCoupon(code);
    capture('coupon_removed', { code });
  }

  // Card numbers are stored value — never send one to the funnel. The event is
  // only here to show gift cards are being redeemed at all.
  async function handleApplyGiftCard(number) {
    await cart.addGiftCard(number);
    capture('giftcard_applied');
  }

  async function handleRemoveGiftCard(number) {
    await cart.dropGiftCard(number);
    capture('giftcard_removed');
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

  // The saved name failed its lookup before the buyer touched anything. Worth
  // saying up front: this used to fail in silence and only resurface two clicks
  // later as an add-to-cart error, which blamed the wrong step.
  const nameCheckFailed = (
    <>
      We couldn't confirm <strong>{username}</strong> with{' '}
      {platform === 'bedrock' ? 'Xbox Live' : 'Mojang'} just now. That's usually
      temporary, so try again — or change the name if it's wrong.
    </>
  );
  // Repeating the request fixes a failed lookup and does nothing for "you
  // already own this", so only offer it where it can help.
  const canRetry = Boolean(retry) || Boolean(!checkoutError && cart.basketError);

  return (
    <>
      <NavBar current="store" />
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
                  <button class="btn btn-secondary btn-sm store-login" onClick={openLogin}>LOG IN</button>
                  <span class="store-user-hint">Set your Minecraft username to buy</span>
                </>
              )}
            </p>

            {!username && (
              <div class="store-promo">
                <span class="store-promo-tag">NEW HERE?</span>
                <span class="store-promo-text">
                  Use code <code class="store-promo-code">{WELCOME_CODE}</code> at checkout for{' '}
                  <strong>20% off</strong> your first order.
                </span>
              </div>
            )}

            {(checkoutError || cart.basketError) && !pending && (
              <div class="store-banner error">
                <span>{checkoutError || nameCheckFailed}</span>
                {canRetry && (
                  <span class="store-banner-actions">
                    <button
                      class="btn btn-sm btn-secondary"
                      onClick={handleRetry}
                      disabled={retrying}
                    >
                      {retrying ? 'CHECKING…' : 'TRY AGAIN'}
                    </button>
                    <button
                      class="btn btn-sm btn-secondary"
                      onClick={openLogin}
                      disabled={retrying}
                    >
                      CHANGE NAME
                    </button>
                  </span>
                )}
              </div>
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
                  class={`btn btn-sm store-tab ${activeCat == null ? 'btn-primary' : 'btn-secondary'}`}
                  aria-pressed={activeCat == null}
                  onClick={() => setActiveCat(null)}
                >
                  ALL
                </button>
                {store.categories.map((c) => (
                  <button
                    key={c.id}
                    class={`btn btn-sm store-tab ${activeCat === c.id ? 'btn-primary' : 'btn-secondary'}`}
                    aria-pressed={activeCat === c.id}
                    onClick={() => setActiveCat(c.id)}
                  >
                    {c.name.toUpperCase()}
                  </button>
                ))}
              </nav>
            )}

            {store.categories
              .filter((c) => activeCat == null || c.id === activeCat)
              .filter((c) => c.packages.some((p) => !pairedIds.has(p.id)))
              .map((category) => (
              <div class="store-category" key={category.id}>
                <SectionHeader title={category.name.toUpperCase()} />
                <div class="store-grid">
                  {category.packages.filter((pkg) => !pairedIds.has(pkg.id)).map((pkg) => (
                    <PackageCard
                      key={pkg.id}
                      pkg={pkg}
                      busy={busyPkgId === pkg.id}
                      cartQty={cartQtyOf(pkg)}
                      owned={ownedOf(pkg)}
                      onView={handleView}
                      onBuy={(p, qty, type) => handleAction(p, 'buy', qty, type)}
                      onAddToCart={(p, qty, type) => handleAction(p, 'cart', qty, type)}
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
        recurringIds={cart.recurringIds}
        busy={cartBusy}
        coupons={cart.coupons}
        giftcards={cart.giftcards}
        onSetQuantity={handleSetQuantity}
        onRemove={handleRemove}
        onApplyCoupon={handleApplyCoupon}
        onRemoveCoupon={handleRemoveCoupon}
        onApplyGiftCard={handleApplyGiftCard}
        onRemoveGiftCard={handleRemoveGiftCard}
        onClose={() => setCartOpen(false)}
      />

      {purchaseComplete && (
        <PurchaseModal
          serverIP={config.serverIP}
          username={username}
          onClose={() => setPurchaseComplete(false)}
        />
      )}

      {viewPkg && !pending && !choice && (
        <PackageModal
          pkg={viewPkg}
          busy={busyPkgId === viewPkg.id}
          cartQty={cartQtyOf(viewPkg)}
          owned={ownedOf(viewPkg)}
          onBuy={(p, qty, type) => handleAction(p, 'buy', qty, type)}
          onAddToCart={(p, qty, type) => handleAction(p, 'cart', qty, type)}
          onClose={() => setViewPkg(null)}
        />
      )}

      {choice && (
        <PurchaseTypeModal
          pkg={choice.pkg}
          options={choice.options}
          quantity={choice.quantity}
          mode={choice.mode}
          onChoose={handleChooseType}
          onClose={() => setChoice(null)}
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
