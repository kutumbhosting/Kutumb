import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Mail } from "lucide-react";

export interface EventRegistrationSuccessData {
  eventName: string;
  eventDate?: string;
  registrationNumber: string;
  isMember: boolean;
  membershipNumber?: string | null;
  adults: number;
  children: number;
  fee?: number;
  email: string;
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
  if (!data) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
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
              <span className="font-medium">Fee:</span> {data.fee > 0 ? `$${data.fee}` : "Free"}
            </p>
          )}
        </div>

        <p className="text-sm text-muted-foreground flex items-center gap-1.5">
          <Mail className="w-3.5 h-3.5 shrink-0" />
          A confirmation email has been sent to {data.email}.
        </p>

        <Button onClick={() => onOpenChange(false)} className="w-full">
          Close
        </Button>
      </DialogContent>
    </Dialog>
  );
};

export default EventRegistrationSuccessDialog;
