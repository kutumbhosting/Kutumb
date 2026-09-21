import { useEffect, useRef, useState } from "react";
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
  if (!res.ok) {
    const err: any = new Error(data?.message || "Request failed");
    err.canOverride = !!data?.canOverride;
    throw err;
  }
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
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const scannerRef = useRef<any>(null);
  const lastScanRef = useRef<{ token: string; at: number } | null>(null);

  const eventOptions = Array.from(
    new Set(Object.values(groupedEvents).map((rows: any) => rows[0]?.eventName).filter(Boolean))
  );

  const load = async (id: string) => {
    if (!id) return;
    const data = await api(`/api/checkin/${slugify(id)}/attendees`).catch(() => []);
    setAttendees(data);
  };

  useEffect(() => { if (eventId) load(eventId); }, [eventId]);

  const scan = async (qrToken: string, override = false) => {
    try {
      const result = await api("/api/checkin/scan", { method: "POST", body: JSON.stringify({ qrToken, override }) });
      toast({ title: "✅ Checked in", description: result.attendee?.name || result.attendee?.email });
      setTokenInput("");
      load(eventId);
    } catch (err: any) {
      // 409 = already checked in — offer an explicit override instead of
      // silently failing, so a genuine duplicate scan can still be
      // deliberately confirmed by an authorised admin.
      if (err.canOverride || /already checked in/i.test(err.message || "")) {
        toast({
          title: "Already checked in",
          description: `${err.message} — scan again within 10s to override, or use the list below.`,
          variant: "destructive",
        });
        return;
      }
      toast({ title: "Check-in failed", description: err.message, variant: "destructive" });
    }
  };

  // A second scan of the SAME token within 10 seconds is treated as a
  // deliberate override (e.g. staff scanning twice on purpose to correct a
  // mistake); any other token always starts fresh.
  const handleDecodedToken = (token: string) => {
    const now = Date.now();
    const isRepeat = lastScanRef.current?.token === token && now - lastScanRef.current.at < 10000;
    lastScanRef.current = { token, at: now };
    scan(token, isRepeat);
  };

  const manualCheckIn = async (id: string | number) => {
    try {
      await api(`/api/checkin/manual/${id}`, { method: "POST" });
      toast({ title: "Checked in" });
      load(eventId);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  // ── Camera scanning (html5-qrcode) — starts/stops the device camera only
  // while the scanner panel is open, and is fully optional: staff can
  // always fall back to typing/pasting the token below instead. ──────────
  useEffect(() => {
    if (!cameraOpen) return;
    let cancelled = false;
    setCameraError("");

    (async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (cancelled) return;
        const scanner = new Html5Qrcode("qr-camera-reader");
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: 250 },
          (decodedText: string) => handleDecodedToken(decodedText),
          () => {} // per-frame "no QR found yet" — ignored, not an error
        );
      } catch (err: any) {
        if (!cancelled) setCameraError(err?.message || "Could not access the camera");
      }
    })();

    return () => {
      cancelled = true;
      const scanner = scannerRef.current;
      if (scanner) {
        scanner.stop().then(() => scanner.clear()).catch(() => {});
        scannerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraOpen, eventId]);

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
          <div className="border rounded-lg p-4 max-w-lg space-y-3">
            <div className="flex items-center justify-between">
              <Label>Scan attendee QR code</Label>
              <Button size="sm" variant="outline" onClick={() => setCameraOpen((v) => !v)}>
                {cameraOpen ? "✕ Close Camera" : "📷 Scan with Camera"}
              </Button>
            </div>

            {cameraOpen && (
              <div className="space-y-2">
                <div id="qr-camera-reader" className="w-full rounded-md overflow-hidden border" />
                {cameraError && (
                  <p className="text-xs text-destructive">
                    {cameraError}. Make sure you've allowed camera access, or use the field below instead.
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Point the camera at an attendee's QR code. It checks them in automatically the moment it's recognised.
                </p>
              </div>
            )}

            <div className="flex gap-2">
              <Input
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="Or type/paste the QR token from the attendee's e-ticket"
                onKeyDown={(e) => e.key === "Enter" && tokenInput && scan(tokenInput)}
              />
              <Button onClick={() => tokenInput && scan(tokenInput)}>Check in</Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Already checked in? Scanning (or submitting) the same code again within 10 seconds overrides it —
              otherwise use the manual list below.
            </p>
          </div>

          <div className="border rounded-lg p-4 max-w-2xl">
            <div className="flex flex-wrap justify-between items-center gap-2 mb-3">
              <h3 className="font-bold">Attendees ({attendees.length})</h3>
              <Input className="w-full sm:w-48" placeholder="Search name/email" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="overflow-x-auto">
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
            </div>
            {attendees.length === 0 && <p className="text-sm text-muted-foreground">No ticketed attendees for this event yet.</p>}
          </div>
        </>
      )}
    </div>
  );
}
