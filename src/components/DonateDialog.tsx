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

interface DonateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const BANK_DETAILS = {
  accountName: "Kutumb Australia Inc",
  bsb: "082-356",
  account: "778280517",
};

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

  // Reset form each time the dialog is opened fresh
  useEffect(() => {
    if (open) {
      setName("");
      setEmail("");
      setAmount("");
      setBankTransferred("no");
      setTransactionNumber("");
      setMembershipNumber(null);
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
    if (bankTransferred === "yes" && !transactionNumber.trim()) {
      toast({ title: "Transaction Number Required", description: "Please enter the bank transfer transaction number.", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/donations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          amount: Number(amount),
          bankTransferred: bankTransferred === "yes",
          transactionNumber: bankTransferred === "yes" ? transactionNumber : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to record donation");

      toast({
        title: "Thank You! 💛",
        description: "Your donation has been recorded. A confirmation email is on its way.",
      });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Something went wrong", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

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

          <Button type="submit" disabled={submitting} className="w-full text-white" style={{ backgroundColor: "#c2410c" }}>
            {submitting ? "Submitting…" : "Confirm Donation"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default DonateDialog;
