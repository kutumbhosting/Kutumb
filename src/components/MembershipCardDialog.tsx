import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Mail } from "lucide-react";

export interface MembershipCardData {
  membershipNumber: string;
  qrCode: string; // base64 data URL
  name: string;
  email: string;
  phone: string;
  eventName?: string;
  eventDate?: string;
}

interface MembershipCardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  card: MembershipCardData | null;
}

const MembershipCardDialog = ({ open, onOpenChange, card }: MembershipCardDialogProps) => {
  if (!card) return null;

  const cardPdfUrl = `/api/members/${card.membershipNumber}/card.pdf`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {card.eventName ? "Registration Confirmed" : "Welcome to Kutumb!"}
          </DialogTitle>
          <DialogDescription>
            {card.eventName
              ? `You're registered for ${card.eventName}${card.eventDate ? ` — ${card.eventDate}` : ""}.`
              : "Your membership card is ready."}
          </DialogDescription>
        </DialogHeader>

        {/* Card visual */}
        <div className="relative border-2 rounded-xl p-5 bg-gradient-to-br from-orange-50 to-white">
          {/* QR code - top right corner */}
          <img
            src={card.qrCode}
            alt="Membership QR code"
            className="absolute top-4 right-4 w-20 h-20 rounded"
          />

          <img
            src="/kutumb-logo.png"
            alt="Kutumb"
            className="h-9 w-auto object-contain mb-2 pr-24"
          />
          <p className="text-xs uppercase tracking-wide text-primary font-semibold mb-1">
            {card.eventName ? "Membership on file" : "Membership Card"}
          </p>
          <p className="text-lg font-bold mb-3 pr-24">
            No: {card.membershipNumber}
          </p>

          <div className="space-y-1 text-sm pr-24">
            <p>
              <span className="font-medium">Name:</span> {card.name}
            </p>
            <p>
              <span className="font-medium">Email:</span> {card.email}
            </p>
            <p>
              <span className="font-medium">Phone:</span> {card.phone}
            </p>
          </div>
        </div>

        <DialogFooter className="pt-2 flex-col items-stretch gap-2 sm:flex-col">
          <a href={cardPdfUrl} target="_blank" rel="noopener noreferrer" className="w-full">
            <Button variant="outline" className="w-full">
              <Download className="w-4 h-4 mr-2" />
              Download PDF Card
            </Button>
          </a>
          <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1.5">
            <Mail className="w-3.5 h-3.5 shrink-0" />
            A copy of this card has also been emailed to {card.email}
          </p>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default MembershipCardDialog;
