// Shared by DonateDialog and EventRegistrationSuccessDialog for any
// Stripe/Square checkout that works by redirecting to a provider-hosted
// page (Stripe Checkout, Square Payment Links) rather than embedding a
// form in place. Instead of navigating the whole site away with
// `window.location.href`, we open that URL in a small popup window; the
// popup eventually lands on /checkout/return (see CheckoutReturn.tsx),
// which posts the outcome back to us via window.postMessage and then
// closes itself.

// Must match CHECKOUT_POPUP_NAME in CheckoutReturn.tsx — that's how the
// return page recognizes it's running inside one of *our* popups (as
// opposed to some unrelated window that merely has an opener).
export const CHECKOUT_POPUP_NAME = "kutumb-checkout";

// The last popup WE opened. Used to (a) close it before opening a new one,
// so two payment attempts never leave a stray leftover window lying around,
// and (b) avoid ever reusing a stale window ourselves.
let lastOpenedPopup: Window | null = null;

export interface CheckoutPopupResult {
  source: "kutumb-checkout";
  status: "paid" | "error";
  provider?: string | null;
  donationId?: string | null;
  registrationId?: string | null;
  orderId?: number | null;
}

interface AttachCheckoutPopupOptions {
  /** Called once /checkout/return inside the popup reports a definite outcome. */
  onResult: (result: CheckoutPopupResult) => void;
  /** Called if the popup couldn't be navigated to the checkout URL (it was closed, or blocked outright). */
  onBlocked: () => void;
  /**
   * Called if the person closes the popup themselves before any result
   * message arrives (e.g. they paid but closed the tab too quickly, or
   * gave up partway through). We don't know the outcome at that point —
   * the caller should re-check via its own status endpoint if it has one.
   */
  onClosedWithoutResult?: () => void;
}

/**
 * Opens a blank popup window, sized and positioned to match `anchorEl`
 * (typically the dialog the "Pay" button lives in). Call this FIRST,
 * synchronously, directly inside the click handler — before any `await` —
 * and only fetch the real checkout URL afterwards, then hand both to
 * attachCheckoutPopup(). This two-step dance (open blank now, navigate it
 * later) is the standard workaround for popup blockers: a `window.open`
 * called after an `await` is no longer considered part of the original
 * click by most browsers (Safari in particular, but Chrome too in many
 * cases) and gets silently blocked — not with an error, it just quietly
 * doesn't work, which is exactly what "the popup never opens" looks like
 * from the outside. Opened with no URL yet (about:blank) the window.open
 * call itself still happens synchronously in the click, so it's exempt
 * from that block; we only fill in where it navigates once we know.
 */
export function openBlankCheckoutPopup(anchorEl?: HTMLElement | null): Window | null {
  // Default size/position: centered on the current browser window. Used
  // whenever we don't have a real dialog element to match (or its
  // measurements come back as 0, e.g. it isn't actually mounted/visible).
  let width = 480;
  let height = 720;
  let left = Math.round(window.screenX + Math.max(0, (window.outerWidth - width) / 2));
  let top = Math.round(window.screenY + Math.max(0, (window.outerHeight - height) / 2));

  const rect = anchorEl?.getBoundingClientRect();
  if (rect && rect.width > 0 && rect.height > 0) {
    width = Math.round(rect.width);
    height = Math.round(rect.height);
    // rect.left/top are relative to the browser's viewport; add the
    // window's own screen position to convert to absolute screen
    // coordinates, which is what window.open's left/top expect.
    left = Math.round(window.screenX + rect.left);
    top = Math.round(window.screenY + rect.top);
  }

  // A rough, before-we-even-open estimate of how much the browser's own
  // title bar + address bar will eat into the popup's requested outer
  // size — based on the SAME browser's overhead on the current window
  // (window.outer* vs window.inner*). This can't be exact (a popup has
  // less chrome than a full tabbed window — no tab strip, no bookmarks
  // bar), but baking in even a rough estimate up front means the popup
  // looks right on first paint instead of visibly snapping to size a
  // moment later, in case the more precise post-open correction below is
  // blocked (some browsers, Brave included, restrict scripted
  // resizeTo/moveTo more aggressively than others).
  const estChromeWidth = Math.max(0, window.outerWidth - window.innerWidth);
  const estChromeHeight = Math.max(0, window.outerHeight - window.innerHeight);
  const openWidth = width + estChromeWidth;
  const openHeight = height + estChromeHeight;
  const openLeft = left;
  const openTop = Math.max(0, top - estChromeHeight);

  // Close any popup we opened ourselves that's still hanging around from a
  // previous attempt, and — critically — open this one under a fresh,
  // never-used-before name every time. window.open() only honours
  // width/height/left/top when it's creating a brand-new window; if a
  // window with the given name already exists (e.g. the person's last
  // checkout attempt left it open, minimized, or behind another window),
  // the browser just hands back THAT window, completely ignoring our size
  // and position — which is what produces a popup that looks like some
  // unrelated leftover window instead of one matching the current dialog.
  // A unique name every time guarantees a fresh window, so the requested
  // geometry always actually applies.
  try {
    if (lastOpenedPopup && !lastOpenedPopup.closed) lastOpenedPopup.close();
  } catch {
    // Ignore — worst case an old popup is left open for the person to
    // close themselves, same as before this change existed.
  }
  const uniqueName = `${CHECKOUT_POPUP_NAME}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const popup = window.open(
    "about:blank",
    uniqueName,
    `width=${openWidth},height=${openHeight},left=${openLeft},top=${openTop},resizable=yes,scrollbars=yes`
  );
  lastOpenedPopup = popup;

  if (popup) {
    // /checkout/return identifies "one of our popups" by window.name —
    // window.open's target argument becomes the new window's .name
    // automatically, so with a unique target above that would no longer
    // match CHECKOUT_POPUP_NAME. window.name is one of the few properties
    // still writable across origins, and it persists across navigation of
    // the same window (that's exactly why it's used for this), so setting
    // it once, right here, keeps CheckoutReturn.tsx's check working
    // exactly as before, regardless of what name the window was opened
    // under.
    try {
      popup.name = CHECKOUT_POPUP_NAME;
    } catch {
      // Extremely unlikely for a same-origin about:blank window, but if it
      // fails, CheckoutReturn.tsx just falls back to treating it as an
      // ordinary page load — not ideal, but not broken either.
    }
    // The width/height/left/top above position the popup's OUTER window —
    // but every browser then draws its own title bar + address bar INSIDE
    // that box, shrinking the actual page content area and pushing it
    // down/right. That's what makes the popup look bigger than (and
    // offset from) the dialog it's meant to match: the mismatch is exactly
    // however tall that chrome is, which differs by browser/OS and can't
    // be known until the popup actually exists. So: open it as above
    // (close enough to avoid flicker), then immediately measure this
    // popup's own outerWidth/outerHeight vs innerWidth/innerHeight to get
    // its *real* chrome size, and nudge it with resizeTo/moveTo so the
    // content area — not the outer window — lines up with `anchorEl`.
    const fixSizeAndPosition = () => {
      try {
        const chromeWidth = Math.max(0, popup.outerWidth - popup.innerWidth);
        const chromeHeight = Math.max(0, popup.outerHeight - popup.innerHeight);
        if (chromeWidth || chromeHeight) {
          popup.resizeTo(width + chromeWidth, height + chromeHeight);
          popup.moveTo(left, Math.max(0, top - chromeHeight));
        }
      } catch {
        // Some browsers refuse resizeTo/moveTo on popups in certain
        // configurations — fall back to the original (slightly-off) size
        // rather than throwing.
      }
    };
    // Try immediately (some browsers have the chrome measurements ready
    // right away), AND after a short delay (others need a tick to finish
    // painting the popup's chrome before outerHeight/innerHeight are
    // accurate). This has to land on the about:blank page — once
    // attachCheckoutPopup() below navigates to Stripe/Square's own
    // domain, it's cross-origin and we can no longer resize/move it.
    fixSizeAndPosition();
    window.setTimeout(fixSizeAndPosition, 50);
  }

  return popup;
}

/**
 * Navigates an already-open popup (from openBlankCheckoutPopup) to the
 * real checkout URL once it's known, and resolves via callback once the
 * popup's /checkout/return page posts back a result. Calls `onBlocked` if
 * `popup` is null/closed (the initial open was blocked, or the person
 * closed the blank window before this was called) or if navigating it
 * throws, so the caller can fall back to a full-page redirect.
 */
export function attachCheckoutPopup(
  popup: Window | null,
  url: string,
  { onResult, onBlocked, onClosedWithoutResult }: AttachCheckoutPopupOptions
) {
  if (!popup || popup.closed) {
    onBlocked();
    return;
  }

  try {
    popup.location.href = url;
  } catch (err) {
    onBlocked();
    return;
  }

  let settled = false;

  const handleMessage = (event: MessageEvent) => {
    if (event.origin !== window.location.origin) return;
    const data = event.data as Partial<CheckoutPopupResult> | undefined;
    if (!data || data.source !== "kutumb-checkout") return;
    settled = true;
    cleanup();
    onResult(data as CheckoutPopupResult);
  };

  window.addEventListener("message", handleMessage);

  // Fallback for when the popup is closed (by the person, or because
  // window.close() ran) before or without ever posting a message —
  // otherwise the parent UI would be stuck waiting forever.
  const pollClosed = window.setInterval(() => {
    if (popup.closed) {
      cleanup();
      if (!settled) onClosedWithoutResult?.();
    }
  }, 500);

  function cleanup() {
    window.removeEventListener("message", handleMessage);
    window.clearInterval(pollClosed);
  }
}
