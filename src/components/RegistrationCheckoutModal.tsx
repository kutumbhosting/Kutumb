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
  price_cents: number;
  quantity_total: number;
  quantity_sold: number;
}

interface RegistrationCheckoutModalProps {
  eventTitle: string;
  buyerName: string;
  buyerEmail: string;
  /** Total attendees (adults + children + the registrant) — used as the
   *  default quantity when a real ticket type is selected. */
  defaultQuantity: number;
  /** The already-computed total fee for the whole registration (member/
   *  non-member rate × attendees) — used as the price for the automatic
   *  "General" fallback when no admin-configured ticket types exist. */
  totalFee: number;
  onClose: () => void;
}

// Triggered automatically from the registration success flow whenever a
// fee applies. Lets the person pay by card immediately instead of only
// seeing the bank-transfer option. Ticket type is a dropdown of whatever
// the admin has configured for this event — if nothing's configured yet,
// it silently falls back to a single "General" option priced at the fee
// they were already quoted, and the server auto-creates that ticket type
// the first time anyone actually pays with it.
export default function RegistrationCheckoutModal({
  eventTitle,
  buyerName,
  buyerEmail,
  defaultQuantity,
  totalFee,
  onClose,
}: RegistrationCheckoutModalProps) {
  const eventId = slugify(eventTitle);
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string>("");
  const [quantity, setQuantity] = useState(defaultQuantity);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch(`/api/ticketing/${eventId}/ticket-types`)
      .then((r) => r.json())
      .then((data: TicketType[]) => {
        setTicketTypes(Array.isArray(data) ? data : []);
        if (Array.isArray(data) && data.length > 0) setSelectedId(String(data[0].id));
      })
      .finally(() => setLoading(false));
  }, [eventId]);

  const usingGeneral = ticketTypes.length === 0;
  const selectedType = ticketTypes.find((tt) => String(tt.id) === selectedId);
  const unitPriceCents = usingGeneral ? Math.round(totalFee * 100) : (selectedType?.price_cents ?? 0);
  const effectiveQuantity = usingGeneral ? 1 : quantity;
  const total = unitPriceCents * effectiveQuantity;

  const startCheckout = async () => {
    setError("");
    if (!usingGeneral && !selectedId) return setError("Please select a ticket type.");
    if (effectiveQuantity < 1) return setError("Quantity must be at least 1.");

    setSubmitting(true);
    try {
      const items = usingGeneral
        ? [{ ticketTypeId: "general", quantity: 1, generalPriceCents: Math.round(totalFee * 100) }]
        : [{ ticketTypeId: Number(selectedId), quantity }];

      const res = await fetch(`/api/ticketing/${eventId}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buyerName, buyerEmail, items }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Could not start checkout");
      setClientSecret(data.clientSecret);
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
          <h2 className="text-xl font-bold mb-1">Pay by Card</h2>
          <p className="text-sm text-muted-foreground mb-4">{eventTitle}</p>

          {clientSecret ? (
            <EmbeddedCheckoutProvider stripe={getStripePromise()} options={{ clientSecret }}>
              <EmbeddedCheckout />
            </EmbeddedCheckoutProvider>
          ) : loading ? (
            <p className="text-muted-foreground text-sm">Loading...</p>
          ) : (
            <div className="space-y-4">
              <div>
                <Label>Ticket type</Label>
                {usingGeneral ? (
                  <div className="mt-1 p-2 border rounded bg-muted text-sm">
                    General — ${totalFee.toFixed(2)} <span className="text-muted-foreground">(standard registration fee)</span>
                  </div>
                ) : (
                  <select
                    className="w-full mt-1 p-2 border rounded text-foreground bg-background"
                    value={selectedId}
                    onChange={(e) => setSelectedId(e.target.value)}
                  >
                    {ticketTypes.map((tt) => {
                      const remaining = tt.quantity_total > 0 ? Math.max(tt.quantity_total - tt.quantity_sold, 0) : null;
                      return (
                        <option key={tt.id} value={tt.id}>
                          {tt.name} — ${(tt.price_cents / 100).toFixed(2)}{remaining !== null ? ` (${remaining} left)` : ""}
                        </option>
                      );
                    })}
                  </select>
                )}
              </div>

              {!usingGeneral && (
                <div>
                  <Label>Quantity</Label>
                  <Input type="number" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
                </div>
              )}

              {error && <p className="text-sm text-destructive">{error}</p>}
              <p className="font-bold">Total: ${(total / 100).toFixed(2)} AUD</p>
              <Button onClick={startCheckout} disabled={submitting} className="w-full btn-hero">
                {submitting ? "Preparing checkout..." : "Continue to payment"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
