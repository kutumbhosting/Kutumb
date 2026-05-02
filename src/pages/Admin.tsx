import { useState, useEffect, useRef } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

const ADMIN_USER = "admin";
const ADMIN_PASSWORD = "Ku$1";

// ─── safe JSON fetch ───────────────────────────────────────────────────────────
// Returns parsed JSON or null. Never throws.
const safeFetch = async (url: string, options?: RequestInit) => {
  try {
    const res = await fetch(url, options);
    if (!res.ok) {
      console.warn(`[safeFetch] ${url} → HTTP ${res.status}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.error(`[safeFetch] ${url} → network error`, err);
    return null;
  }
};

const Admin = () => {
  const { toast } = useToast();

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginData, setLoginData] = useState({ user: "", password: "" });

  const [groupedEvents, setGroupedEvents] = useState<Record<string, any[]>>({});
  const [memberData, setMemberData] = useState<any[]>([]);
  const [selectedEventRows, setSelectedEventRows] = useState<string[]>([]);
  const [selectedMemberRows, setSelectedMemberRows] = useState<string[]>([]);
  const [editingMember, setEditingMember] = useState<any | null>(null);
  const [selectedFlyerEvent, setSelectedFlyerEvent] = useState<any | null>(null);
  const [selectedEventKey, setSelectedEventKey] = useState<string>("");
  const [eventActionMessage, setEventActionMessage] = useState("");
  const [editingEvent, setEditingEvent] = useState<any | null>(null);
  const [eventFiles, setEventFiles] = useState<any[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [newFlyer, setNewFlyer] = useState<File | null>(null);
  const [upcomingEvents, setUpcomingEvents] = useState<any[]>([]);

  // Files tab
  const [fileFolder, setFileFolder] = useState<string>("");
  const [files, setFiles] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [newFolder, setNewFolder] = useState("");
  const [folders, setFolders] = useState<string[]>([]);
  const [fileRefreshKey, setFileRefreshKey] = useState(0);
  const [debugMsg, setDebugMsg] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [newEvent, setNewEvent] = useState({
    title: "",
    date: "",
    time: "",
    location: "",
    capacity: "",
    description: "",
    isActive: true,
  });

  // ─── derived: selected event ────────────────────────────────────────────────
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
        }
      : null;

  // ─── toggle helpers ─────────────────────────────────────────────────────────
  const toggleEventRow = (email: string) =>
    setSelectedEventRows((prev) =>
      prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email]
    );

  const toggleMemberRow = (email: string) =>
    setSelectedMemberRows((prev) =>
      prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email]
    );

  // ─── flyer preview ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!newFlyer) { setPreviewUrl(null); return; }
    const url = URL.createObjectURL(newFlyer);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [newFlyer]);

  // ─── fetchUpcomingEvents ────────────────────────────────────────────────────
  const fetchUpcomingEvents = async () => {
    const data = await safeFetch("/api/upcoming-events");
    // Always set an array — never set undefined/null
    setUpcomingEvents(Array.isArray(data) ? data : []);
  };

  useEffect(() => { fetchUpcomingEvents(); }, []);

  // ─── MAIN fetchData ──────────────────────────────────────────────────────────
  // KEY FIX: each event file is fetched individually with its own error handler.
  // A single bad file will NOT crash the whole load.
  const fetchData = async () => {
    try {
      // 1. Get the list of event files
      const filesData = await safeFetch("/api/event-files");

      if (!Array.isArray(filesData) || filesData.length === 0) {
        console.warn("[fetchData] /api/event-files returned empty or invalid:", filesData);
        setEventFiles([]);
        setGroupedEvents({});
        // Still load members even if no events
        const members = await safeFetch("/api/members");
        setMemberData(Array.isArray(members) ? members : []);
        return;
      }

      setEventFiles(filesData);
      console.log("[fetchData] event files:", filesData);

      // 2. Fetch each event file individually — failures are isolated
      const allEventArrays = await Promise.all(
        filesData.map(async (f: any) => {
          if (!f?.value) {
            console.warn("[fetchData] event file entry missing .value:", f);
            return [];
          }
          const data = await safeFetch(`/api/events/${f.value}`);
          if (!Array.isArray(data)) {
            console.warn(`[fetchData] /api/events/${f.value} did not return array:`, data);
            return [];
          }
          return data;
        })
      );

      // 3. Flatten and group by eventName_eventYear
      const events = allEventArrays.flat();
      console.log("[fetchData] total event rows loaded:", events.length);

      const grouped = events.reduce((acc: Record<string, any[]>, item: any) => {
        if (!item?.eventName) return acc; // skip malformed rows
        const key = `${item.eventName}_${item.eventYear || "unknown"}`;
        if (!acc[key]) acc[key] = [];
        acc[key].push(item);
        return acc;
      }, {});

      console.log("[fetchData] grouped keys:", Object.keys(grouped));
      setGroupedEvents(grouped);

      // 4. Members (independent of events)
      const members = await safeFetch("/api/members");
      setMemberData(Array.isArray(members) ? members : []);

    } catch (err) {
      // Should never reach here because safeFetch absorbs errors,
      // but keep as a safety net
      console.error("[fetchData] unexpected error:", err);
    }
  };

  // ─── delete helpers ─────────────────────────────────────────────────────────
  const deleteMemberRows = async () => {
    await safeFetch("/api/members/delete", {
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
      if (!res.ok) throw new Error(data.message || "Delete failed");
      setEventActionMessage(`✅ ${data.message || "Deleted successfully"}`);
      setSelectedEventRows([]);
      fetchData();
    } catch (err: any) {
      setEventActionMessage(`❌ ${err.message}`);
    }
  };

  // ─── LOGIN ──────────────────────────────────────────────────────────────────
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (loginData.user === ADMIN_USER && loginData.password === ADMIN_PASSWORD) {
      setIsLoggedIn(true);
      toast({ title: "Login Successful", description: "Welcome Admin" });
      fetchData();
    } else {
      toast({ title: "Invalid Credentials", description: "Incorrect email or password", variant: "destructive" });
    }
  };

  // ─── CSV ────────────────────────────────────────────────────────────────────
  const normalizeInterests = (interests: any) => {
    if (Array.isArray(interests)) return interests.join(" | ");
    if (typeof interests === "object" && interests !== null)
      return Object.keys(interests).filter((k) => interests[k]).join(" | ");
    return interests || "-";
  };

  const downloadCSV = (data: any[], filename: string) => {
    if (!data.length) return;
    const headers = Object.keys(data[0]).join(",");
    const csvrows = data.map((row) =>
      Object.values({ ...row, interests: normalizeInterests(row.interests) }).join(",")
    );
    const csv = [headers, ...csvrows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
  };

  // ─── FILES TAB ──────────────────────────────────────────────────────────────
  const showDebug = (msg: string) => {
    setDebugMsg(msg);
    setTimeout(() => setDebugMsg(""), 3000);
  };

  useEffect(() => { if (isLoggedIn) fetchFolders(); }, [isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn) return;
    if (!fileFolder) { setFiles([]); return; }
    fetchFiles(fileFolder);
  }, [isLoggedIn, fileFolder]);

  useEffect(() => {
    if (fileFolder) fetchFiles(fileFolder);
  }, [fileFolder, fileRefreshKey]);

  const fetchFiles = async (folder: string) => {
    if (!folder) return;
    const data = await safeFetch(`/api/files/list?folder=${encodeURIComponent(folder)}&t=${Date.now()}`);
    setFiles(Array.isArray(data) ? [...data] : []);
  };

  const fetchFolders = async () => {
    const data = await safeFetch("/api/folders");
    setFolders(Array.isArray(data) ? data : []);
  };

  const createFolder = async () => {
    if (!newFolder.trim()) { toast({ title: "Folder name required" }); return; }
    const folderName = newFolder.trim();
    const res = await safeFetch("/api/folder/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folder: folderName }),
    });
    if (!res) {
      toast({ title: "Error", description: "Folder creation failed", variant: "destructive" });
      return;
    }
    setNewFolder("");
    setFileFolder(folderName);
    await fetchFolders();
    await fetchFiles(folderName);
    toast({ title: "Success", description: "Folder created" });
  };

  const deleteFile = async (file: string) => {
    if (!confirm(`Delete ${file}?`)) return;
    if (!fileFolder) { toast({ title: "Select a folder first" }); return; }
    const res = await safeFetch("/api/files/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folder: fileFolder, fileNames: [file] }),
    });
    if (!res) { toast({ title: "Error", description: "Delete failed", variant: "destructive" }); return; }
    await fetchFiles(fileFolder);
    await fetchFolders();
    toast({ title: "Deleted", description: `${file} removed` });
  };

  const uploadSelectedFile = async () => {
    showDebug("🚀 Upload clicked");
    if (!uploadFile || !fileFolder) { showDebug("❌ Missing file or folder"); return; }
    const formData = new FormData();
    formData.append("file", uploadFile);
    formData.append("folder", fileFolder);
    try {
      const res = await fetch("/api/files/upload", { method: "POST", body: formData });
      if (!res.ok) { showDebug("❌ Upload failed"); return; }
      showDebug("✅ Upload successful");
      setFiles((prev) => [...prev, uploadFile.name]);
      setTimeout(() => fetchFiles(fileFolder), 500);
      setUploadFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err: any) {
      showDebug("❌ " + err.message);
    }
  };

  // ─── RENDER ─────────────────────────────────────────────────────────────────
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
                      onChange={(e) => setLoginData({ ...loginData, user: e.target.value })}
                    />
                    <Input
                      type="password"
                      placeholder="Password"
                      value={loginData.password}
                      onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                    />
                    <Button className="w-full btn-hero">Login</Button>
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
                <TabsList className="flex w-full max-w-md mx-auto gap-3 mb-12">
                  <TabsTrigger value="events">Event Registrations</TabsTrigger>
                  <TabsTrigger value="members">Members</TabsTrigger>
                  <TabsTrigger value="upcoming">Upcoming Events</TabsTrigger>
                  <TabsTrigger value="files">Files Management</TabsTrigger>
                </TabsList>

                {/* ═══════════ EVENTS TAB ═══════════ */}
                <TabsContent value="events">
                  <div className="mb-6 max-w-md">
                    <label className="text-sm font-medium">Select Event</label>

                    {/* DEBUG: show count so you can see if data loaded */}
                    <p className="text-xs text-muted-foreground mt-1">
                      {Object.keys(groupedEvents).length === 0
                        ? "⚠️ No events loaded — check console for errors"
                        : `${Object.keys(groupedEvents).length} event(s) loaded`}
                    </p>

                    <select
                      className="w-full mt-2 p-2 border rounded text-foreground bg-background"
                      value={selectedEventKey}
                      onChange={(e) => setSelectedEventKey(e.target.value)}
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

                    {/* Retry button in case of load failure */}
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={fetchData}
                    >
                      🔄 Reload Events
                    </Button>
                  </div>

                  {selectedEvent?.members?.length > 0 && (
                    <Card className="mb-6">
                      <CardContent className="p-6">
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <h2 className="text-xl font-bold">
                              {selectedEvent.eventName} {selectedEvent.eventYear}
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
                                `${selectedEvent?.eventName || "event"}_${selectedEvent?.eventYear || "unknown"}.csv`
                              )
                            }
                          >
                            Download CSV
                          </Button>
                        </div>

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
                              {selectedEvent?.members?.map((item, i) => (
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
                                          },
                                        }),
                                      });
                                      const data = await res.json();
                                      if (!res.ok) throw new Error(data.message || "Update failed");
                                      toast({ title: "Success 🎉", description: data.message || "Updated successfully" });
                                      setEditingEvent(null);
                                      setSelectedEventRows([]);
                                      fetchData();
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
                </TabsContent>

                {/* ═══════════ MEMBERS TAB ═══════════ */}
                <TabsContent value="members">
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex justify-between mb-6">
                        <h2 className="text-xl font-bold">Kutumb Members</h2>
                        <Button onClick={() => downloadCSV(memberData, "members.csv")}>
                          Download CSV
                        </Button>
                      </div>

                      {selectedMemberRows.length > 0 && (
                        <Button variant="destructive" className="mb-3" onClick={deleteMemberRows}>
                          Delete Selected
                        </Button>
                      )}

                      <Button
                        onClick={() => {
                          const member = memberData.find((m) => m.email === selectedMemberRows[0]);
                          if (!member) return;
                          setEditingMember({
                            ...member,
                            interests: Array.isArray(member.interests)
                              ? member.interests.join(", ")
                              : typeof member.interests === "object" && member.interests !== null
                              ? Object.keys(member.interests).filter((k) => member.interests[k]).join(", ")
                              : member.interests || "",
                          });
                        }}
                        disabled={selectedMemberRows.length !== 1}
                      >
                        Modify Selected
                      </Button>

                      <div className="overflow-x-auto mt-4">
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
                                <td className="p-2">{normalizeInterests(item.interests)}</td>
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
                                onChange={(e) => setEditingMember({ ...editingMember, name: e.target.value })}
                              />
                              <Input
                                value={editingMember.phone}
                                onChange={(e) => setEditingMember({ ...editingMember, phone: e.target.value })}
                              />
                              <Input
                                value={editingMember.address}
                                onChange={(e) => setEditingMember({ ...editingMember, address: e.target.value })}
                              />
                              <Input
                                value={editingMember.interests || ""}
                                onChange={(e) => setEditingMember({ ...editingMember, interests: e.target.value })}
                              />
                              <Button
                                onClick={async () => {
                                  await safeFetch("/api/members/update", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ email: editingMember.email, updatedData: editingMember }),
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

                {/* ═══════════ UPCOMING EVENTS TAB ═══════════ */}
                <TabsContent value="upcoming">
                  <Card className="border">
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
                              <th className="p-2 text-left">Description</th>
                              <th className="p-2 text-left">Flyer</th>
                              <th className="p-2 text-left">Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {upcomingEvents.map((event, index) => (
                              <tr key={index} className="border-b">
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
                                          prev.map((ev) => ev.title === event.title ? { ...ev, flyerImage: data.fileName } : ev)
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
                                        src={`/eventflyer/${event.flyerImage}?t=${Date.now()}`}
                                        className="max-h-[80px] rounded border"
                                        alt="flyer"
                                      />
                                      <button
                                        className="absolute top-1 right-1 bg-black/70 text-white text-xs px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition"
                                        onClick={async () => {
                                          if (!confirm("Delete flyer?")) return;
                                          try {
                                            const res = await fetch("/api/delete-flyer", {
                                              method: "POST",
                                              headers: { "Content-Type": "application/json" },
                                              body: JSON.stringify({ title: event.title, date: event.date, fileName: event.flyerImage }),
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

                  {/* Add New Event */}
                  <div className="mb-8 p-4 border rounded space-y-3">
                    <h3 className="font-bold text-lg">Add New Upcoming Event</h3>
                    <Input placeholder="Title" value={newEvent.title} onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })} />
                    <Input placeholder="Date" value={newEvent.date} onChange={(e) => setNewEvent({ ...newEvent, date: e.target.value })} />
                    <Input placeholder="Time" value={newEvent.time} onChange={(e) => setNewEvent({ ...newEvent, time: e.target.value })} />
                    <Input placeholder="Location" value={newEvent.location} onChange={(e) => setNewEvent({ ...newEvent, location: e.target.value })} />
                    <Input placeholder="Capacity" value={newEvent.capacity} onChange={(e) => setNewEvent({ ...newEvent, capacity: e.target.value })} />
                    <Input placeholder="Description" value={newEvent.description} onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })} />

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Flyer Image</label>
                      <input type="file" accept="image/*" className="w-full" onChange={(e) => { const file = e.target.files?.[0]; if (file) setNewFlyer(file); }} />
                      {newFlyer && <img src={URL.createObjectURL(newFlyer)} className="mt-2 max-h-[80px] rounded" />}
                      {newFlyer && <p className="text-xs text-green-600">Selected: {newFlyer.name}</p>}
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
                            formData.append("event", JSON.stringify({
                              title: newEvent.title,
                              eventYear: new Date(newEvent.date).getFullYear(),
                            }));
                            const flyerRes = await fetch("/api/upload-flyer", { method: "POST", body: formData });
                            const flyerData = await flyerRes.json();
                            if (!flyerRes.ok) throw new Error(flyerData.message || "Flyer upload failed");
                          }

                          toast({ title: "Success 🎉", description: "Event created successfully" });
                          setNewEvent({ title: "", date: "", time: "", location: "", capacity: "", description: "", isActive: true });
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
                </TabsContent>

                {/* ═══════════ FILES TAB ═══════════ */}
                <TabsContent value="files">
                  <Card>
                    <CardContent className="p-6 space-y-6">
                      <h2 className="text-xl font-bold">Folders</h2>

                      <div className="flex w-2/3 gap-3 items-center">
                        <select
                          className="border p-2 rounded flex-1 text-foreground bg-background"
                          value={fileFolder}
                          onChange={(e) => setFileFolder(e.target.value)}
                        >
                          <option value="">-- Select Folder --</option>
                          {folders.map((f) => (
                            <option key={f} value={f}>{f}</option>
                          ))}
                        </select>
                        <Button
                          variant="destructive"
                          onClick={async () => {
                            if (!fileFolder) return;
                            if (!confirm(`Delete folder "${fileFolder}"?`)) return;
                            const res = await safeFetch("/api/folder/delete", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ folderName: fileFolder }),
                            });
                            if (!res) { toast({ title: "Error", description: "Delete failed", variant: "destructive" }); return; }
                            setFileFolder("");
                            setFiles([]);
                            fetchFolders();
                            toast({ title: "Deleted", description: "Folder removed" });
                          }}
                        >
                          Delete Folder
                        </Button>
                      </div>

                      <div className="flex w-2/3 gap-2">
                        <Input placeholder="New folder name" value={newFolder} onChange={(e) => setNewFolder(e.target.value)} />
                        <Button onClick={createFolder}>Create Folder</Button>
                      </div>

                      <div className="border rounded p-3">
                        <h3 className="text-xl font-bold">Files List</h3>
                        {files.length === 0 && <p className="text-sm text-muted-foreground">No files found</p>}
                        {files.map((file) => (
                          <div key={file} className="flex justify-between items-center border-b py-2">
                            <span
                              className={`cursor-pointer ${selectedFile === file ? "font-bold text-blue-600" : ""}`}
                              onClick={() => setSelectedFile(file)}
                            >
                              {file}
                            </span>
                            <div className="flex w-1/2 gap-2">
                              <Button variant="outline" size="sm" onClick={() => window.open(`/api/files/download?folder=${fileFolder}&file=${file}`, "_blank")}>
                                Download
                              </Button>
                              <Button variant="destructive" size="sm" onClick={() => deleteFile(file)}>
                                Delete
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="space-y-2">
                        <input
                          ref={fileInputRef}
                          type="file"
                          onChange={(e) => { const file = e.target.files?.[0]; setUploadFile(file || null); }}
                        />
                        <div className="flex flex-col gap-2">
                          {uploadFile && <p className="text-xs text-green-600">Selected: {uploadFile.name}</p>}
                          <Button onClick={uploadSelectedFile} disabled={!uploadFile} className="w-fit">
                            Upload File
                          </Button>
                        </div>
                        {debugMsg && (
                          <div className="mt-2 text-sm p-2 bg-gray-100 border rounded">{debugMsg}</div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
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
