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

  return window.open(
    "about:blank",
    CHECKOUT_POPUP_NAME,
    `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
  );
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
