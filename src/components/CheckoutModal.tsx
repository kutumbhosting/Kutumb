import { useEffect, useState } from "react";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { getStripePromise } from "@/lib/stripe";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X } from "lucide-react";

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
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [freeConfirmed, setFreeConfirmed] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
        setFreeConfirmed(data.orderId);
      } else {
        setClientSecret(data.clientSecret);
      }
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
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
          ) : clientSecret ? (
            <EmbeddedCheckoutProvider stripe={getStripePromise()} options={{ clientSecret }}>
              <EmbeddedCheckout />
            </EmbeddedCheckoutProvider>
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
