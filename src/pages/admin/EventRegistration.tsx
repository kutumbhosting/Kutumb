import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { safeFetch, downloadCSV } from "./safeFetch";

interface EventRegistrationProps {
  groupedEvents: Record<string, any[]>;
  onReload: () => void;
}

const EventRegistration = ({ groupedEvents, onReload }: EventRegistrationProps) => {
  const { toast } = useToast();

  const [selectedEventKey, setSelectedEventKey] = useState<string>("");
  const [selectedEventRows, setSelectedEventRows] = useState<string[]>([]);
  const [editingEvent, setEditingEvent] = useState<any | null>(null);
  const [eventActionMessage, setEventActionMessage] = useState("");

  // ─── derived: selected event ─────────────────────────────────────────────
  const selectedEvent =
    selectedEventKey && groupedEvents[selectedEventKey]?.length
      ? {
          members: groupedEvents[selectedEventKey],
          eventName: groupedEvents[selectedEventKey][0]?.eventName,
          eventYear: groupedEvents[selectedEventKey][0]?.eventYear,
          adults: groupedEvents[selectedEventKey].reduce(
            (sum: number, m: any) => sum + 1 + Number(m.adults || 0), 0
          ),
          children: groupedEvents[selectedEventKey].reduce(
            (sum: number, m: any) => sum + Number(m.children || 0), 0
          ),
          totalPeople: groupedEvents[selectedEventKey].reduce(
            (sum: number, m: any) => sum + 1 + Number(m.adults || 0) + Number(m.children || 0), 0
          ),
          totalFees: groupedEvents[selectedEventKey].reduce(
            (sum: number, m: any) => sum + Number(m.fee || 0), 0
          ),
        }
      : null;

  const toggleEventRow = (email: string) =>
    setSelectedEventRows((prev) =>
      prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email]
    );

  const deleteEventRows = async () => {
    try {
      const res = await fetch("/api/events/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventName: selectedEvent?.eventName,
          eventYear: selectedEvent?.eventYear,
          emails: selectedEventRows,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Delete failed");
      setEventActionMessage(`✅ ${data.message || "Deleted successfully"}`);
      setSelectedEventRows([]);
      onReload();
    } catch (err: any) {
      setEventActionMessage(`❌ ${err.message}`);
    }
  };

  return (
    <div>
      {/* ── Event selector ── */}
      <div className="mb-6 max-w-md">
        <label className="text-sm font-medium">Select Event</label>
        <p className="text-xs text-muted-foreground mt-1">
          {Object.keys(groupedEvents).length === 0
            ? "⚠️ No events loaded — check console for errors"
            : `${Object.keys(groupedEvents).length} event(s) loaded`}
        </p>

        <select
          className="w-full mt-2 p-2 border rounded text-foreground bg-background"
          value={selectedEventKey}
          onChange={(e) => {
            setSelectedEventKey(e.target.value);
            setSelectedEventRows([]);
            setEditingEvent(null);
            setEventActionMessage("");
          }}
        >
          <option value="">-- Choose Event --</option>
          {Object.entries(groupedEvents).map(([key, events]: any) => {
            const first = events?.[0];
            if (!first) return null;
            return (
              <option key={key} value={key}>
                {first.eventName} {first.eventYear}
              </option>
            );
          })}
        </select>

        <Button variant="outline" size="sm" className="mt-2" onClick={onReload}>
          🔄 Reload Events
        </Button>
      </div>

      {/* ── Event table ── */}
      {selectedEvent?.members?.length > 0 && (
        <Card className="mb-6">
          <CardContent className="p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-xl font-bold">
                  {selectedEvent.eventName} {selectedEvent.eventYear}
                </h2>
                <div className="flex gap-4 text-sm text-muted-foreground mt-1 flex-wrap">
                  <span>Total People: {selectedEvent.totalPeople}</span>
                  <span>👨 Adults: {selectedEvent.adults}</span>
                  <span>🧒 Children: {selectedEvent.children}</span>
                  <span>💰 Fees Collected: ${selectedEvent.totalFees}</span>
                </div>
              </div>
              <Button
                onClick={() =>
                  downloadCSV(
                    selectedEvent?.members || [],
                    `${selectedEvent?.eventName || "event"}_${selectedEvent?.eventYear || "unknown"}.csv`
                  )
                }
              >
                Download CSV
              </Button>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 mb-3">
              {selectedEventRows.length > 0 && (
                <Button variant="destructive" onClick={deleteEventRows}>
                  Delete Selected
                </Button>
              )}
              <Button
                onClick={() => {
                  if (!selectedEventRows.length) return;
                  const member = selectedEvent?.members.find(
                    (m: any) => m.email === selectedEventRows[0]
                  );
                  if (!member) return;
                  setEditingEvent({ ...member });
                }}
                disabled={selectedEventRows.length !== 1}
              >
                Modify Selected
              </Button>
            </div>

            {eventActionMessage && (
              <div className="mt-3 text-sm font-medium text-blue-600">
                {eventActionMessage}
              </div>
            )}

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="p-2"></th>
                    <th className="p-2 text-left">Reg. No</th>
                    <th className="p-2 text-left">Name</th>
                    <th className="p-2 text-left">Email</th>
                    <th className="p-2 text-left">Phone</th>
                    <th className="p-2 text-left">Adults</th>
                    <th className="p-2 text-left">Children</th>
                    <th className="p-2 text-left">Fee</th>
                    <th className="p-2 text-left">Membership No</th>
                    <th className="p-2 text-left">Comments</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedEvent?.members?.map((item, i) => (
                    <tr key={i} className="border-b">
                      <td className="p-2">
                        <input
                          type="checkbox"
                          checked={selectedEventRows.includes(item.email)}
                          onChange={() => toggleEventRow(item.email)}
                        />
                      </td>
                      <td className="p-2">{item.registrationNumber || "-"}</td>
                      <td className="p-2">{item.name}</td>
                      <td className="p-2">{item.email}</td>
                      <td className="p-2">{item.phone}</td>
                      <td className="p-2">{item.adults}</td>
                      <td className="p-2">{item.children}</td>
                      <td className="p-2">{typeof item.fee === "number" ? `$${item.fee}` : "-"}</td>
                      <td className="p-2">{item.membershipNumber || "-"}</td>
                      <td className="p-2">{item.comments || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Edit form */}
            {editingEvent && (
              <Card className="mt-4">
                <CardContent className="p-4 space-y-3">
                  <h3 className="font-bold">Edit Registration</h3>
                  <Input
                    placeholder="Name"
                    value={editingEvent.name}
                    onChange={(e) => setEditingEvent({ ...editingEvent, name: e.target.value })}
                  />
                  <Input
                    placeholder="Phone"
                    value={editingEvent.phone}
                    onChange={(e) => setEditingEvent({ ...editingEvent, phone: e.target.value })}
                  />
                  <Input
                    type="number"
                    placeholder="Adults"
                    value={editingEvent.adults}
                    onChange={(e) => setEditingEvent({ ...editingEvent, adults: e.target.value })}
                  />
                  <Input
                    type="number"
                    placeholder="Children"
                    value={editingEvent.children}
                    onChange={(e) => setEditingEvent({ ...editingEvent, children: e.target.value })}
                  />
                  <Input
                    type="number"
                    placeholder="Fee"
                    value={editingEvent.fee ?? 0}
                    onChange={(e) => setEditingEvent({ ...editingEvent, fee: e.target.value })}
                  />
                  <Input
                    placeholder="Comments"
                    value={editingEvent.comments || ""}
                    onChange={(e) => setEditingEvent({ ...editingEvent, comments: e.target.value })}
                  />
                  <div className="flex gap-2">
                    <Button
                      onClick={async () => {
                        try {
                          const res = await fetch("/api/events/update", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              eventName: selectedEvent?.eventName,
                              eventYear: selectedEvent?.eventYear,
                              email: editingEvent.email,
                              updatedData: {
                                ...editingEvent,
                                adults: Number(editingEvent.adults),
                                children: Number(editingEvent.children),
                                fee: Number(editingEvent.fee) || 0,
                              },
                            }),
                          });
                          const data = await res.json();
                          if (!res.ok) throw new Error(data.message || "Update failed");
                          toast({ title: "Success 🎉", description: data.message || "Updated successfully" });
                          setEditingEvent(null);
                          setSelectedEventRows([]);
                          onReload();
                        } catch (err: any) {
                          toast({ title: "Error", description: err.message, variant: "destructive" });
                        }
                      }}
                    >
                      Save Changes
                    </Button>
                    <Button variant="outline" onClick={() => setEditingEvent(null)}>
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default EventRegistration;
