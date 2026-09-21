import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, Mail, CreditCard } from "lucide-react";
import RegistrationCheckoutModal from "@/components/RegistrationCheckoutModal";
import PayPalButton from "@/components/PayPalButton";
import { openCheckoutPopup } from "@/lib/checkoutPopup";

export interface EventRegistrationSuccessData {
  id?: number;
  eventName: string;
  eventDate?: string;
  eventYear?: string;
  registrationNumber: string;
  isMember: boolean;
  membershipNumber?: string | null;
  adults: number;
  children: number;
  fee?: number;
  perPersonFee?: number;
  email: string;
  name: string;
}

interface EventRegistrationSuccessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: EventRegistrationSuccessData | null;
}

const BANK_DETAILS = {
  accountName: "Kutumb Australia Inc",
  bsb: "082-356",
  account: "778280517",
};

const EventRegistrationSuccessDialog = ({
  open,
  onOpenChange,
  data,
}: EventRegistrationSuccessDialogProps) => {
  const { toast } = useToast();
  // So the Square popup can be opened at the same size and screen position
  // as this dialog, instead of some arbitrary default box.
  const dialogContentRef = useRef<HTMLDivElement | null>(null);

  const [bankTransferred, setBankTransferred] = useState<"yes" | "no">("no");
  const [transactionNumber, setTransactionNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [paymentRecorded, setPaymentRecorded] = useState(false);
  const [showCardPayment, setShowCardPayment] = useState(false);

  // ── Pay (or part-pay) with an event coupon ──────────────────────────────
  const [couponCode, setCouponCode] = useState("");
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  const [couponResult, setCouponResult] = useState<{ remaining: number } | null>(null);

  // Which payment methods are currently offered, set by an admin under
  // Settings & Access → Payment Methods. Bank transfer is on by default so
  // the page still works before anyone visits that settings screen.
  const [methods, setMethods] = useState({ bankTransfer: true, card: false, square: false, paypal: false });

  useEffect(() => {
    if (!open) return;
    fetch("/api/payment-methods", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) =>
        setMethods({
          bankTransfer: !!data.bankTransfer,
          card: !!data.card,
          square: !!data.square,
          paypal: !!data.paypal,
        })
      )
      .catch(() => setMethods({ bankTransfer: true, card: false, square: false, paypal: false }));
  }, [open]);

  // ── Square: popup-based checkout (Square-hosted payment link) ──────────
  const [startingSquare, setStartingSquare] = useState(false);
  const [waitingOnSquarePopup, setWaitingOnSquarePopup] = useState(false);
  const handlePaySquare = async () => {
    if (!data.id) {
      toast({ title: "Can't start Square checkout", description: "Missing registration reference.", variant: "destructive" });
      return;
    }
    setStartingSquare(true);
    try {
      const res = await fetch(`/api/square/${data.id}/checkout`, { method: "POST" });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message || "Could not start Square checkout");

      setWaitingOnSquarePopup(true);
      openCheckoutPopup({
        url: result.url,
        anchorEl: dialogContentRef.current,
        onResult: (popupResult) => {
          setWaitingOnSquarePopup(false);
          setStartingSquare(false);
          if (popupResult.status === "paid") {
            toast({ title: "Payment confirmed 🎉", description: "Your Square payment was successful." });
            setPaymentRecorded(true);
          } else {
            toast({
              title: "Payment not completed",
              description: "The checkout window was cancelled or the payment didn't go through.",
              variant: "destructive",
            });
          }
        },
        onBlocked: () => {
          // Pop-up blocked — fall back to the old full-page redirect.
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
                setPaymentRecorded(true);
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
      toast({ title: "Square checkout failed", description: err.message, variant: "destructive" });
      setStartingSquare(false);
    }
  };

  const feeOwed =
    !!data &&
    typeof data.fee === "number" &&
    data.fee > 0 &&
    (couponResult ? couponResult.remaining > 0 : true);

  if (!data) return null;

  // A registration row already exists at this point (that's what makes a
  // Stripe/Square/PayPal checkout possible at all — they need a
  // registrationId to attach the payment to), but for a paid event it sits
  // as "pending_payment" server-side until money actually arrives. So
  // rather than declaring victory the moment the form was submitted, this
  // dialog leads with the payment step for as long as something is still
  // owed, and only shows the full "Registration Successful" confirmation
  // once that's cleared (or immediately, for a free event where nothing
  // was ever owed).
  const awaitingPayment = feeOwed && !paymentRecorded;

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
      if (Number(result.remaining) <= 0) setPaymentRecorded(true);
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

      toast({ title: "Thank You!", description: "Your payment details have been recorded." });
      setPaymentRecorded(true);
    } catch (err: any) {
      toast({ title: "Something went wrong", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent ref={dialogContentRef} className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          {awaitingPayment ? (
            <>
              <DialogTitle className="flex items-center gap-2 text-orange-700">
                <CreditCard className="w-6 h-6" />
                Complete Payment to Confirm
              </DialogTitle>
              <DialogDescription>
                Your spot for <strong>{data.eventName}</strong>
                {data.eventDate ? ` — ${data.eventDate}` : ""} is reserved as{" "}
                <strong>{data.registrationNumber}</strong>, but it isn't confirmed yet — pay the
                amount below to finish registering.
              </DialogDescription>
            </>
          ) : (
            <>
              <DialogTitle className="flex items-center gap-2 text-green-700">
                <CheckCircle2 className="w-6 h-6" />
                Registration Successful
              </DialogTitle>
              <DialogDescription>
                You're registered for <strong>{data.eventName}</strong>
                {data.eventDate ? ` — ${data.eventDate}` : ""}.
              </DialogDescription>
            </>
          )}
        </DialogHeader>

        <div className="rounded-lg border bg-muted/40 p-4 space-y-2 text-sm">
          <p>
            <span className="font-medium">Registration Number:</span> {data.registrationNumber}
          </p>
          {data.isMember && data.membershipNumber && (
            <p>
              <span className="font-medium">Membership Number:</span> {data.membershipNumber}
            </p>
          )}
          <p>
            <span className="font-medium">Adults:</span> {data.adults + 1}{" "}
            <span className="text-muted-foreground">(including you)</span>
          </p>
          <p>
            <span className="font-medium">Children:</span> {data.children}
          </p>
          {typeof data.fee === "number" && (
            <p>
              <span className="font-medium">Fee:</span>{" "}
              {data.fee > 0 ? (
                <>
                  ${data.fee}
                  {typeof data.perPersonFee === "number" && data.perPersonFee > 0 && (
                    <span className="text-muted-foreground">
                      {" "}(${data.perPersonFee} &times; {data.adults + 1 + data.children})
                    </span>
                  )}
                  {awaitingPayment && <span className="text-orange-700 font-medium"> — payment required</span>}
                </>
              ) : (
                "Free"
              )}
            </p>
          )}
        </div>

        <p className="text-sm text-muted-foreground flex items-center gap-1.5">
          <Mail className="w-3.5 h-3.5 shrink-0" />
          {awaitingPayment
            ? `A confirmation email with these details — including the amount still owed — has been sent to ${data.email}.`
            : `A confirmation email has been sent to ${data.email}.`}
        </p>

        {/* Payment collection - only shown when a fee is owed */}
        {awaitingPayment && (
          <div className="space-y-4 border-t pt-4">
            {!methods.card && !methods.bankTransfer && (
              <p className="text-sm text-muted-foreground">
                Payment options aren't available right now — we'll be in touch about how to pay.
              </p>
            )}

            {couponResult && couponResult.remaining > 0 && (
              <p className="text-sm text-green-700 font-medium">
                🎟️ Coupon applied — ${couponResult.remaining.toFixed(2)} still remaining.
              </p>
            )}

            <div className="space-y-2">
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
              <Button onClick={() => setShowCardPayment(true)} className="w-full btn-hero">
                💳 Pay ${(couponResult ? couponResult.remaining : data.fee)?.toFixed?.(2) ?? data.fee} by Card
              </Button>
            )}

            {methods.square && (
              <Button onClick={handlePaySquare} disabled={startingSquare} variant="outline" className="w-full">
                {waitingOnSquarePopup
                  ? "Waiting for payment in popup..."
                  : startingSquare
                  ? "Opening Square checkout..."
                  : `⬛ Pay $${(couponResult ? couponResult.remaining : data.fee)?.toFixed?.(2) ?? data.fee} with Square`}
              </Button>
            )}

            {methods.paypal && data.id && !paymentRecorded && (
              <PayPalButton
                registrationId={data.id}
                onSuccess={() => {
                  toast({ title: "Payment confirmed 🎉", description: "Your PayPal payment was successful." });
                  setPaymentRecorded(true);
                }}
                onError={(message) => toast({ title: "PayPal checkout failed", description: message, variant: "destructive" })}
              />
            )}

            {(methods.card || methods.square || methods.paypal) && methods.bankTransfer && (
              <p className="text-center text-xs text-muted-foreground">— or pay by bank transfer instead —</p>
            )}

            {methods.bankTransfer && (
              <>
                <div className="rounded-lg border-2 border-orange-200 bg-orange-50 px-4 py-3 space-y-1 text-sm">
                  <p className="font-semibold text-orange-800 mb-1">Kutumb Bank Details</p>
                  <p><span className="font-medium">Account Name:</span> {BANK_DETAILS.accountName}</p>
                  <p><span className="font-medium">BSB:</span> {BANK_DETAILS.bsb}</p>
                  <p><span className="font-medium">Account:</span> {BANK_DETAILS.account}</p>
                  <p className="pt-1 font-medium">
                    Amount: ${(couponResult ? couponResult.remaining : data.fee)?.toFixed?.(2) ?? data.fee}
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
              </>
            )}
          </div>
        )}

        {feeOwed && paymentRecorded && (
          <p className="text-sm text-green-700 font-medium border-t pt-4">
            ✅ Payment details recorded. Thank you!
          </p>
        )}

        <Button onClick={() => onOpenChange(false)} variant="outline" className="w-full">
          Close
        </Button>
      </DialogContent>

      {showCardPayment && feeOwed && methods.card && (
        <RegistrationCheckoutModal
          eventTitle={data.eventName}
          buyerName={data.name}
          buyerEmail={data.email}
          registrationId={data.id}
          defaultQuantity={1 + data.adults + data.children}
          totalFee={couponResult ? couponResult.remaining : (data.fee as number)}
          onClose={() => setShowCardPayment(false)}
          onSuccess={() => {
            setShowCardPayment(false);
            setPaymentRecorded(true);
            toast({ title: "Payment confirmed 🎉", description: "Your card payment was successful." });
          }}
        />
      )}
    </Dialog>
  );
};

export default EventRegistrationSuccessDialog;
