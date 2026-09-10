import { useState, useRef } from "react";
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
  const [justOpened, setJustOpened] = useState(false);
  const editPanelRef = useRef<HTMLDivElement | null>(null);

  // ── Search / filter / sort ──────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortKey, setSortKey] = useState<
    "registrationNumber" | "name" | "email" | "phone" | "adults" | "children" | "fee" | "paymentStatus" | "transactionNumber" | "membershipNumber"
  >("registrationNumber");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

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

  const visibleRegistrations = (selectedEvent?.members || [])
    .filter((m: any) => {
      if (statusFilter && (m.paymentStatus || "N/A") !== statusFilter) return false;
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      return [m.registrationNumber, m.name, m.email, m.phone, m.transactionNumber, m.membershipNumber, m.comments]
        .some((field: any) => String(field || "").toLowerCase().includes(q));
    })
    .sort((a: any, b: any) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "number" || typeof bv === "number") {
        const cmp = (Number(av) || 0) - (Number(bv) || 0);
        return sortDir === "asc" ? cmp : -cmp;
      }
      const cmp = String(av || "").toLowerCase().localeCompare(String(bv || "").toLowerCase(), undefined, { numeric: true });
      return sortDir === "asc" ? cmp : -cmp;
    });

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
            setSearch("");
            setStatusFilter("");
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
            <div className="flex flex-wrap justify-between items-start gap-3 mb-4">
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

                  // Scroll to and flash the edit panel so it's obvious it opened.
                  setJustOpened(true);
                  setTimeout(() => {
                    editPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }, 50);
                  setTimeout(() => setJustOpened(false), 1200);
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

            <div className="flex flex-wrap gap-2 mb-3 mt-3">
              <Input
                placeholder="Search by name, email, phone, transaction no, membership no, comments..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-sm"
              />
              <select
                className="border rounded-md px-3 py-2 text-sm bg-background"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">All payment statuses</option>
                <option value="N/A">N/A (no fee)</option>
                <option value="Pending">Pending</option>
                <option value="Paid">Paid</option>
              </select>
              {(search.trim() || statusFilter) && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setSearch("");
                    setStatusFilter("");
                  }}
                >
                  Clear filters
                </Button>
              )}
              {(search.trim() || statusFilter) && (
                <span className="text-sm text-muted-foreground self-center">
                  Showing {visibleRegistrations.length} of {selectedEvent.members.length}
                </span>
              )}
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="p-2"></th>
                    {[
                      { key: "registrationNumber" as const, label: "Reg. No" },
                      { key: "name" as const, label: "Name" },
                      { key: "email" as const, label: "Email" },
                      { key: "phone" as const, label: "Phone" },
                      { key: "adults" as const, label: "Adults" },
                      { key: "children" as const, label: "Children" },
                      { key: "fee" as const, label: "Fee" },
                      { key: "paymentStatus" as const, label: "Payment Status" },
                      { key: "transactionNumber" as const, label: "Transaction No" },
                      { key: "membershipNumber" as const, label: "Membership No" },
                    ].map(({ key, label }) => (
                      <th key={key} className="p-2 text-left">
                        <button
                          type="button"
                          onClick={() => toggleSort(key)}
                          className="flex items-center gap-1 font-medium hover:text-primary whitespace-nowrap"
                        >
                          {label}
                          <span className="text-xs text-muted-foreground">
                            {sortKey === key ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
                          </span>
                        </button>
                      </th>
                    ))}
                    <th className="p-2 text-left">Comments</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRegistrations.map((item, i) => (
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
                      <td className="p-2">
                        {item.paymentStatus === "Paid" ? (
                          <span className="text-green-700 font-medium">Paid</span>
                        ) : item.paymentStatus === "Pending" ? (
                          <span className="text-orange-600 font-medium">Pending</span>
                        ) : (
                          <span className="text-muted-foreground">{item.paymentStatus || "N/A"}</span>
                        )}
                      </td>
                      <td className="p-2 font-mono">{item.transactionNumber || "-"}</td>
                      <td className="p-2">{item.membershipNumber || "-"}</td>
                      <td className="p-2">{item.comments || "-"}</td>
                    </tr>
                  ))}
                  {visibleRegistrations.length === 0 && (
                    <tr>
                      <td colSpan={11} className="p-4 text-center text-muted-foreground">
                        No registrations match your search/filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Edit form */}
            {editingEvent && (
              <Card
                ref={editPanelRef}
                className={`mt-4 transition-shadow duration-300 ${
                  justOpened ? "ring-4 ring-primary ring-offset-2 shadow-lg" : ""
                }`}
              >
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

                  <div>
                    <label className="text-sm font-medium block mb-1">
                      Transaction / Reference Number
                    </label>
                    <Input
                      placeholder="e.g. TXN123456789 — from the bank transfer"
                      value={editingEvent.transactionNumber || ""}
                      onChange={(e) =>
                        setEditingEvent({ ...editingEvent, transactionNumber: e.target.value })
                      }
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Required before this registration can be marked Paid — leave blank while
                      payment is still Pending.
                    </p>
                  </div>

                  <div>
                    <label className="text-sm font-medium block mb-1">Payment Status</label>
                    <select
                      className="w-full p-2 border rounded text-foreground bg-background"
                      value={editingEvent.paymentStatus || "N/A"}
                      onChange={(e) => setEditingEvent({ ...editingEvent, paymentStatus: e.target.value })}
                    >
                      <option value="N/A">N/A (no fee)</option>
                      <option value="Pending">Pending</option>
                      <option value="Paid">Paid</option>
                    </select>
                  </div>
                  <Input
                    placeholder="Comments"
                    value={editingEvent.comments || ""}
                    onChange={(e) => setEditingEvent({ ...editingEvent, comments: e.target.value })}
                  />
                  <div className="flex gap-2">
                    <Button
                      onClick={async () => {
                        if (
                          editingEvent.paymentStatus === "Paid" &&
                          !String(editingEvent.transactionNumber || "").trim()
                        ) {
                          toast({
                            title: "Transaction number required",
                            description:
                              "Enter the bank transfer transaction number before marking this registration Paid.",
                            variant: "destructive",
                          });
                          return;
                        }

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
                                transactionNumber: String(editingEvent.transactionNumber || "").trim(),
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
