import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

async function api(path: string, options: RequestInit = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers as any) },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.message || "Request failed");
  return data;
}

// Ticketing is keyed by a plain event id (slug) — any upcoming event's
// title, lowercased and hyphenated, works as this key.
const slugify = (t: string) => t?.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^\w-]+/g, "");

interface TicketingManagerProps {
  groupedEvents: Record<string, any[]>;
}

export default function TicketingManager({ groupedEvents }: TicketingManagerProps) {
  const { toast } = useToast();
  const [eventId, setEventId] = useState("");
  const [ticketTypes, setTicketTypes] = useState<any[]>([]);
  const [capacity, setCapacity] = useState<number | null>(null);
  const [allocated, setAllocated] = useState(0);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [waitlist, setWaitlist] = useState<any[]>([]);
  const [form, setForm] = useState({ name: "", price: "0", totalSeats: "" });

  const eventOptions = Array.from(
    new Set(Object.values(groupedEvents).map((rows: any) => rows[0]?.eventName).filter(Boolean))
  );

  const load = async (id: string) => {
    if (!id) return;
    const slug = slugify(id);
    const [ttResult, ord, wl] = await Promise.all([
      api(`/api/ticketing/admin/${slug}/ticket-types`).catch(() => ({ ticketTypes: [], capacity: null, allocated: 0, remaining: null })),
      api(`/api/ticketing/admin/${slug}/orders`).catch(() => []),
      api(`/api/ticketing/admin/${slug}/waitlist`).catch(() => []),
    ]);
    setTicketTypes(ttResult.ticketTypes || []);
    setCapacity(ttResult.capacity);
    setAllocated(ttResult.allocated || 0);
    setRemaining(ttResult.remaining);
    setOrders(ord);
    setWaitlist(wl);
  };

  useEffect(() => { if (eventId) load(eventId); }, [eventId]);

  const addTicketType = async () => {
    if (!eventId || !form.name.trim()) return;
    const totalSeats = form.totalSeats.trim() === "" ? 0 : Number(form.totalSeats);
    try {
      await api(`/api/ticketing/admin/${slugify(eventId)}/ticket-types`, {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          priceCents: Math.round(Number(form.price) * 100),
          quantityTotal: totalSeats,
        }),
      });
      toast({ title: "Ticket type added" });
      setForm({ name: "", price: "0", totalSeats: "" });
      load(eventId);
    } catch (err: any) {
      toast({ title: "Couldn't add ticket type", description: err.message, variant: "destructive" });
    }
  };

  const deleteTicketType = async (id: number) => {
    if (!confirm("Delete this ticket type?")) return;
    await api(`/api/ticketing/admin/ticket-types/${id}`, { method: "DELETE" });
    load(eventId);
  };

  return (
    <div className="space-y-6">
      <div className="max-w-md">
        <Label>Event</Label>
        <select
          className="w-full mt-1 p-2 border rounded text-foreground bg-background"
          value={eventId}
          onChange={(e) => setEventId(e.target.value)}
        >
          <option value="">-- Choose an event to sell tickets for --</option>
          {eventOptions.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        <p className="text-xs text-muted-foreground mt-1">
          Or type any event name/id manually below if it's not in the dropdown yet.
        </p>
        <Input className="mt-2" placeholder="Event id / name" value={eventId} onChange={(e) => setEventId(e.target.value)} />
      </div>

      {eventId && (
        <>
          <div className="border rounded-lg p-4 space-y-3 max-w-lg">
            <div className="flex items-baseline justify-between">
              <h3 className="font-bold">Ticket types</h3>
              {capacity !== null && (
                <p className="text-sm text-muted-foreground">
                  {allocated} / {capacity} seats allocated
                  {remaining !== null && remaining > 0 && <span className="text-amber-600"> · {remaining} not yet assigned to a ticket type</span>}
                </p>
              )}
            </div>
            {capacity === null && (
              <p className="text-xs text-muted-foreground">
                This event isn't in Upcoming Events yet, so there's no capacity to check ticket totals against.
              </p>
            )}

            {ticketTypes.map((tt) => (
              <div key={tt.id} className="flex items-center justify-between border-b pb-2">
                <div>
                  <p className="font-medium">{tt.name}</p>
                  <p className="text-sm text-muted-foreground">
                    ${(tt.price_cents / 100).toFixed(2)} · {tt.quantity_sold} sold / {tt.quantity_total || "∞"} total seats
                  </p>
                </div>
                <Button size="sm" variant="destructive" onClick={() => deleteTicketType(tt.id)}>Delete</Button>
              </div>
            ))}
            {ticketTypes.length === 0 && <p className="text-sm text-muted-foreground">No ticket types yet.</p>}

            <div className="grid grid-cols-3 gap-2 pt-2">
              <div>
                <Label className="text-xs">Name</Label>
                <Input placeholder="e.g. General" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Price ($)</Label>
                <Input type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Total seats{remaining !== null ? ` (${remaining} left)` : ""}</Label>
                <Input
                  type="number" min="0" max={remaining ?? undefined}
                  placeholder={remaining !== null ? String(remaining) : "0 = unlimited"}
                  value={form.totalSeats}
                  onChange={(e) => setForm({ ...form, totalSeats: e.target.value })}
                />
              </div>
            </div>
            <Button onClick={addTicketType}>Add ticket type</Button>
          </div>

          <div className="border rounded-lg p-4 max-w-2xl">
            <h3 className="font-bold mb-3">Orders ({orders.length})</h3>
            <table className="w-full text-sm">
              <thead><tr className="text-left border-b"><th className="py-1">Buyer</th><th>Status</th><th>Total</th></tr></thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className="border-b">
                    <td className="py-1">{o.buyer_name} ({o.buyer_email})</td>
                    <td>{o.status}</td>
                    <td>${(o.total_cents / 100).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border rounded-lg p-4 max-w-2xl">
            <h3 className="font-bold mb-3">Waitlist ({waitlist.length})</h3>
            {waitlist.map((w) => (
              <p key={w.id} className="text-sm border-b py-1">{w.name} ({w.email}) — {w.requested_qty} spot(s)</p>
            ))}
            {waitlist.length === 0 && <p className="text-sm text-muted-foreground">No one on the waitlist.</p>}
          </div>
        </>
      )}
    </div>
  );
}
