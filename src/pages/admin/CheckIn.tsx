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

const slugify = (t: string) => t?.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^\w-]+/g, "");

interface CheckInProps {
  groupedEvents: Record<string, any[]>;
}

export default function CheckIn({ groupedEvents }: CheckInProps) {
  const { toast } = useToast();
  const [eventId, setEventId] = useState("");
  const [attendees, setAttendees] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [tokenInput, setTokenInput] = useState("");

  const eventOptions = Array.from(
    new Set(Object.values(groupedEvents).map((rows: any) => rows[0]?.eventName).filter(Boolean))
  );

  const load = async (id: string) => {
    if (!id) return;
    const data = await api(`/api/checkin/${slugify(id)}/attendees`).catch(() => []);
    setAttendees(data);
  };

  useEffect(() => { if (eventId) load(eventId); }, [eventId]);

  const scan = async (qrToken: string) => {
    try {
      const result = await api("/api/checkin/scan", { method: "POST", body: JSON.stringify({ qrToken }) });
      toast({ title: "✅ Checked in", description: result.attendee?.name || result.attendee?.email });
      setTokenInput("");
      load(eventId);
    } catch (err: any) {
      toast({ title: "Check-in failed", description: err.message, variant: "destructive" });
    }
  };

  const manualCheckIn = async (id: number) => {
    try {
      await api(`/api/checkin/manual/${id}`, { method: "POST" });
      toast({ title: "Checked in" });
      load(eventId);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const filtered = attendees.filter(
    (a) => !search || a.name?.toLowerCase().includes(search.toLowerCase()) || a.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="max-w-md">
        <Label>Event</Label>
        <select
          className="w-full mt-1 p-2 border rounded text-foreground bg-background"
          value={eventId}
          onChange={(e) => setEventId(e.target.value)}
        >
          <option value="">-- Choose an event --</option>
          {eventOptions.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        <Input className="mt-2" placeholder="Or type event id / name" value={eventId} onChange={(e) => setEventId(e.target.value)} />
      </div>

      {eventId && (
        <>
          <div className="border rounded-lg p-4 max-w-lg space-y-2">
            <Label>Scan / paste QR token</Label>
            <div className="flex gap-2">
              <Input
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="QR token from the attendee's e-ticket"
                onKeyDown={(e) => e.key === "Enter" && tokenInput && scan(tokenInput)}
              />
              <Button onClick={() => tokenInput && scan(tokenInput)}>Check in</Button>
            </div>
            <p className="text-xs text-muted-foreground">
              A camera scanner can be wired in later — for now, staff can type/paste the token, or use the manual list below.
            </p>
          </div>

          <div className="border rounded-lg p-4 max-w-2xl">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-bold">Attendees ({attendees.length})</h3>
              <Input className="w-48" placeholder="Search name/email" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <table className="w-full text-sm">
              <thead><tr className="text-left border-b"><th className="py-1">Name</th><th>Ticket</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {filtered.map((a) => (
                  <tr key={a.id} className="border-b">
                    <td className="py-1">{a.name} ({a.email})</td>
                    <td>{a.ticket_type_name}</td>
                    <td>{a.checked_in_at ? `✅ ${new Date(a.checked_in_at).toLocaleTimeString()}` : "—"}</td>
                    <td>
                      {!a.checked_in_at && (
                        <Button size="sm" onClick={() => manualCheckIn(a.id)}>Check in</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {attendees.length === 0 && <p className="text-sm text-muted-foreground">No ticketed attendees for this event yet.</p>}
          </div>
        </>
      )}
    </div>
  );
}
