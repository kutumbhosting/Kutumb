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
  /**
   * The dialog (or any element) the popup should match in size and screen
   * position — pass the Donate/Registration dialog's own DOM node so the
   * checkout popup opens as the same size, right on top of it, instead of
   * an arbitrary default box. Falls back to a sensible default size,
   * centered on the current window, when omitted or not yet mounted.
   */
  anchorEl?: HTMLElement | null;
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
 * Opens a checkout URL in a popup window sized and positioned to match
 * `anchorEl` (typically the dialog the "Pay" button was clicked from), and
 * resolves via callback once the popup's /checkout/return page posts back
 * a result. Falls back to `onBlocked` if the popup couldn't be opened
 * (pop-up blockers, etc.) so the caller can fall back to a full-page
 * redirect.
 */
export function openCheckoutPopup({ url, anchorEl, onResult, onBlocked, onClosedWithoutResult }: OpenCheckoutPopupOptions) {
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

  const popup = window.open(
    url,
    CHECKOUT_POPUP_NAME,
    `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
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
