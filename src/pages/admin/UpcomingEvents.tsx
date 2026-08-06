import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { safeFetch, downloadCSV } from "./safeFetch";

const UpcomingEvents = () => {
  const { toast } = useToast();

  const [upcomingEvents, setUpcomingEvents] = useState<any[]>([]);
  const [newFlyer, setNewFlyer] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [newEvent, setNewEvent] = useState({
    title: "",
    date: "",
    time: "",
    location: "",
    capacity: "",
    description: "",
    isActive: true,
    memberFee: "0",
    nonMemberFee: "0",
  });

  // ─── flyer preview ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!newFlyer) { setPreviewUrl(null); return; }
    const url = URL.createObjectURL(newFlyer);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [newFlyer]);

  // ─── fetch ──────────────────────────────────────────────────────────────
  const fetchUpcomingEvents = async () => {
    const data = await safeFetch("/api/upcoming-events");
    setUpcomingEvents(Array.isArray(data) ? data : []);
  };

  useEffect(() => { fetchUpcomingEvents(); }, []);

  return (
    <div>
      {/* ── Existing events table ── */}
      <Card className="border mb-6">
        <CardContent className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold">Upcoming Events Management</h2>
            <Button onClick={() => downloadCSV(upcomingEvents, "upcoming-events.csv")}>
              Download CSV
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="p-2 text-left">Active</th>
                  <th className="p-2 text-left">Title</th>
                  <th className="p-2 text-left">Date</th>
                  <th className="p-2 text-left">Time</th>
                  <th className="p-2 text-left">Location</th>
                  <th className="p-2 text-left">Capacity</th>
                  <th className="p-2 text-left">Member Fee</th>
                  <th className="p-2 text-left">Non-Member Fee</th>
                  <th className="p-2 text-left">Description</th>
                  <th className="p-2 text-left">Flyer</th>
                  <th className="p-2 text-left">Action</th>
                </tr>
              </thead>
              <tbody>
                {upcomingEvents.map((event, index) => (
                  <tr key={index} className="border-b">

                    {/* ACTIVE toggle */}
                    <td className="p-2 text-center">
                      <input
                        type="checkbox"
                        checked={!!event.isActive}
                        onChange={async (e) => {
                          await safeFetch("/api/upcoming-events/update", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ ...event, isActive: e.target.checked }),
                          });
                          fetchUpcomingEvents();
                        }}
                      />
                    </td>

                    {/* TITLE */}
                    <td className="p-2">
                      <Input
                        value={event.title}
                        onChange={(e) =>
                          setUpcomingEvents((prev) =>
                            prev.map((ev, i) => i === index ? { ...ev, title: e.target.value } : ev)
                          )
                        }
                      />
                    </td>

                    {/* DATE */}
                    <td className="p-2">
                      <Input
                        value={event.date}
                        onChange={(e) =>
                          setUpcomingEvents((prev) =>
                            prev.map((ev, i) => i === index ? { ...ev, date: e.target.value } : ev)
                          )
                        }
                      />
                    </td>

                    {/* TIME */}
                    <td className="p-2">
                      <Input
                        value={event.time}
                        onChange={(e) =>
                          setUpcomingEvents((prev) =>
                            prev.map((ev, i) => i === index ? { ...ev, time: e.target.value } : ev)
                          )
                        }
                      />
                    </td>

                    {/* LOCATION */}
                    <td className="p-2">
                      <Input
                        value={event.location}
                        onChange={(e) =>
                          setUpcomingEvents((prev) =>
                            prev.map((ev, i) => i === index ? { ...ev, location: e.target.value } : ev)
                          )
                        }
                      />
                    </td>

                    {/* CAPACITY */}
                    <td className="p-2">
                      <Input
                        value={event.capacity}
                        onChange={(e) =>
                          setUpcomingEvents((prev) =>
                            prev.map((ev, i) => i === index ? { ...ev, capacity: e.target.value } : ev)
                          )
                        }
                      />
                    </td>

                    {/* MEMBER FEE */}
                    <td className="p-2">
                      <Input
                        type="number"
                        min="0"
                        value={event.memberFee ?? 0}
                        onChange={(e) =>
                          setUpcomingEvents((prev) =>
                            prev.map((ev, i) => i === index ? { ...ev, memberFee: e.target.value } : ev)
                          )
                        }
                      />
                    </td>

                    {/* NON-MEMBER FEE */}
                    <td className="p-2">
                      <Input
                        type="number"
                        min="0"
                        value={event.nonMemberFee ?? 0}
                        onChange={(e) =>
                          setUpcomingEvents((prev) =>
                            prev.map((ev, i) => i === index ? { ...ev, nonMemberFee: e.target.value } : ev)
                          )
                        }
                      />
                    </td>

                    {/* DESCRIPTION */}
                    <td className="p-2">
                      <Input
                        value={event.description}
                        onChange={(e) =>
                          setUpcomingEvents((prev) =>
                            prev.map((ev, i) => i === index ? { ...ev, description: e.target.value } : ev)
                          )
                        }
                      />
                    </td>

                    {/* FLYER */}
                    <td className="p-2 space-y-2">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const formData = new FormData();
                          formData.append("flyer", file);
                          formData.append("title", event.title);
                          formData.append("event", JSON.stringify(event));
                          formData.append("eventYear", event.date?.split("-")[0]);
                          try {
                            const res = await fetch("/api/upload-flyer", { method: "POST", body: formData });
                            const data = await res.json();
                            if (!res.ok) {
                              toast({ title: "Upload Failed", description: data.message || "Something went wrong", variant: "destructive" });
                              return;
                            }
                            setUpcomingEvents((prev) =>
                              prev.map((ev) =>
                                ev.title === event.title ? { ...ev, flyerImage: data.fileName } : ev
                              )
                            );
                            toast({ title: "Success 🎉", description: "Flyer uploaded successfully" });
                          } catch {
                            toast({ title: "Error", description: "Upload failed", variant: "destructive" });
                          }
                        }}
                      />

                      {event.flyerImage && (
                        <div className="relative group inline-block mt-2">
                          <img
                            src={`/api/media/${event.flyerImage}?t=${Date.now()}`}
                            className="max-h-[80px] rounded border"
                            alt="flyer"
                          />
                          {/* Delete flyer button (hover reveal) */}
                          <button
                            className="absolute top-1 right-1 bg-black/70 text-white text-xs px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition"
                            onClick={async () => {
                              if (!confirm("Delete flyer?")) return;
                              try {
                                const res = await fetch("/api/delete-flyer", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({
                                    title: event.title,
                                    date: event.date,
                                    fileName: event.flyerImage,
                                  }),
                                });
                                const data = await res.json();
                                if (!res.ok) throw new Error(data.message);
                                setUpcomingEvents((prev) =>
                                  prev.map((ev, i) => i === index ? { ...ev, flyerImage: "" } : ev)
                                );
                                toast({ title: "Deleted", description: "Flyer removed" });
                              } catch (err: any) {
                                toast({ title: "Error", description: err.message, variant: "destructive" });
                              }
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      )}
                    </td>

                    {/* ACTIONS */}
                    <td className="p-2 flex gap-2">
                      <Button
                        onClick={async () => {
                          await safeFetch("/api/upcoming-events/update", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(event),
                          });
                          fetchUpcomingEvents();
                        }}
                      >
                        Save
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={async () => {
                          await safeFetch("/api/upcoming-events/delete", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ title: event.title }),
                          });
                          fetchUpcomingEvents();
                        }}
                      >
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ── Add New Event ── */}
      <div className="mb-8 p-4 border rounded space-y-3">
        <h3 className="font-bold text-lg">Add New Upcoming Event</h3>

        <Input
          placeholder="Title"
          value={newEvent.title}
          onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
        />
        <Input
          placeholder="Date"
          value={newEvent.date}
          onChange={(e) => setNewEvent({ ...newEvent, date: e.target.value })}
        />
        <Input
          placeholder="Time"
          value={newEvent.time}
          onChange={(e) => setNewEvent({ ...newEvent, time: e.target.value })}
        />
        <Input
          placeholder="Location"
          value={newEvent.location}
          onChange={(e) => setNewEvent({ ...newEvent, location: e.target.value })}
        />
        <Input
          placeholder="Capacity"
          value={newEvent.capacity}
          onChange={(e) => setNewEvent({ ...newEvent, capacity: e.target.value })}
        />
        <Input
          placeholder="Description"
          value={newEvent.description}
          onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
        />

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium block mb-1">Member Fee ($)</label>
            <Input
              type="number"
              min="0"
              placeholder="0"
              value={newEvent.memberFee}
              onChange={(e) => setNewEvent({ ...newEvent, memberFee: e.target.value })}
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Non-Member Fee ($)</label>
            <Input
              type="number"
              min="0"
              placeholder="0"
              value={newEvent.nonMemberFee}
              onChange={(e) => setNewEvent({ ...newEvent, nonMemberFee: e.target.value })}
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Flyer Image</label>
          <input
            type="file"
            accept="image/*"
            className="w-full"
            onChange={(e) => { const file = e.target.files?.[0]; if (file) setNewFlyer(file); }}
          />
          {newFlyer && (
            <img src={URL.createObjectURL(newFlyer)} className="mt-2 max-h-[80px] rounded" alt="preview" />
          )}
          {newFlyer && (
            <p className="text-xs text-green-600">Selected: {newFlyer.name}</p>
          )}
        </div>

        <Button
          onClick={async () => {
            try {
              const res = await fetch("/api/upcoming-events/update", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(newEvent),
              });
              const data = await res.json();
              if (!res.ok) throw new Error(data.message || "Failed");

              if (newFlyer) {
                const formData = new FormData();
                formData.append("flyer", newFlyer);
                formData.append(
                  "event",
                  JSON.stringify({
                    title: newEvent.title,
                    eventYear: new Date(newEvent.date).getFullYear(),
                  })
                );
                const flyerRes = await fetch("/api/upload-flyer", { method: "POST", body: formData });
                const flyerData = await flyerRes.json();
                if (!flyerRes.ok) throw new Error(flyerData.message || "Flyer upload failed");
              }

              toast({ title: "Success 🎉", description: "Event created successfully" });
              setNewEvent({
                title: "", date: "", time: "", location: "",
                capacity: "", description: "", isActive: true,
                memberFee: "0", nonMemberFee: "0",
              });
              setNewFlyer(null);
              fetchUpcomingEvents();
            } catch (err: any) {
              toast({ title: "Error", description: err.message, variant: "destructive" });
            }
          }}
        >
          Add Event
        </Button>
      </div>
    </div>
  );
};

export default UpcomingEvents;
