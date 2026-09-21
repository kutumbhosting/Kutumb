import { useState, useEffect } from "react";
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
import { HeartHandshake } from "lucide-react";
import PayPalButton from "@/components/PayPalButton";

interface DonateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const BANK_DETAILS = {
  accountName: "Kutumb Australia Inc",
  bsb: "082-356",
  account: "778280517",
};

type PaymentMethod = "bank" | "card" | "square" | "paypal";

const DonateDialog = ({ open, onOpenChange }: DonateDialogProps) => {
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [amount, setAmount] = useState("");
  const [bankTransferred, setBankTransferred] = useState<"yes" | "no">("no");
  const [transactionNumber, setTransactionNumber] = useState("");
  const [membershipNumber, setMembershipNumber] = useState<string | null>(null);
  const [checkingMembership, setCheckingMembership] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Which payment methods an admin has switched on (Settings & Access →
  // Payment Methods). Bank Transfer is on by default; Card/Square/PayPal
  // only appear here once an admin has enabled them AND filled in that
  // provider's API credentials.
  const [methods, setMethods] = useState({ bankTransfer: true, card: false, square: false, paypal: false });
  const [loadingMethods, setLoadingMethods] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("bank");

  // ── After the donation is recorded, only PayPal needs a further step
  // here (its button has to render after we have a donation id) — Card
  // and Square redirect away immediately, and Bank Transfer just closes. ──
  const [donationId, setDonationId] = useState<number | null>(null);
  const [paymentDone, setPaymentDone] = useState(false);
  const [showingPaypal, setShowingPaypal] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoadingMethods(true);
    // no-store: this reflects an admin toggle that can change at any time,
    // so a cached response (browser or intermediate proxy) must never be
    // allowed to hide a payment method that was just switched on.
    fetch("/api/payment-methods", { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        return res.json();
      })
      .then((data) => {
        const next = { bankTransfer: !!data.bankTransfer, card: !!data.card, square: !!data.square, paypal: !!data.paypal };
        setMethods(next);
        // Default to the first available method, preferring Bank Transfer
        // since it needs no redirect — but pick *something* enabled so the
        // form is never stuck defaulted to a method that isn't offered.
        if (next.bankTransfer) setPaymentMethod("bank");
        else if (next.card) setPaymentMethod("card");
        else if (next.square) setPaymentMethod("square");
        else if (next.paypal) setPaymentMethod("paypal");
      })
      .catch((err) => {
        console.error("Failed to load payment methods:", err);
        // Fail open to Bank Transfer only — never silently pretend an
        // online method is available when we couldn't actually confirm it.
        setMethods({ bankTransfer: true, card: false, square: false, paypal: false });
        setPaymentMethod("bank");
      })
      .finally(() => setLoadingMethods(false));
  }, [open]);

  // Reset form each time the dialog is opened fresh
  useEffect(() => {
    if (open) {
      setName("");
      setEmail("");
      setAmount("");
      setBankTransferred("no");
      setTransactionNumber("");
      setMembershipNumber(null);
      setDonationId(null);
      setPaymentDone(false);
      setShowingPaypal(false);
    }
  }, [open]);

  // Live membership lookup once both name + a valid-looking email are present
  useEffect(() => {
    const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!name.trim() || !emailValid) {
      setMembershipNumber(null);
      return;
    }

    const timer = setTimeout(async () => {
      setCheckingMembership(true);
      try {
        const res = await fetch(
          `/api/members/lookup?name=${encodeURIComponent(name)}&email=${encodeURIComponent(email)}`
        );
        const data = await res.json();
        setMembershipNumber(data.found ? data.membershipNumber : null);
      } catch {
        setMembershipNumber(null);
      } finally {
        setCheckingMembership(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [name, email]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim() || !email.trim() || !amount) {
      toast({ title: "Missing Information", description: "Please fill in all required fields.", variant: "destructive" });
      return;
    }
    if (paymentMethod === "bank" && bankTransferred === "yes" && !transactionNumber.trim()) {
      toast({ title: "Transaction Number Required", description: "Please enter the bank transfer transaction number.", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const isBankDone = paymentMethod === "bank" && bankTransferred === "yes";
      const res = await fetch("/api/donations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          amount: Number(amount),
          bankTransferred: isBankDone,
          transactionNumber: isBankDone ? transactionNumber : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to record donation");
      const newDonationId = data.donation?.id || null;

      if (paymentMethod === "bank") {
        toast({
          title: "Thank You! 💛",
          description: isBankDone
            ? "Your donation has been recorded. A confirmation email is on its way."
            : "Your donation has been recorded — please complete the bank transfer using the details shown.",
        });
        onOpenChange(false);
        return;
      }

      // Online payment methods: the donation now exists (Pending) — start
      // (or render) the actual payment.
      setDonationId(newDonationId);
      if (paymentMethod === "card") {
        const cardRes = await fetch(`/api/donations/${newDonationId}/checkout-card`, { method: "POST" });
        const cardResult = await cardRes.json();
        if (!cardRes.ok) throw new Error(cardResult.message || "Could not start card checkout");
        window.location.href = cardResult.url;
        return;
      }
      if (paymentMethod === "square") {
        const squareRes = await fetch(`/api/square/donations/${newDonationId}/checkout`, { method: "POST" });
        const squareResult = await squareRes.json();
        if (!squareRes.ok) throw new Error(squareResult.message || "Could not start Square checkout");
        window.location.href = squareResult.url;
        return;
      }
      if (paymentMethod === "paypal") {
        setShowingPaypal(true);
      }
    } catch (err: any) {
      toast({ title: "Something went wrong", description: err.message, variant: "destructive" });
      setSubmitting(false);
    }
  };

  const anyOnlineMethod = methods.card || methods.square || methods.paypal;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HeartHandshake className="w-5 h-5 text-orange-600" />
            Support Kutumb
          </DialogTitle>
          <DialogDescription>
            Your donation helps us keep serving the community. Thank you for your generosity.
          </DialogDescription>
        </DialogHeader>

        {paymentDone ? (
          <div className="text-center py-6 space-y-2">
            <p className="text-2xl">💛</p>
            <p className="font-semibold">Thank you for your donation!</p>
            <Button onClick={() => onOpenChange(false)} className="mt-4">Close</Button>
          </div>
        ) : showingPaypal && donationId ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Complete your ${amount} donation with PayPal:
            </p>
            <PayPalButton
              kind="donation"
              donationId={donationId}
              onSuccess={() => {
                toast({ title: "Payment confirmed 🎉", description: "Thank you for your donation!" });
                setPaymentDone(true);
              }}
              onError={(message) => toast({ title: "PayPal checkout failed", description: message, variant: "destructive" })}
            />
            <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <Label htmlFor="donor-name">Full Name *</Label>
            <Input id="donor-name" value={name} onChange={(e) => setName(e.target.value)} className="mt-2" placeholder="Enter your full name" />
          </div>

          <div>
            <Label htmlFor="donor-email">Email Address *</Label>
            <Input id="donor-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-2" placeholder="your.email@example.com" />
          </div>

          <div className="rounded-lg bg-muted/50 px-4 py-3 text-sm">
            {checkingMembership ? (
              <span className="text-muted-foreground">Checking membership…</span>
            ) : membershipNumber ? (
              <span>
                Kutumb Membership Number: <strong>{membershipNumber}</strong>
              </span>
            ) : (
              <span className="text-muted-foreground">
                No Kutumb membership found for this email (that's okay - anyone can donate).
              </span>
            )}
          </div>

          <div>
            <Label htmlFor="donor-amount">Donation Amount (AUD) *</Label>
            <Input id="donor-amount" type="number" min="1" step="1" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-2" placeholder="e.g. 50" />
          </div>

          {/* Payment method — shown up front so online options (once an
              admin enables them in Settings & Access) are never hidden
              behind a second step. */}
          {loadingMethods ? (
            <p className="text-sm text-muted-foreground">Loading payment options…</p>
          ) : anyOnlineMethod ? (
            <div>
              <Label className="mb-2 block">How would you like to pay? *</Label>
              <RadioGroup value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)} className="space-y-2">
                {methods.card && (
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="card" id="pay-card" />
                    <label htmlFor="pay-card" className="text-sm cursor-pointer">💳 Card (Stripe)</label>
                  </div>
                )}
                {methods.square && (
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="square" id="pay-square" />
                    <label htmlFor="pay-square" className="text-sm cursor-pointer">⬛ Square</label>
                  </div>
                )}
                {methods.paypal && (
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="paypal" id="pay-paypal" />
                    <label htmlFor="pay-paypal" className="text-sm cursor-pointer">🅿️ PayPal</label>
                  </div>
                )}
                {methods.bankTransfer && (
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="bank" id="pay-bank" />
                    <label htmlFor="pay-bank" className="text-sm cursor-pointer">🏦 Bank Transfer</label>
                  </div>
                )}
              </RadioGroup>
            </div>
          ) : null}

          {paymentMethod === "bank" && methods.bankTransfer && (
            <>
              <div>
                <Label className="mb-2 block">Have you already completed a bank transfer? *</Label>
                <RadioGroup value={bankTransferred} onValueChange={(v) => setBankTransferred(v as "yes" | "no")} className="flex gap-6">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="yes" id="transferred-yes" />
                    <label htmlFor="transferred-yes" className="text-sm cursor-pointer">Yes</label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="no" id="transferred-no" />
                    <label htmlFor="transferred-no" className="text-sm cursor-pointer">No, not yet</label>
                  </div>
                </RadioGroup>
              </div>

              {bankTransferred === "yes" && (
                <div>
                  <Label htmlFor="txn-number">Transaction / Reference Number *</Label>
                  <Input id="txn-number" value={transactionNumber} onChange={(e) => setTransactionNumber(e.target.value)} className="mt-2" placeholder="e.g. TXN123456789" />
                </div>
              )}

              <div className="rounded-lg border-2 border-orange-200 bg-orange-50 px-4 py-3 space-y-1 text-sm">
                <p className="font-semibold text-orange-800 mb-1">Kutumb Bank Details</p>
                <p><span className="font-medium">Account Name:</span> {BANK_DETAILS.accountName}</p>
                <p><span className="font-medium">BSB:</span> {BANK_DETAILS.bsb}</p>
                <p><span className="font-medium">Account:</span> {BANK_DETAILS.account}</p>
              </div>
            </>
          )}

          <Button type="submit" disabled={submitting} className="w-full text-white" style={{ backgroundColor: "#c2410c" }}>
            {submitting
              ? "Submitting…"
              : paymentMethod === "bank"
              ? "Confirm Donation"
              : `Continue to ${paymentMethod === "card" ? "Card" : paymentMethod === "square" ? "Square" : "PayPal"} Payment`}
          </Button>
        </form>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default DonateDialog;
