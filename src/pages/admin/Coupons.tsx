import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { safeFetch } from "./safeFetch";

interface CouponsProps {
  groupedEvents: Record<string, any[]>;
}

// Generates, lists and voids event-specific coupons. Coupons are
// single-use (see server/lib/coupons.js) — once redeemed against a
// registration they can never be applied again.
const Coupons = ({ groupedEvents }: CouponsProps) => {
  const { toast } = useToast();

  const eventOptions = Object.entries(groupedEvents)
    .map(([key, rows]: any) => ({ key, eventName: rows[0]?.eventName, eventYear: rows[0]?.eventYear }))
    .filter((e) => e.eventName);

  const [selectedKey, setSelectedKey] = useState("");
  const selected = eventOptions.find((e) => e.key === selectedKey) || null;

  const [coupons, setCoupons] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const [amount, setAmount] = useState("0");
  const [count, setCount] = useState("1");
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [generating, setGenerating] = useState(false);

  const loadCoupons = async (eventName: string, eventYear: string) => {
    setLoading(true);
    try {
      const data = await safeFetch(
        `/api/coupons/admin?eventName=${encodeURIComponent(eventName)}&eventYear=${encodeURIComponent(eventYear)}`
      );
      setCoupons(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  };

  const onSelectEvent = (key: string) => {
    setSelectedKey(key);
    const ev = eventOptions.find((e) => e.key === key);
    if (ev) loadCoupons(ev.eventName, ev.eventYear);
    else setCoupons([]);
  };

  const generateCoupons = async () => {
    if (!selected) return;
    if (!(Number(amount) > 0)) {
      toast({ title: "Enter a coupon amount", variant: "destructive" });
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch("/api/coupons/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventName: selected.eventName,
          eventYear: selected.eventYear,
          amount: Number(amount),
          count: Number(count) || 1,
          recipientName: recipientName || undefined,
          recipientEmail: recipientEmail || undefined,
          notes: notes || undefined,
          validUntil: validUntil || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to generate coupon(s)");
      toast({ title: "Success 🎟️", description: `Generated ${data.length} coupon(s).` });
      setRecipientName("");
      setRecipientEmail("");
      setNotes("");
      loadCoupons(selected.eventName, selected.eventYear);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const voidCoupon = async (id: number) => {
    try {
      const res = await fetch(`/api/coupons/admin/${id}/void`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Could not void this coupon");
      toast({ title: "Coupon voided" });
      if (selected) loadCoupons(selected.eventName, selected.eventYear);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div>
      <div className="mb-6 max-w-md">
        <Label>Select Event</Label>
        <select
          className="w-full mt-2 p-2 border rounded text-foreground bg-background"
          value={selectedKey}
          onChange={(e) => onSelectEvent(e.target.value)}
        >
          <option value="">-- Choose Event --</option>
          {eventOptions.map((e) => (
            <option key={e.key} value={e.key}>
              {e.eventName} {e.eventYear}
            </option>
          ))}
        </select>
      </div>

      {selected && (
        <>
          <Card className="mb-6">
            <CardContent className="p-6 space-y-4">
              <h2 className="text-xl font-bold">
                Generate Coupons — {selected.eventName} {selected.eventYear}
              </h2>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label>Coupon Amount ($) *</Label>
                  <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-2" />
                </div>
                <div>
                  <Label>How many coupons?</Label>
                  <Input type="number" min="1" max="100" value={count} onChange={(e) => setCount(e.target.value)} className="mt-2" />
                </div>
                <div>
                  <Label>Recipient Name (optional)</Label>
                  <Input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} className="mt-2" placeholder="Who this coupon is for" />
                </div>
                <div>
                  <Label>Recipient Email (optional)</Label>
                  <Input value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} className="mt-2" placeholder="For sharing the coupon" />
                </div>
                <div>
                  <Label>Valid Until (optional)</Label>
                  <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className="mt-2" />
                </div>
                <div>
                  <Label>Notes / Conditions (optional)</Label>
                  <Input value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-2" placeholder="e.g. Volunteer thank-you coupon" />
                </div>
              </div>
              <Button onClick={generateCoupons} disabled={generating}>
                {generating ? "Generating..." : "🎟️ Generate Coupon(s)"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Each coupon is single-use — once it's applied to a registration it can never be redeemed again.
                Share the code (or the QR code below) with the person it's intended for.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <h3 className="font-bold mb-4">
                Coupons for {selected.eventName} {selected.eventYear} {loading && "(loading...)"}
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="p-2">QR</th>
                      <th className="p-2">Code</th>
                      <th className="p-2">Amount</th>
                      <th className="p-2">Recipient</th>
                      <th className="p-2">Status</th>
                      <th className="p-2">Valid Until</th>
                      <th className="p-2">Notes</th>
                      <th className="p-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {coupons.map((c) => (
                      <tr key={c.id} className="border-b">
                        <td className="p-2">
                          {c.qr_code && <img src={c.qr_code} alt={c.code} className="w-12 h-12 border rounded bg-white" />}
                        </td>
                        <td className="p-2 font-mono font-medium">{c.code}</td>
                        <td className="p-2">${Number(c.amount).toFixed(2)}</td>
                        <td className="p-2">
                          {c.recipient_name || c.recipient_email ? (
                            <>
                              {c.recipient_name}
                              {c.recipient_email && <div className="text-xs text-muted-foreground">{c.recipient_email}</div>}
                            </>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="p-2">
                          {c.status === "active" ? (
                            <span className="text-green-700 font-medium">Active</span>
                          ) : c.status === "used" ? (
                            <span className="text-muted-foreground">Used{c.redeemed_at ? ` — ${new Date(c.redeemed_at).toLocaleDateString("en-AU")}` : ""}</span>
                          ) : (
                            <span className="text-red-600">Void</span>
                          )}
                        </td>
                        <td className="p-2 whitespace-nowrap">
                          {c.valid_until ? new Date(c.valid_until).toLocaleDateString("en-AU") : "No expiry"}
                        </td>
                        <td className="p-2 max-w-[200px] truncate" title={c.notes || ""}>{c.notes || "-"}</td>
                        <td className="p-2">
                          {c.status === "active" && (
                            <Button size="sm" variant="destructive" onClick={() => voidCoupon(c.id)}>
                              Void
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {coupons.length === 0 && !loading && (
                      <tr>
                        <td colSpan={8} className="p-4 text-center text-muted-foreground">
                          No coupons generated yet for this event.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default Coupons;
