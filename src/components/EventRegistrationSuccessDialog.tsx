import { useState } from "react";
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
import { CheckCircle2, Mail } from "lucide-react";

export interface EventRegistrationSuccessData {
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

  const [bankTransferred, setBankTransferred] = useState<"yes" | "no">("no");
  const [transactionNumber, setTransactionNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [paymentRecorded, setPaymentRecorded] = useState(false);

  const feeOwed = !!data && typeof data.fee === "number" && data.fee > 0;

  if (!data) return null;

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
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-green-700">
            <CheckCircle2 className="w-6 h-6" />
            Registration Successful
          </DialogTitle>
          <DialogDescription>
            You're registered for <strong>{data.eventName}</strong>
            {data.eventDate ? ` — ${data.eventDate}` : ""}.
          </DialogDescription>
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
                </>
              ) : (
                "Free"
              )}
            </p>
          )}
        </div>

        <p className="text-sm text-muted-foreground flex items-center gap-1.5">
          <Mail className="w-3.5 h-3.5 shrink-0" />
          A confirmation email has been sent to {data.email}.
        </p>

        {/* Payment collection - only shown when a fee is owed */}
        {feeOwed && !paymentRecorded && (
          <div className="space-y-4 border-t pt-4">
            <div className="rounded-lg border-2 border-orange-200 bg-orange-50 px-4 py-3 space-y-1 text-sm">
              <p className="font-semibold text-orange-800 mb-1">Kutumb Bank Details</p>
              <p><span className="font-medium">Account Name:</span> {BANK_DETAILS.accountName}</p>
              <p><span className="font-medium">BSB:</span> {BANK_DETAILS.bsb}</p>
              <p><span className="font-medium">Account:</span> {BANK_DETAILS.account}</p>
              <p className="pt-1 font-medium">Amount: ${data.fee}</p>
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

        {feeOwed && paymentRecorded && (
          <p className="text-sm text-green-700 font-medium border-t pt-4">
            ✅ Payment details recorded. Thank you!
          </p>
        )}

        <Button onClick={() => onOpenChange(false)} variant="outline" className="w-full">
          Close
        </Button>
      </DialogContent>
    </Dialog>
  );
};

export default EventRegistrationSuccessDialog;
