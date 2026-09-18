/**
 * The embedded Tebex checkout - the payment panel, opened over the store
 * instead of navigating away to checkout.tebex.io.
 *
 * Tebex.js renders it as a "lightbox": an iframe against pay.tebex.io covering
 * the page. The payment form itself stays on Tebex's origin, which is the point
 * - card details never touch this site and nothing here changes what is in
 * scope for PCI. All we get to control is the frame around it and the palette
 * inside it, hence THEME below.
 *
 * Left to itself Tebex.js sends anything under 800x760 - phones, but also a
 * half-height desktop window - off to a new browser tab instead. `popupOnMobile`
 * turns that off so every buyer gets the same panel, and index.css sizes it to
 * the viewport rather than the fixed 800x760 iframe Tebex.js asks zoid for.
 *
 * The basket is still handed over as a callback rather than awaited beforehand:
 * it runs behind the panel's own spinner, so the buyer sees the checkout open
 * immediately instead of watching a dead button through the round trip.
 *
 * Every launch is timed and reported, because the wait is split across three
 * parties and only one of them is us. See `report` at the bottom of the file
 * for what the numbers mean and where the rest of the time goes.
 */
import { capture } from './funnel';

// Tebex.js bundles zoid and is larger than the rest of the store put together,
// so it is code-split out of the initial load and preloaded on idle instead -
// a click should open the panel, not start a 220kB download and then open it.
let tebex = null;
let loading = null;
// Listeners are attached once, for the life of the page, and dispatch to
// whatever the current launch passed in. Re-subscribing per launch would leak a
// set of handlers every time the buyer backed out and tried again.
let attached = false;
let handlers = {};

/**
 * The Tebex panel's brand colours.
 *
 * Deliberately only the two accents, though Tebex also accepts `background`,
 * `surface`, `surface-variant`, `fields`, `field-border`, `success`, `error`,
 * `green` and `red`. Setting those put the store's purples on some of the
 * panel's surfaces and left Tebex's own dark theme on the rest, so sections
 * like "Your order" and the gift card box ended up ringed in a colour that
 * matched neither. Tebex's dark theme is internally consistent; the accents are
 * the part that is ours to say. Widen this only alongside the whole set.
 *
 * Plain hex rather than the `--accent` custom properties they mirror: these
 * cross into an iframe on another origin, where nothing from our stylesheet
 * exists, and Tebex rejects any value that resolves through `var()`. Keep in
 * step with `:root` in index.css by hand.
 */
const THEME = {
  primary: '#c77dff',
  secondary: '#ff7de1',
};

/**
 * Start fetching Tebex.js. Safe to call repeatedly; only the first one loads.
 *
 * Called as soon as the store knows who is buying, so the module is in memory
 * well before anyone reaches a Buy button. A failure is deliberately not
 * swallowed - the caller needs to be able to fall back to the hosted checkout.
 */
export function preloadCheckout() {
  if (!loading) {
    loading = import('@tebexio/tebex.js').then((mod) => {
      tebex = mod.default;
      return tebex;
    }).catch((err) => {
      // Let the next attempt retry rather than caching the failure forever - a
      // buyer who loses the chunk to a flaky connection should still be able to
      // check out on their second click.
      loading = null;
      throw err;
    });
  }
  return loading;
}

/**
 * Open the checkout panel.
 *
 * `getIdent` is an async function returning the basket ident to pay for. It
 * runs inside Tebex.js, behind its loading spinner, so the basket round trip
 * happens after the panel is already on screen rather than in front of it. Its
 * rejection surfaces here, wrapped in a Tebex.js message - callers that care
 * about the original should hold on to it themselves.
 *
 * Rejects if Tebex.js itself never arrives, which is the one failure with no
 * recovery inside the panel - callers with a basket in hand should fall back to
 * its hosted `links.checkout` rather than leave the buyer with an error.
 */
export function launchCheckout(getIdent, events = {}) {
  handlers = events;
  const started = performance.now();
  let basketMs = 0;

  const timedIdent = async () => {
    const at = performance.now();
    try {
      return await getIdent();
    } finally {
      // In `finally` so a basket that fails is still timed - a slow refusal is
      // as much worth seeing as a slow success.
      basketMs = performance.now() - at;
    }
  };

  const run = (mod) => {
    const moduleMs = performance.now() - started;
    return open(mod, timedIdent).then(() => {
      const total = performance.now() - started;
      report({
        module: moduleMs,
        basket: basketMs,
        panel: total - moduleMs - basketMs,
        total,
      });
    });
  };

  return tebex ? run(tebex) : preloadCheckout().then(run);
}

function open(mod, getIdent) {
  mod.checkout.init({
    // Left unset: `launch` resolves it from the callback, so the basket does
    // not have to exist yet at the moment of the click.
    ident: undefined,
    theme: 'dark',
    colors: THEME,
    // Closes itself the instant payment lands, so the store's own confirmation
    // takes over rather than stacking behind Tebex's "Payment Complete" screen.
    // `payment:complete` still fires.
    closeOnPaymentComplete: true,
    // Escape backs out, a stray click on the backdrop does not. Mis-clicking
    // the page behind a part-filled card form is a needlessly expensive
    // mistake, and the panel has its own close button.
    closeOnEsc: true,
    closeOnClickOutside: false,
    // Keep the panel in the page on small screens instead of Tebex's default
    // hand-off to a new tab. The threshold for "small" is `(max-width: 800px)
    // or (max-height: 760px)`, which is most phones and plenty of desktop
    // windows that are merely short - losing those buyers to a second tab is a
    // worse trade than sizing the panel properly, which index.css does.
    popupOnMobile: true,
  });

  if (!attached) {
    attached = true;
    // Payment confirmation here is presentational only. It says the panel
    // reported success, not that the money moved or that anything was
    // delivered - Tebex's own docs are explicit that webhooks are the only
    // source of truth, and the game server hears about the order from Tebex,
    // never from this page.
    mod.checkout.on('payment:complete', (e) => handlers.onComplete?.(e));
    mod.checkout.on('payment:error', (e) => handlers.onError?.(e));
    mod.checkout.on('close', () => handlers.onClose?.());
  }

  return mod.checkout.launch(getIdent);
}

/**
 * Where the wait went.
 *
 * Opening the checkout is three sequential waits and it is worth knowing which
 * one is long, because they have nothing to do with each other:
 *
 *   module  fetching Tebex.js. Should be ~0 - it is preloaded on idle - and any
 *           real number here means the buyer beat the preload, or it failed.
 *   basket  our own round trip to headless.tebex.io, adding the package and
 *           getting an ident back.
 *   panel   Tebex.js building the iframe and completing its zoid handshake.
 *
 * And then a fourth wait that none of this can see: `launch()` resolves when
 * the iframe exists, not when the checkout has painted in it. Everything after
 * `total` is Tebex's own app loading inside their frame - it pulls its own
 * bundle, an ident lookup and third-party tags such as Rokt - and no amount of
 * work on this side moves it. If total is small and the panel still sits blank,
 * that is where to look, and it is Tebex's to fix rather than ours.
 */
function report(marks) {
  const ms = (n) => Math.round(n);
  const timing = {
    module_ms: ms(marks.module),
    basket_ms: ms(marks.basket),
    panel_ms: ms(marks.panel),
    total_ms: ms(marks.total),
  };
  // Left on rather than behind a debug flag. It is one line, once per checkout,
  // on the one flow where "it felt slow" is otherwise unfalsifiable.
  console.info(
    `[checkout] panel open in ${timing.total_ms}ms `
    + `(tebex.js ${timing.module_ms}ms, basket ${timing.basket_ms}ms, frame ${timing.panel_ms}ms). `
    + `Any further wait is Tebex's checkout app loading inside the iframe.`,
  );
  // Also to the funnel, so this is answerable across buyers and connections
  // rather than one developer's machine.
  capture('checkout_panel_opened', timing);
  handlers.onTiming?.(timing);
}
