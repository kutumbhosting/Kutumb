import { useState, useEffect } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

// ─── Tab components (each lives in /pages/admin/) ───────────────────────────
import EventRegistration from "./admin/EventRegistration";
import Members from "./admin/Members";
import UpcomingEvents from "./admin/UpcomingEvents";
import DatabaseTables from "./admin/DatabaseTables";
import FileManagement from "./admin/FileManagement";
import PastEvents from "./admin/PastEvents";
import TicketingManager from "./admin/TicketingManager";
import CheckIn from "./admin/CheckIn";
import PlatformConsole from "./admin/PlatformConsole";

// ─── Shared utilities ────────────────────────────────────────────────────────
import { safeFetch } from "./admin/safeFetch";

const Admin = () => {
  const { toast } = useToast();

  // ─── Auth state ────────────────────────────────────────────────────────────
  // Real login against /api/admin-auth/login, which sets an httpOnly session
  // cookie the browser sends automatically on every same-origin request from
  // here on — that's what actually protects every admin API route now (see
  // requireAdmin in server/lib/auth.js), not this React state, which just
  // controls what's rendered. `checkingSession` avoids a flash of the login
  // form while we confirm an existing cookie session on page load.
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [adminName, setAdminName] = useState("");
  const [loginData, setLoginData] = useState({ email: "", password: "" });
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  useEffect(() => {
    fetch("/api/admin-auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((admin) => {
        if (admin) {
          setIsLoggedIn(true);
          setAdminName(admin.name);
        }
      })
      .finally(() => setCheckingSession(false));
  }, []);

  // ─── Shared data passed down to tab components ────────────────────────────
  // groupedEvents and memberData are fetched here (in Admin) so both
  // EventRegistration and Members always have fresh, consistent data.
  const [groupedEvents, setGroupedEvents] = useState<Record<string, any[]>>({});
  const [memberData, setMemberData] = useState<any[]>([]);

  // ─── fetchData ─────────────────────────────────────────────────────────────
  // Loads all event files individually (safe — one bad file won't crash load)
  // then groups registrations by eventName_eventYear for the dropdown.
  const fetchData = async () => {
    try {
      const events = await safeFetch("/api/all-registrations");

      if (!Array.isArray(events)) {
        console.warn("[fetchData] /api/all-registrations did not return an array:", events);
        setGroupedEvents({});
        const members = await safeFetch("/api/members");
        setMemberData(Array.isArray(members) ? members : []);
        return;
      }

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

      // 4. Members are independent of events
      const members = await safeFetch("/api/members");
      setMemberData(Array.isArray(members) ? members : []);

    } catch (err) {
      // safeFetch absorbs errors, but keep this as a safety net
      console.error("[fetchData] unexpected error:", err);
    }
  };

  // Refresh dashboard data whenever we become logged in - covers both a
  // fresh login and a restored session (page navigated to/from, or reloaded).
  useEffect(() => {
    if (isLoggedIn) fetchData();
  }, [isLoggedIn]);

  // ─── Login handler ─────────────────────────────────────────────────────────
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setLoggingIn(true);
    try {
      const res = await fetch("/api/admin-auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginData.email, password: loginData.password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Login failed");
      setIsLoggedIn(true);
      setAdminName(data.admin.name);
      toast({ title: "Login Successful", description: `Welcome, ${data.admin.name}` });
    } catch (err: any) {
      setLoginError(err.message || "Invalid email or password");
      toast({ title: "Invalid Credentials", description: err.message, variant: "destructive" });
    } finally {
      setLoggingIn(false);
    }
  };

  // ─── Logout handler ─────────────────────────────────────────────────────────
  const handleLogout = async () => {
    await fetch("/api/admin-auth/logout", { method: "POST" }).catch(() => {});
    setIsLoggedIn(false);
    setLoginData({ email: "", password: "" });
    toast({ title: "Logged Out", description: "You have been logged out." });
  };

  // ─── RENDER ────────────────────────────────────────────────────────────────
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
        {!checkingSession && !isLoggedIn && (
          <section className="py-20">
            <div className="container mx-auto px-4 max-w-md">
              <Card className="border-2">
                <CardContent className="p-8">
                  <h2 className="mb-6 text-center">Admin Login</h2>
                  <form onSubmit={handleLogin} className="space-y-4">
                    <Input
                      type="email"
                      placeholder="Email"
                      value={loginData.email}
                      onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
                    />
                    <Input
                      type="password"
                      placeholder="Password"
                      value={loginData.password}
                      onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                    />
                    {loginError && <p className="text-sm text-destructive">{loginError}</p>}
                    <Button type="submit" disabled={loggingIn} className="w-full btn-hero">
                      {loggingIn ? "Logging in..." : "Login"}
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
              <div className="max-w-7xl mx-auto flex items-center justify-between mb-4">
                <p className="text-muted-foreground">Logged in as <strong>{adminName}</strong></p>
                <Button
                  onClick={handleLogout}
                  className="bg-accent hover:bg-accent/90 text-accent-foreground"
                >
                  Logout
                </Button>
              </div>
              <Tabs defaultValue="events" className="max-w-7xl mx-auto">

                <TabsList className="flex flex-wrap w-full max-w-4xl mx-auto gap-3 mb-12">
                  <TabsTrigger value="events">Event Registrations</TabsTrigger>
                  <TabsTrigger value="members">Members</TabsTrigger>
                  <TabsTrigger value="upcoming">Upcoming Events</TabsTrigger>
                  <TabsTrigger value="past">Past Events</TabsTrigger>
                  <TabsTrigger value="database-tables">Database Tables</TabsTrigger>
                  <TabsTrigger value="files">Files Management</TabsTrigger>
                  <TabsTrigger value="ticketing">Ticketing & Payments</TabsTrigger>
                  <TabsTrigger value="checkin">QR Check-in</TabsTrigger>
                  <TabsTrigger value="console">Settings & Access</TabsTrigger>
                </TabsList>

                {/* ── Event Registrations ── */}
                <TabsContent value="events">
                  <EventRegistration
                    groupedEvents={groupedEvents}
                    onReload={fetchData}
                  />
                </TabsContent>

                {/* ── Members ── */}
                <TabsContent value="members">
                  <Members
                    memberData={memberData}
                    onReload={fetchData}
                  />
                </TabsContent>

                {/* ── Upcoming Events ── */}
                {/* UpcomingEvents manages its own fetch internally */}
                <TabsContent value="upcoming">
                  <UpcomingEvents />
                </TabsContent>

                {/* ── Past Events (placeholder) ── */}
                <TabsContent value="past">
                  <PastEvents />
                </TabsContent>

                {/* ── Database Tables ── */}
                <TabsContent value="database-tables">
                  <DatabaseTables />
                </TabsContent>

                {/* ── File Management ── */}
                {/* FileManagement manages its own fetch internally */}
                <TabsContent value="files">
                  <FileManagement />
                </TabsContent>

                {/* ── Ticketing & Payments (new) ── */}
                <TabsContent value="ticketing">
                  <TicketingManager groupedEvents={groupedEvents} />
                </TabsContent>

                {/* ── QR Check-in (new) ── */}
                <TabsContent value="checkin">
                  <CheckIn groupedEvents={groupedEvents} />
                </TabsContent>

                {/* ── Settings, admin users, audit log (new) ── */}
                <TabsContent value="console">
                  <PlatformConsole currentAdminEmail={adminName} />
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