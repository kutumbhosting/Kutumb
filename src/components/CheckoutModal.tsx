import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X } from "lucide-react";
import { openBlankCheckoutPopup, attachCheckoutPopup } from "@/lib/checkoutPopup";

const slugify = (t: string) => t?.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^\w-]+/g, "");

interface TicketType {
  id: number;
  name: string;
  description: string | null;
  price_cents: number;
  quantity_total: number;
  quantity_sold: number;
}

interface CheckoutModalProps {
  eventTitle: string;
  onClose: () => void;
}

// Two-step modal: 1) pick tickets + buyer details, 2) Stripe's own embedded
// payment form takes over once a Checkout Session exists. Free events skip
// straight to a confirmation with no Stripe involved at all.
export default function CheckoutModal({ eventTitle, onClose }: CheckoutModalProps) {
  const eventId = slugify(eventTitle);
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState<Record<number, number>>({});
  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [freeConfirmed, setFreeConfirmed] = useState<number | null>(null);
  const [paidConfirmed, setPaidConfirmed] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Set while the Stripe popup is open and we're waiting to hear back from
  // it, so the modal can show "Waiting for payment..." instead of the old
  // embedded card form.
  const [waitingOnPopup, setWaitingOnPopup] = useState(false);
  const contentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fetch(`/api/ticketing/${eventId}/ticket-types`)
      .then((r) => r.json())
      .then((data) => setTicketTypes(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, [eventId]);

  const total = ticketTypes.reduce((sum, tt) => sum + (qty[tt.id] || 0) * tt.price_cents, 0);

  const startCheckout = async () => {
    setError("");
    const items = Object.entries(qty).filter(([, q]) => q > 0).map(([ticketTypeId, quantity]) => ({ ticketTypeId: Number(ticketTypeId), quantity }));
    if (items.length === 0) return setError("Select at least one ticket.");
    if (!buyerName.trim() || !buyerEmail.trim()) return setError("Name and email are required.");

    // Opened blank, synchronously, right here — before any `await` — so
    // the browser still counts it as triggered by this click and doesn't
    // silently block it (see the matching note in DonateDialog.tsx). We
    // navigate it to the real Stripe checkout URL once we have it below.
    // A free order never needs it, but we don't know that yet — closed
    // straight back down below if so.
    const popup = openBlankCheckoutPopup(contentRef.current);

    setSubmitting(true);
    try {
      const res = await fetch(`/api/ticketing/${eventId}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buyerName, buyerEmail, items }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Could not start checkout");

      if (data.free) {
        popup?.close();
        setFreeConfirmed(data.orderId);
        setSubmitting(false);
        return;
      }

      setWaitingOnPopup(true);
      attachCheckoutPopup(popup, data.url, {
        onResult: (result) => {
          setWaitingOnPopup(false);
          setSubmitting(false);
          if (result.status === "paid") {
            setPaidConfirmed(data.orderId);
          } else {
            setError("The checkout window was cancelled or the payment didn't go through.");
          }
        },
        onBlocked: () => {
          // Pop-up blocked — fall back to the old full-page redirect so
          // the payment can still go through.
          setWaitingOnPopup(false);
          window.location.href = data.url;
        },
        onClosedWithoutResult: () => {
          setWaitingOnPopup(false);
          setSubmitting(false);
          if (!data.sessionId) return;
          fetch(`/api/ticketing/session-status?session_id=${encodeURIComponent(data.sessionId)}`)
            .then((r) => r.json())
            .then((statusData) => {
              if (statusData.status === "paid") {
                setPaidConfirmed(data.orderId);
              } else {
                setError("We didn't receive confirmation of payment. If you completed the payment, it may still be processing.");
              }
            })
            .catch(() => {
              setError("We couldn't confirm whether the payment went through. Check your email, or contact us if you were charged.");
            });
        },
      });
    } catch (err: any) {
      popup?.close();
      setError(err.message || "Something went wrong");
      setSubmitting(false);
    }
  };

  return (
    // z-[60], not z-50: keeps this above any Radix Dialog that might still
    // be open behind it (Radix portals its dialogs to the end of <body>,
    // which paints on top of an equal z-index element mounted earlier).
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        ref={contentRef}
        className="bg-background rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-3 right-3 text-muted-foreground hover:text-foreground">
          <X size={22} />
        </button>

        <div className="p-6">
          <h2 className="text-xl font-bold mb-4">{eventTitle} — Get Tickets</h2>

          {freeConfirmed ? (
            <div className="text-center py-8 space-y-2">
              <p className="text-2xl">🎉</p>
              <p className="font-semibold">You're confirmed!</p>
              <p className="text-muted-foreground text-sm">Order #{freeConfirmed} — a confirmation has been recorded.</p>
              <Button onClick={onClose} className="mt-4">Close</Button>
            </div>
          ) : paidConfirmed ? (
            <div className="text-center py-8 space-y-2">
              <p className="text-2xl">🎉</p>
              <p className="font-semibold">Payment confirmed!</p>
              <p className="text-muted-foreground text-sm">Order #{paidConfirmed} — a confirmation has been recorded.</p>
              <Button onClick={onClose} className="mt-4">Close</Button>
            </div>
          ) : waitingOnPopup ? (
            <div className="text-center py-8 space-y-2">
              <p className="text-2xl">💳</p>
              <p className="font-semibold">Complete your payment in the popup window</p>
              <p className="text-sm text-muted-foreground">This will update automatically once payment is confirmed.</p>
              <Button variant="outline" onClick={onClose} className="mt-2">Cancel</Button>
            </div>
          ) : loading ? (
            <p className="text-muted-foreground text-sm">Loading ticket options...</p>
          ) : ticketTypes.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No paid tickets have been set up for this event yet — use the free registration form below instead.
            </p>
          ) : (
            <div className="space-y-4">
              {ticketTypes.map((tt) => {
                const remaining = tt.quantity_total > 0 ? Math.max(tt.quantity_total - tt.quantity_sold, 0) : null;
                return (
                  <div key={tt.id} className="flex items-center justify-between border-b border-border pb-3">
                    <div>
                      <p className="font-medium">{tt.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {tt.price_cents === 0 ? "Free" : `$${(tt.price_cents / 100).toFixed(2)}`}
                        {remaining !== null && ` · ${remaining} left`}
                      </p>
                    </div>
                    <Input
                      type="number" min={0} max={remaining ?? 99} className="w-16"
                      value={qty[tt.id] || 0}
                      onChange={(e) => setQty({ ...qty, [tt.id]: Number(e.target.value) })}
                    />
                  </div>
                );
              })}

              <div className="space-y-2">
                <Label>Your name</Label>
                <Input value={buyerName} onChange={(e) => setBuyerName(e.target.value)} />
                <Label>Email</Label>
                <Input type="email" value={buyerEmail} onChange={(e) => setBuyerEmail(e.target.value)} />
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}
              <p className="font-bold">Total: ${(total / 100).toFixed(2)} AUD</p>
              <Button onClick={startCheckout} disabled={submitting} className="w-full btn-hero">
                {submitting ? "Preparing checkout..." : total === 0 ? "Confirm free tickets" : "Continue to payment"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
