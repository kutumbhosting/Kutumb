import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Mail, CreditCard } from "lucide-react";
import RegistrationPaymentPanel from "@/components/RegistrationPaymentPanel";
import { useRef, useState } from "react";

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

const EventRegistrationSuccessDialog = ({
  open,
  onOpenChange,
  data,
}: EventRegistrationSuccessDialogProps) => {
  // So the Stripe/Square popup can be opened at the same size and screen
  // position as this dialog, instead of some arbitrary default box.
  const dialogContentRef = useRef<HTMLDivElement | null>(null);
  const [paymentRecorded, setPaymentRecorded] = useState(false);

  const feeOwed = !!data && typeof data.fee === "number" && data.fee > 0;

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
            ? `A confirmation email with these details — including the amount still owed and a payment link — has been sent to ${data.email}.`
            : `A confirmation email has been sent to ${data.email}.`}
        </p>

        {awaitingPayment && (
          <div className="border-t pt-4">
            <RegistrationPaymentPanel
              data={{
                id: data.id,
                eventName: data.eventName,
                eventDate: data.eventDate,
                eventYear: data.eventYear,
                email: data.email,
                name: data.name,
                fee: data.fee as number,
                adults: data.adults,
                children: data.children,
              }}
              anchorEl={dialogContentRef.current}
              onPaid={() => setPaymentRecorded(true)}
            />
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
