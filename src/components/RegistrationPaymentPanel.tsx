import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import PayPalButton from "@/components/PayPalButton";
import { openBlankCheckoutPopup, attachCheckoutPopup } from "@/lib/checkoutPopup";

const BANK_DETAILS = {
  accountName: "Kutumb Australia Inc",
  bsb: "082-356",
  account: "778280517",
};

export interface RegistrationPaymentPanelData {
  id?: number;
  eventName: string;
  eventDate?: string;
  eventYear?: string;
  email: string;
  name: string;
  /** The amount currently owed (not necessarily the original fee — the
   *  caller is responsible for passing what's actually still outstanding,
   *  e.g. after a previous partial coupon). */
  fee: number;
  adults: number;
  children: number;
}

/** A payment method a link (e.g. one in the registration email) can ask to
 *  have shown first. */
export type PreferredPaymentMethod = "card" | "paypal" | "square" | "bank";

/** What actually happened when the panel called onPaid. "confirmed" means the
 *  money has been received and the registration is confirmed (card, PayPal,
 *  Square, a fully-covering coupon). "pending_verification" means the person
 *  reported a bank transfer, which stays pending until Kutumb sees it land in
 *  the bank account — so callers must NOT tell them they're confirmed. */
export type PaymentOutcome = "confirmed" | "pending_verification";

interface RegistrationPaymentPanelProps {
  data: RegistrationPaymentPanelData;
  /** Show this method first and highlight it — used when someone clicks a
   *  specific payment option in the registration email. Every other enabled
   *  method is still available below it. */
  preferredMethod?: PreferredPaymentMethod | null;
  /** The dialog/page element the Stripe/Square popup should match in size
   *  and screen position. Omit on a plain full-page (non-dialog) host —
   *  the popup then just centers itself on the window. */
  anchorEl?: HTMLElement | null;
  onPaid: (outcome?: PaymentOutcome) => void;
}

// Every "pay for this registration" surface — the dialog shown right after
// submitting the registration form, and the standalone page a "Pay Now"
// email link lands on — renders this same panel, so a fix or a new
// payment method only ever needs to happen in one place.
export default function RegistrationPaymentPanel({ data, anchorEl, preferredMethod, onPaid }: RegistrationPaymentPanelProps) {
  const { toast } = useToast();
  const [bankTransferred, setBankTransferred] = useState<"yes" | "no">("no");
  const [transactionNumber, setTransactionNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // ── Pay (or part-pay) with an event coupon ──────────────────────────────
  const [couponCode, setCouponCode] = useState("");
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  const [couponResult, setCouponResult] = useState<{ remaining: number } | null>(null);

  // Which payment methods are currently offered, set by an admin under
  // Settings & Access → Payment Methods. Bank transfer is on by default so
  // the panel still works before anyone visits that settings screen.
  const [methods, setMethods] = useState({ bankTransfer: true, card: false, square: false, paypal: false });

  useEffect(() => {
    fetch("/api/payment-methods", { cache: "no-store" })
      .then((res) => res.json())
      .then((d) =>
        setMethods({ bankTransfer: !!d.bankTransfer, card: !!d.card, square: !!d.square, paypal: !!d.paypal })
      )
      .catch(() => setMethods({ bankTransfer: true, card: false, square: false, paypal: false }));
  }, []);

  // ── Square: popup-based checkout (Square-hosted payment link) ──────────
  const [startingSquare, setStartingSquare] = useState(false);
  const [waitingOnSquarePopup, setWaitingOnSquarePopup] = useState(false);
  const [waitingOnPaypalPopup, setWaitingOnPaypalPopup] = useState(false);
  const handlePaySquare = async () => {
    if (!data.id) {
      toast({ title: "Can't start Square checkout", description: "Missing registration reference.", variant: "destructive" });
      return;
    }
    // Opened blank, synchronously, right here — before any `await` — so
    // the browser still counts it as triggered by this click and doesn't
    // silently block it. We navigate it to the real Square checkout URL
    // once we have it below.
    const popup = openBlankCheckoutPopup(anchorEl);

    setStartingSquare(true);
    try {
      const res = await fetch(`/api/square/${data.id}/checkout`, { method: "POST" });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message || "Could not start Square checkout");

      setWaitingOnSquarePopup(true);
      attachCheckoutPopup(popup, result.url, {
        onResult: (popupResult) => {
          setWaitingOnSquarePopup(false);
          setStartingSquare(false);
          if (popupResult.status === "paid") {
            toast({ title: "Payment confirmed 🎉", description: "Your Square payment was successful." });
            onPaid();
          } else {
            toast({
              title: "Payment not completed",
              description: "The checkout window was cancelled or the payment didn't go through.",
              variant: "destructive",
            });
          }
        },
        onBlocked: () => {
          setWaitingOnSquarePopup(false);
          window.location.href = result.url;
        },
        onClosedWithoutResult: () => {
          setWaitingOnSquarePopup(false);
          setStartingSquare(false);
          fetch(`/api/square/status/${data.id}`)
            .then((r) => r.json())
            .then((statusData) => {
              if (statusData.status === "paid") {
                toast({ title: "Payment confirmed 🎉", description: "Your Square payment was successful." });
                onPaid();
              } else {
                toast({
                  title: "Checkout window closed",
                  description: "We didn't receive confirmation of payment. If you completed the payment, it may still be processing.",
                });
              }
            })
            .catch(() => {
              toast({
                title: "Checkout window closed",
                description: "We couldn't confirm whether the payment went through. Check your email, or contact us if you were charged.",
              });
            });
        },
      });
    } catch (err: any) {
      popup?.close();
      toast({ title: "Square checkout failed", description: err.message, variant: "destructive" });
      setStartingSquare(false);
    }
  };

  // ── Card: popup-based checkout, a dedicated Stripe session for exactly
  // what's owed on this registration (not the old ticket-type-selection
  // screen — that routed through the ticketing system's shared per-event
  // "General" ticket type, priced once and shared across every
  // registrant, which is how $20 owed ended up charging $60). Mirrors
  // handlePaySquare above almost exactly. ─────────────────────────────────
  const [startingCard, setStartingCard] = useState(false);
  const [waitingOnCardPopup, setWaitingOnCardPopup] = useState(false);
  const handlePayCard = async () => {
    if (!data.id) {
      toast({ title: "Can't start card checkout", description: "Missing registration reference.", variant: "destructive" });
      return;
    }
    // Opened blank, synchronously, right here — before any `await` — so
    // the browser still counts it as triggered by this click and doesn't
    // silently block it.
    const popup = openBlankCheckoutPopup(anchorEl);

    setStartingCard(true);
    try {
      const res = await fetch(`/api/events/registration/${data.id}/checkout-card`, { method: "POST" });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message || "Could not start card checkout");

      setWaitingOnCardPopup(true);
      attachCheckoutPopup(popup, result.url, {
        onResult: (popupResult) => {
          setWaitingOnCardPopup(false);
          setStartingCard(false);
          if (popupResult.status === "paid") {
            toast({ title: "Payment confirmed 🎉", description: "Your card payment was successful." });
            onPaid();
          } else {
            toast({
              title: "Payment not completed",
              description: "The checkout window was cancelled or the payment didn't go through.",
              variant: "destructive",
            });
          }
        },
        onBlocked: () => {
          setWaitingOnCardPopup(false);
          window.location.href = result.url;
        },
        onClosedWithoutResult: () => {
          setWaitingOnCardPopup(false);
          setStartingCard(false);
          fetch(`/api/events/registration/${data.id}/card-status`)
            .then((r) => r.json())
            .then((statusData) => {
              if (statusData.status === "paid") {
                toast({ title: "Payment confirmed 🎉", description: "Your card payment was successful." });
                onPaid();
              } else {
                toast({
                  title: "Checkout window closed",
                  description: "We didn't receive confirmation of payment. If you completed the payment, it may still be processing.",
                });
              }
            })
            .catch(() => {
              toast({
                title: "Checkout window closed",
                description: "We couldn't confirm whether the payment went through. Check your email, or contact us if you were charged.",
              });
            });
        },
      });
    } catch (err: any) {
      popup?.close();
      toast({ title: "Card checkout failed", description: err.message, variant: "destructive" });
      setStartingCard(false);
    }
  };

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) {
      toast({ title: "Enter a coupon code", variant: "destructive" });
      return;
    }
    setApplyingCoupon(true);
    try {
      const res = await fetch("/api/events/apply-coupon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventName: data.eventName,
          eventYear: data.eventYear,
          email: data.email,
          couponCode: couponCode.trim(),
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message || "Could not apply that coupon");
      setCouponResult({ remaining: Number(result.remaining) || 0 });
      toast({ title: "Coupon applied 🎟️", description: result.message });
      if (Number(result.remaining) <= 0) onPaid();
    } catch (err: any) {
      toast({ title: "Coupon couldn't be applied", description: err.message, variant: "destructive" });
    } finally {
      setApplyingCoupon(false);
    }
  };

  const handleRecordPayment = async () => {
    if (bankTransferred === "yes" && !transactionNumber.trim()) {
      toast({ title: "Transaction Number Required", description: "Please enter the bank transfer transaction number.", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/events/record-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          registrationId: data.id,
          eventName: data.eventName,
          eventDate: data.eventDate,
          eventYear: data.eventYear,
          email: data.email,
          bankTransferred: bankTransferred === "yes",
          transactionNumber: bankTransferred === "yes" ? transactionNumber : undefined,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message || "Failed to record payment");

      // Go by what the server actually decided, not by the fact the request
      // succeeded: a reported transfer is only a claim until it's verified.
      if (result.status === "none") {
        toast({
          title: "Nothing recorded yet",
          description: "Pay using one of the options above, then come back and enter your transaction number.",
        });
      } else if (result.status === "already_paid") {
        toast({ title: "Already paid", description: "This registration is already confirmed — nothing more to pay." });
        onPaid("confirmed");
      } else {
        toast({
          title: "Transfer details received",
          description: "Your ticket(s) will be issued once we've verified your payment in our bank account.",
        });
        onPaid("pending_verification");
      }
    } catch (err: any) {
      toast({ title: "Something went wrong", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const remaining = couponResult ? couponResult.remaining : data.fee;

  // The coupon field always stays on top; among the payment methods, the
  // preferred one (if any) is moved to the front and given a highlight ring.
  const methodOrder = (m: PreferredPaymentMethod) => ({ order: preferredMethod === m ? 0 : 1 });
  const methodRing = (m: PreferredPaymentMethod) =>
    preferredMethod === m ? "rounded-lg ring-2 ring-orange-400 ring-offset-2" : "";

  // Mirrors DonateDialog: once a Stripe/Square/PayPal popup is actually
  // open and we're waiting to hear back, replace the whole panel with a
  // single "waiting" screen instead of leaving the coupon field and other
  // payment buttons visible and clickable underneath — same behaviour,
  // same look, for donations and event payments alike.
  if (waitingOnCardPopup || waitingOnSquarePopup || waitingOnPaypalPopup) {
    return (
      <div className="text-center py-6 space-y-2">
        <p className="text-2xl">💳</p>
        <p className="font-semibold">Complete your payment in the popup window</p>
        <p className="text-sm text-muted-foreground">
          This will update automatically once payment is confirmed.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {!methods.card && !methods.square && !methods.paypal && !methods.bankTransfer && (
        <p className="text-sm text-muted-foreground" style={{ order: -3 }}>
          Payment options aren't available right now — we'll be in touch about how to pay.
        </p>
      )}

      {couponResult && couponResult.remaining > 0 && (
        <p className="text-sm text-green-700 font-medium" style={{ order: -2 }}>
          🎟️ Coupon applied — ${couponResult.remaining.toFixed(2)} still remaining.
        </p>
      )}

      <div className="space-y-2" style={{ order: -1 }}>
        <Label htmlFor="event-coupon-code">Have an event coupon?</Label>
        <div className="flex gap-2">
          <Input
            id="event-coupon-code"
            value={couponCode}
            onChange={(e) => setCouponCode(e.target.value)}
            placeholder="e.g. KUT-7F3QK2"
          />
          <Button type="button" variant="secondary" onClick={handleApplyCoupon} disabled={applyingCoupon}>
            {applyingCoupon ? "Applying..." : "Apply"}
          </Button>
        </div>
      </div>

      {methods.card && (
        <div style={methodOrder("card")} className={methodRing("card")}>
          <Button onClick={handlePayCard} disabled={startingCard} className="w-full btn-hero">
            {waitingOnCardPopup
              ? "Waiting for payment in popup..."
              : startingCard
              ? "Opening card checkout..."
              : `💳 Pay $${remaining.toFixed(2)} by Card`}
          </Button>
        </div>
      )}

      {methods.square && (
        <div style={methodOrder("square")} className={methodRing("square")}>
          <Button onClick={handlePaySquare} disabled={startingSquare} variant="outline" className="w-full">
            {waitingOnSquarePopup
              ? "Waiting for payment in popup..."
              : startingSquare
              ? "Opening Square checkout..."
              : `⬛ Pay $${remaining.toFixed(2)} with Square`}
          </Button>
        </div>
      )}

      {methods.paypal && data.id && (
        <div style={methodOrder("paypal")} className={methodRing("paypal")}>
          <PayPalButton
            registrationId={data.id}
            onWaitingChange={setWaitingOnPaypalPopup}
            onSuccess={() => {
              toast({ title: "Payment confirmed 🎉", description: "Your PayPal payment was successful." });
              onPaid();
            }}
            onError={(message) => toast({ title: "PayPal checkout failed", description: message, variant: "destructive" })}
          />
        </div>
      )}

      {/* The divider only makes sense in the default order (bank transfer
          last); with a preferred method the order is custom. */}
      {!preferredMethod && (methods.card || methods.square || methods.paypal) && methods.bankTransfer && (
        <p className="text-center text-xs text-muted-foreground" style={{ order: 1 }}>
          — or pay by bank transfer instead —
        </p>
      )}

      {methods.bankTransfer && (
        <div
          style={methodOrder("bank")}
          className={`space-y-4 ${preferredMethod === "bank" ? "rounded-lg ring-2 ring-orange-400 ring-offset-2 p-3" : ""}`}
        >
          <div className="rounded-lg border-2 border-orange-200 bg-orange-50 px-4 py-3 space-y-1 text-sm">
            <p className="font-semibold text-orange-800 mb-1">Kutumb Bank Details</p>
            <p><span className="font-medium">Account Name:</span> {BANK_DETAILS.accountName}</p>
            <p><span className="font-medium">BSB:</span> {BANK_DETAILS.bsb}</p>
            <p><span className="font-medium">Account:</span> {BANK_DETAILS.account}</p>
            <p className="pt-1 font-medium">Amount: ${remaining.toFixed(2)}</p>
            <p className="pt-1 text-xs text-orange-900">
              Use your registration number as the payment reference. Tickets are issued after
              we've verified your transfer.
            </p>
          </div>

          <div>
            <Label className="mb-2 block">Have you already completed a bank transfer? *</Label>
            <RadioGroup value={bankTransferred} onValueChange={(v) => setBankTransferred(v as "yes" | "no")} className="flex gap-6">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="yes" id="event-transferred-yes" />
                <label htmlFor="event-transferred-yes" className="text-sm cursor-pointer">Yes</label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="no" id="event-transferred-no" />
                <label htmlFor="event-transferred-no" className="text-sm cursor-pointer">No, not yet</label>
              </div>
            </RadioGroup>
          </div>

          {bankTransferred === "yes" && (
            <div>
              <Label htmlFor="event-txn-number">Transaction / Reference Number *</Label>
              <Input
                id="event-txn-number"
                value={transactionNumber}
                onChange={(e) => setTransactionNumber(e.target.value)}
                className="mt-2"
                placeholder="e.g. TXN123456789"
              />
            </div>
          )}

          <Button
            onClick={handleRecordPayment}
            disabled={submitting}
            className="w-full text-white"
            style={{ backgroundColor: "#c2410c" }}
          >
            {submitting ? "Submitting…" : "Confirm Payment Details"}
          </Button>
        </div>
      )}
    </div>
  );
}
