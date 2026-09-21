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

interface OpenCheckoutPopupOptions {
  /** The provider-hosted checkout URL to open (Stripe session URL, Square payment link, etc). */
  url: string;
  /** Called once /checkout/return inside the popup reports a definite outcome. */
  onResult: (result: CheckoutPopupResult) => void;
  /** Called if the browser's popup blocker prevented the window from opening at all. */
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
 * Opens a checkout URL in a small, centered popup window and resolves via
 * callback once the popup's /checkout/return page posts back a result.
 * Falls back to `onBlocked` if the popup couldn't be opened (pop-up
 * blockers, etc.) so the caller can fall back to a full-page redirect.
 */
export function openCheckoutPopup({ url, onResult, onBlocked, onClosedWithoutResult }: OpenCheckoutPopupOptions) {
  const width = 480;
  const height = 720;
  const left = Math.round(window.screenX + Math.max(0, (window.outerWidth - width) / 2));
  const top = Math.round(window.screenY + Math.max(0, (window.outerHeight - height) / 2));

  const popup = window.open(
    url,
    CHECKOUT_POPUP_NAME,
    `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes,noopener=no`
  );

  // Some blockers return a window that is immediately closed, others
  // return null outright — check for both.
  if (!popup || popup.closed) {
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
