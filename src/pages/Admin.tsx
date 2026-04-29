import { useState, useEffect } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

const ADMIN_USER = "admin";
const ADMIN_PASSWORD = "Ku$1";

const Admin = () => {
  const { toast } = useToast();

  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const [loginData, setLoginData] = useState({
    user: "",
    password: "",
  });

  const [groupedEvents, setGroupedEvents] = useState<Record<string, any[]>>({});
  const [memberData, setMemberData] = useState<any[]>([]);
  const [selectedEventRows, setSelectedEventRows] = useState<string[]>([]);
  const [selectedMemberRows, setSelectedMemberRows] = useState<string[]>([]);
  const [editingMember, setEditingMember] = useState<any | null>(null);
  const [selectedFlyerEvent, setSelectedFlyerEvent] = useState<any | null>(null);
  const [eventFiles, setEventFiles] = useState<any[]>([]);

  const [selectedEventKey, setSelectedEventKey] = useState<string>("");
  const [editingEvent, setEditingEvent] = useState<any | null>(null);

  const [eventActionMessage, setEventActionMessage] = useState("");
  const [newFlyer, setNewFlyer] = useState<File | null>(null);

  const [newEvent, setNewEvent] = useState({
    title: "",
    date: "",
    time: "",
    location: "",
    spots: "",
    description: "",
    isActive: true,
  });

  const selectedEvent =
    selectedEventKey && groupedEvents[selectedEventKey]?.length
      ? {
          members: groupedEvents[selectedEventKey],
          eventName: groupedEvents[selectedEventKey][0]?.eventName,
          eventYear: groupedEvents[selectedEventKey][0]?.eventYear,

          // ✅ Adults = adults + 1 (registrant)
          adults: groupedEvents[selectedEventKey].reduce(
            (sum: number, m: any) =>
              sum + 1 + Number(m.adults || 0),
            0
          ),

          children: groupedEvents[selectedEventKey].reduce(
            (sum: number, m: any) =>
              sum + Number(m.children || 0),
            0
          ),

          // ✅ Total Registrations = TOTAL PEOPLE
          totalPeople: groupedEvents[selectedEventKey].reduce(
            (sum: number, m: any) =>
              sum + 1 + Number(m.adults || 0) + Number(m.children || 0),
            0
          ),
        }
      : null;

  const selectedEventLabel =
  eventFiles.find((f) => f.value === selectedEventKey)?.label || "Select Event";
  
  const rows = memberData.map((row) =>
    Object.values({
      ...row,
      interests: Array.isArray(row.interests)
        ? row.interests.join(" | ")
        : row.interests,
    }).join(",")
  );

  const toggleEventRow = (email: string) => {
    setSelectedEventRows((prev) =>
      prev.includes(email)
        ? prev.filter((e) => e !== email)
        : [...prev, email]
    );
  };

  const toggleMemberRow = (email: string) => {
    setSelectedMemberRows((prev) =>
      prev.includes(email)
        ? prev.filter((e) => e !== email)
        : [...prev, email]
    );
  };

  const [upcomingEvents, setUpcomingEvents] = useState<any[]>([]);

  const fetchUpcomingEvents = async () => {
    try {
      const res = await fetch("/api/upcoming-events");
      const data = await res.json();
      setUpcomingEvents(Array.isArray(data) ? data : data?.events || []);
      
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchUpcomingEvents();
  }, []);

  useEffect(() => {
  if (selectedEventKey) {
    fetchEventData(selectedEventKey);
  }
}, [selectedEventKey]);

// ================= EVENT FILES =================
const fetchEventFiles = async () => {
  try {
    const res = await fetch("/api/event-files");
    if (!res.ok) throw new Error("Failed to load event files");

    const data = await res.json();
    setEventFiles(data || []);
  } catch (err) {
    console.error("fetchEventFiles error:", err);
    setEventFiles([]);
  }
};

// ================= EVENT DATA (FROM FILE) =================
const fetchEventData = async (fileKey: string) => {
  try {
    if (!fileKey) {
      setGroupedEvents({});
      return;
    }

    const res = await fetch(`/api/events/${fileKey}`);
    const data = await res.json();

    setGroupedEvents((prev) => ({
      ...prev,
      [fileKey]: Array.isArray(data) ? data : [],
    }));

  } catch (err) {
    console.error("fetchEventData error:", err);
  }
};

 const fetchData = async () => {
  try {
    const [membersRes, filesRes] = await Promise.all([
      fetch("/api/members"),
      fetch("/api/event-files"),
    ]);

    if (!membersRes.ok || !filesRes.ok) {
      throw new Error("API failed");
    }

    const members = await membersRes.json();
    const eventFiles = await filesRes.json();

    setMemberData(members || []);
    setEventFiles(eventFiles || []);
    
    const grouped: Record<string, any[]> = {};
    (eventFiles || []).forEach((f: any) => {
     grouped[f.value] = []; // empty until selected
     });
    // optional: auto-reset dropdown + events
    setGroupedEvents({});
    setSelectedEventKey("");
  } catch (err) {
    console.error("fetchData error:", err);
  }
};

const deleteMemberRows = async () => {
  await fetch("/api/members/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ emails: selectedMemberRows }),
  });

  setSelectedMemberRows([]);
  fetchData();
};

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

    if (!res.ok) {
      throw new Error(data.message || "Delete failed");
    }

    setEventActionMessage(`✅ ${data.message || "Deleted successfully"}`);

    setSelectedEventRows([]);
    fetchData();
  } catch (err: any) {
    setEventActionMessage(`❌ ${err.message}`);
  }
};

  // ================= LOGIN =================
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();

    if (
      loginData.user === ADMIN_USER &&
      loginData.password === ADMIN_PASSWORD
    ) {
      setIsLoggedIn(true);

      toast({
        title: "Login Successful",
        description: "Welcome Admin",
      });

      fetchData();
    } else {
      toast({
        title: "Invalid Credentials",
        description: "Incorrect email or password",
        variant: "destructive",
      });
    }
  };

  // ================= CSV DOWNLOAD =================
  const normalizeInterests = (interests: any) => {
    if (Array.isArray(interests)) return interests.join(" | ");
    if (typeof interests === "object" && interests !== null)
      return Object.keys(interests).filter((k) => interests[k]).join(" | ");
    return interests || "-";
  };

  const downloadCSV = (data: any[], filename: string) => {
    if (!data.length) return;

    const headers = Object.keys(data[0]).join(",");

    const csvrows = data.map((row) => {
      const cleanRow = {
        ...row,
        interests: normalizeInterests(row.interests),
      };

      return Object.values(cleanRow).join(",");
    });

    const csv = [headers, ...csvrows].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
  };

  const groupedList = Object.entries(groupedEvents).map(([event, members]) => {
    const adults = members.reduce((sum: number, m: any) => sum + Number(m.adults || 0), 0);
    const children = members.reduce((sum: number, m: any) => sum + Number(m.children || 0), 0);

    return {
      event,
      members,
      adults,
      children,
    };
  });
  
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-grow">
        {/* HERO */}
        <section className="gradient-warm text-white py-20">
          <div className="container mx-auto px-4 text-center">
            <h1 className="mb-6">Admin Console</h1>
            <p className="text-xl max-w-3xl mx-auto opacity-95">
              Manage event registrations and memberships
            </p>
          </div>
        </section>

        {/* LOGIN */}
        {!isLoggedIn && (
          <section className="py-20">
            <div className="container mx-auto px-4 max-w-md">
              <Card className="border-2">
                <CardContent className="p-8">
                  <h2 className="mb-6 text-center">Admin Login</h2>

                  <form onSubmit={handleLogin} className="space-y-4">
                    <Input
                      placeholder="Username"
                      value={loginData.user}
                      onChange={(e) =>
                        setLoginData({
                          ...loginData,
                          user: e.target.value,
                        })
                      }
                    />

                    <Input
                      type="password"
                      placeholder="Password"
                      value={loginData.password}
                      onChange={(e) =>
                        setLoginData({
                          ...loginData,
                          password: e.target.value,
                        })
                      }
                    />

                    <Button className="w-full btn-hero">
                      Login
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>
          </section>
        )}

        {/* DASHBOARD */}
        {isLoggedIn && (
          <section className="py-20 bg-muted/30">
            <div className="container mx-auto px-4">

              <Tabs defaultValue="events" className="max-w-7xl mx-auto">
                <TabsList className="grid w-full max-w-md mx-auto grid-cols-3 mb-12">
                  <TabsTrigger value="events">Event Registrations</TabsTrigger>
                  <TabsTrigger value="members">Members</TabsTrigger>
                  <TabsTrigger value="upcoming">Upcoming Events</TabsTrigger>
                </TabsList>

                {/* ✅ EVENTS TAB FIXED */}
                <TabsContent value="events">

                <div className="mb-6 max-w-md">
                    <label className="text-sm font-medium">Select Event</label>
                    <select
  className="w-full mt-2 p-2 border rounded"
  value={selectedEventKey}
  onChange={(e) => setSelectedEventKey(e.target.value)}
>
  <option value="">-- Choose Event --</option>

  {eventFiles.map((file: any) => (
    <option key={file.value} value={file.value}>
      {file.label}
    </option>
  ))}
</select>
</div>
                  {selectedEvent?.members?.length > 0 && (
                    <Card className="mb-6">
                      <CardContent className="p-6">
                          <div className="flex justify-between items-start mb-4">
                          <div>
    
                            <h2 className="text-xl font-bold">
                              {selectedEventLabel}
                            </h2>

                            <div className="flex gap-4 text-sm text-muted-foreground mt-1">
                              <span>Total People: {selectedEvent.totalPeople}</span>
                              <span>👨 Adults: {selectedEvent.adults}</span>
                              <span>🧒 Children: {selectedEvent.children}</span>
                            </div>
                          </div>


<Button
  onClick={() =>
    downloadCSV(
      selectedEvent?.members || [],
      `${selectedEventKey || "event"}.csv'
      //`${selectedEventLabel}` || "event"}.csv`
    )
  }
>
  Download CSV
</Button>
                        </div>

                        {/* ACTION BUTTONS */}
<div className="flex gap-2 mb-3">
  {selectedEventRows.length > 0 && (
    <Button
      variant="destructive"
      onClick={deleteEventRows}
    >
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

{/* TABLE */}
<div className="overflow-x-auto">
  <table className="w-full text-sm">
    <thead>
      <tr className="border-b">
        <th className="p-2"></th>
        <th className="p-2 text-left">Name</th>
        <th className="p-2 text-left">Email</th>
        <th className="p-2 text-left">Phone</th>
        <th className="p-2 text-left">Adults</th>
        <th className="p-2 text-left">Children</th>
        <th className="p-2 text-left">Comments</th>
      </tr>
    </thead>

    <tbody>
      {groupedEvents[selectedEventKey]?.map((item, i) => (
        <tr key={i} className="border-b">
          <td className="p-2">
            <input
              type="checkbox"
              checked={selectedEventRows.includes(item.email)}
              onChange={() => toggleEventRow(item.email)}
            />
          </td>
          <td className="p-2">{item.name}</td>
          <td className="p-2">{item.email}</td>
          <td className="p-2">{item.phone}</td>
          <td className="p-2">{item.adults}</td>
          <td className="p-2">{item.children}</td>
          <td className="p-2">{item.comments || "-"}</td>
        </tr>
      ))}
    </tbody>
  </table>
</div>

{/* EDIT FORM (PLACED CORRECTLY BELOW TABLE) */}
{editingEvent && (
  <Card className="mt-4">
    <CardContent className="p-4 space-y-3">
      <h3 className="font-bold">Edit Registration</h3>

      <Input
        placeholder="Name"
        value={editingEvent.name}
        onChange={(e) =>
          setEditingEvent({ ...editingEvent, name: e.target.value })
        }
      />

      <Input
        placeholder="Phone"
        value={editingEvent.phone}
        onChange={(e) =>
          setEditingEvent({ ...editingEvent, phone: e.target.value })
        }
      />

      <Input
        type="number"
        placeholder="Adults"
        value={editingEvent.adults}
        onChange={(e) =>
          setEditingEvent({ ...editingEvent, adults: e.target.value })
        }
      />

      <Input
        type="number"
        placeholder="Children"
        value={editingEvent.children}
        onChange={(e) =>
          setEditingEvent({ ...editingEvent, children: e.target.value })
        }
      />

      <Input
        placeholder="Comments"
        value={editingEvent.comments || ""}
        onChange={(e) =>
          setEditingEvent({ ...editingEvent, comments: e.target.value })
        }
      />

      <div className="flex gap-2">
        <Button
          onClick={async () => {
            try {
              const res = await fetch(
                "/api/events/update",
                {
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
                    },
                  }),
                }
              );

              const data = await res.json();

              if (!res.ok) {
                throw new Error(data.message || "Update failed");
              }

              toast({
                title: "Success 🎉",
                description: data.message || "Updated successfully",
              });

              setEditingEvent(null);
              setSelectedEventRows([]);
              fetchData();
            } catch (err: any) {
              toast({
                title: "Error",
                description: err.message,
                variant: "destructive",
              });
            }
          }}
        >
          Save Changes
        </Button>

        <Button
          variant="outline"
          onClick={() => setEditingEvent(null)}
        >
          Cancel
        </Button>
      </div>
    </CardContent>
  </Card>
)}

                      </CardContent>
                    </Card>
                  )}
                </TabsContent>

                {/* MEMBERS TAB */}
                <TabsContent value="members">
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex justify-between mb-6">
                        <h2 className="text-xl font-bold">Kutumb Members</h2>
                        <Button
                          onClick={() =>
                            downloadCSV(memberData, "members.csv")
                          }
                        >
                          Download CSV
                        </Button>
                      </div>

                      {selectedMemberRows.length > 0 && (
                        <Button
                          variant="destructive"
                          className="mb-3"
                          onClick={deleteMemberRows}
                        >
                          Delete Selected
                        </Button>
                      )}

                      <Button
                        onClick={() => {
                          const member = memberData.find(m => m.email === selectedMemberRows[0]);

                          if (!member) return;

                          setEditingMember({
                            ...member,
                            interests: Array.isArray(member.interests)
                              ? member.interests.join(", ")
                              : typeof member.interests === "object" && member.interests !== null
                                ? Object.keys(member.interests)
                                  .filter(k => member.interests[k])
                                  .join(", ")
                                : member.interests || "",
                          });
                        }}
                        disabled={selectedMemberRows.length !== 1}
                      >
                        Modify Selected
                      </Button>

                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b">
                              <th className="p-2"></th>
                              <th className="p-2 text-left">Name</th>
                              <th className="p-2 text-left">Email</th>
                              <th className="p-2 text-left">Phone</th>
                              <th className="p-2 text-left">Address</th>
                              <th className="p-2 text-left">Interests</th>
                            </tr>
                          </thead>
                          <tbody>
                            {memberData.map((item, i) => (
                              <tr key={i} className="border-b">
                                <td className="p-2">
                                  <input
                                    type="checkbox"
                                    checked={selectedMemberRows.includes(item.email)}
                                    onChange={() => toggleMemberRow(item.email)}
                                  />
                                </td>
                                <td className="p-2">{item.name}</td>
                                <td className="p-2">{item.email}</td>
                                <td className="p-2">{item.phone}</td>
                                <td className="p-2">{item.address}</td>
                                <td className="p-2">
                                  {normalizeInterests(item.interests)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>

                        {editingMember && (
                          <Card className="mt-4">
                            <CardContent className="p-4 space-y-3">
                              <h3 className="font-bold">Edit Member</h3>

                              <Input
                                value={editingMember.name}
                                onChange={(e) =>
                                  setEditingMember({ ...editingMember, name: e.target.value })
                                }
                              />

                              <Input
                                value={editingMember.phone}
                                onChange={(e) =>
                                  setEditingMember({ ...editingMember, phone: e.target.value })
                                }
                              />

                              <Input
                                value={editingMember.address}
                                onChange={(e) =>
                                  setEditingMember({ ...editingMember, address: e.target.value })
                                }
                              />

                              <Input
                                value={editingMember.interests || ""}
                                onChange={(e) =>
                                  setEditingMember({
                                    ...editingMember,
                                    interests: e.target.value,
                                  })
                                }
                              />

                              <Button
                                onClick={async () => {
                                  await fetch("/api/members/update", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                      email: editingMember.email,
                                      updatedData: editingMember,
                                    }),
                                  });

                                  setEditingMember(null);
                                  setSelectedMemberRows([]);
                                  fetchData();
                                }}
                              >
                                Save Changes
                              </Button>
                            </CardContent>
                          </Card>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="upcoming">
                  <Card className="border">
                    <CardContent className="p-6">
                      <div className="flex justify-between items-center mb-6">
                        <h2 className="text-xl font-bold">
                          Upcoming Events Management
                        </h2>

                        <Button
                          onClick={() =>
                            downloadCSV(upcomingEvents, "upcoming-events.csv")
                          }
                        >
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
                              <th className="p-2 text-left">Spots</th>
                              <th className="p-2 text-left">Description</th>
                              <th className="p-2 text-left">Flyer</th>
                              <th className="p-2 text-left">Action</th>
                            </tr>
                          </thead>

<tbody>
  {upcomingEvents.map((event, index) => (
    <tr
      key={index}
      className="border-b cursor-pointer"
    >
      {/* ACTIVE */}
      <td className="p-2 text-center">
        <input
          type="checkbox"
          checked={!!event.isActive}
          onChange={async (e) => {
            e.stopPropagation();

            const updated = {
              ...event,
              isActive: e.target.checked,
            };

            await fetch("/api/upcoming-events/update", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(updated),
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
              prev.map((ev, i) =>
                i === index ? { ...ev, title: e.target.value } : ev
              )
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
              prev.map((ev, i) =>
                i === index ? { ...ev, date: e.target.value } : ev
              )
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
              prev.map((ev, i) =>
                i === index ? { ...ev, time: e.target.value } : ev
              )
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
              prev.map((ev, i) =>
                i === index ? { ...ev, location: e.target.value } : ev
              )
            )
          }
        />
      </td>

      {/* SPOTS */}
      <td className="p-2">
        <Input
          value={event.spots}
          onChange={(e) =>
            setUpcomingEvents((prev) =>
              prev.map((ev, i) =>
                i === index ? { ...ev, spots: e.target.value } : ev
              )
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
              prev.map((ev, i) =>
                i === index ? { ...ev, description: e.target.value } : ev
              )
            )
          }
        />
      </td>

      {/* FLYER UPLOAD (FIXED LOGIC) */}
      <td className="p-2">
        <input
          type="file"
          accept="image/*"
          onChange={async (e) => {
            e.stopPropagation();

            const file = e.target.files?.[0];
            if (!file) return;

            const formData = new FormData();
            formData.append("flyer", file);
            formData.append("title", event.title);
            formData.append("eventYear", event.date?.slice(0, 4));

            const res = await fetch("/api/upload-flyer", {
              method: "POST",
              body: formData,
            });

            const data = await res.json();

            if (!res.ok) {
              throw new Error(data.message || "Upload failed");
            }

            toast({
              title: "Success 🎉",
              description: data.message || "Flyer uploaded successfully",
            });

            fetchUpcomingEvents();
          }}
        />

        {event.flyerImage && (
          <img
            src={`eventflyer/${event.flyerImage}`}
            className="mt-2 max-h-[60px] rounded"
          />
        )}
      </td>

      {/* ACTIONS */}
      <td className="p-2 flex gap-2">
        <Button
          onClick={async () => {
            await fetch("/api/upcoming-events/update", {
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
            const res = await fetch("/api/upcoming-events/delete", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ title: event.title }),
            });

            await res.json();
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

                  <div className="mb-8 p-4 border rounded space-y-3">
                    <h3 className="font-bold text-lg">Add New Upcoming Event</h3>

                    <Input
                      placeholder="Title"
                      value={newEvent.title}
                      onChange={(e) =>
                        setNewEvent({ ...newEvent, title: e.target.value })
                      }
                    />

                    <Input
                      placeholder="Date"
                      value={newEvent.date}
                      onChange={(e) =>
                        setNewEvent({ ...newEvent, date: e.target.value })
                      }
                    />

                    <Input
                      placeholder="Time"
                      value={newEvent.time}
                      onChange={(e) =>
                        setNewEvent({ ...newEvent, time: e.target.value })
                      }
                    />

                    <Input
                      placeholder="Location"
                      value={newEvent.location}
                      onChange={(e) =>
                        setNewEvent({ ...newEvent, location: e.target.value })
                      }
                    />

                    <Input
                      placeholder="Spots"
                      value={newEvent.spots}
                      onChange={(e) =>
                        setNewEvent({ ...newEvent, spots: e.target.value })
                      }
                    />

                    <Input
                      placeholder="Description"
                      value={newEvent.description}
                      onChange={(e) =>
                        setNewEvent({ ...newEvent, description: e.target.value })
                      }
                    />

<div className="space-y-2">
  <label className="text-sm font-medium">Flyer Image</label>

<input
  type="file"
  accept="image/*"
  className="w-full"
  onChange={(e) => {
    const file = e.target.files?.[0];
    if (file) setNewFlyer(file);
  }}
/>

{newFlyer && (
  <img
    src={URL.createObjectURL(newFlyer)}
    className="mt-2 max-h-[80px] rounded"
  />
)}

  {newFlyer && (
    <p className="text-xs text-green-600">
      Selected: {newFlyer.name}
    </p>
  )}
</div>

                    <Button
  onClick={async () => {
    try {
      // 1. create event
      const res = await fetch(
        "/api/upcoming-events/update",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newEvent),
        }
      );

      const data = await res.json();

      if (!res.ok) throw new Error(data.message || "Failed");

      // 2. upload flyer if exists
      if (newFlyer) {
        const formData = new FormData();
        formData.append("flyer", newFlyer);
        formData.append("title", newEvent.title);
        formData.append("eventYear", newEvent.date?.slice(0, 4));

        const flyerRes = await fetch(
          "/api/upload-flyer",
          {
            method: "POST",
            body: formData,
          }
        );

        const flyerData = await flyerRes.json();

        if (!flyerRes.ok) {
          throw new Error(flyerData.message || "Flyer upload failed");
        }
      }

      toast({
        title: "Success 🎉",
        description: "Event created successfully",
      });

      setNewEvent({
        title: "",
        date: "",
        time: "",
        location: "",
        spots: "",
        description: "",
        isActive: true,
      });

      setNewFlyer(null);

      fetchUpcomingEvents();
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    }
  }}
>
  Add Event
</Button>
                  </div>

                </TabsContent>

              </Tabs>
            </div>
          </section>
        )}
      </main>

      <Footer />
    </div>
  );
};

export default Admin;
