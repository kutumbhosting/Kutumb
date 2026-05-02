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
import FileManagement from "./admin/FileManagement";
import PastEvents from "./admin/PastEvents";

// ─── Shared utilities ────────────────────────────────────────────────────────
import { safeFetch } from "./admin/safeFetch";

// ─── Credentials (keep server-side in production) ────────────────────────────
const ADMIN_USER = "admin";
const ADMIN_PASSWORD = "Ku$1";

const Admin = () => {
  const { toast } = useToast();

  // ─── Auth state ────────────────────────────────────────────────────────────
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginData, setLoginData] = useState({ user: "", password: "" });

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
      // 1. Get the list of event files
      const filesData = await safeFetch("/api/event-files");

      if (!Array.isArray(filesData) || filesData.length === 0) {
        console.warn("[fetchData] /api/event-files returned empty or invalid:", filesData);
        setGroupedEvents({});
        const members = await safeFetch("/api/members");
        setMemberData(Array.isArray(members) ? members : []);
        return;
      }

      console.log("[fetchData] event files:", filesData);

      // 2. Fetch each event file individually — a single failure is isolated
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

      // 3. Flatten and group by eventName_eventYear key
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

      // 4. Members are independent of events
      const members = await safeFetch("/api/members");
      setMemberData(Array.isArray(members) ? members : []);

    } catch (err) {
      // safeFetch absorbs errors, but keep this as a safety net
      console.error("[fetchData] unexpected error:", err);
    }
  };

  // ─── Login handler ─────────────────────────────────────────────────────────
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (loginData.user === ADMIN_USER && loginData.password === ADMIN_PASSWORD) {
      setIsLoggedIn(true);
      toast({ title: "Login Successful", description: "Welcome Admin" });
      fetchData();
    } else {
      toast({
        title: "Invalid Credentials",
        description: "Incorrect email or password",
        variant: "destructive",
      });
    }
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

                <TabsList className="flex w-full max-w-2xl mx-auto gap-3 mb-12">
                  <TabsTrigger value="events">Event Registrations</TabsTrigger>
                  <TabsTrigger value="members">Members</TabsTrigger>
                  <TabsTrigger value="upcoming">Upcoming Events</TabsTrigger>
                  <TabsTrigger value="past">Past Events</TabsTrigger>
                  <TabsTrigger value="files">Files Management</TabsTrigger>
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

                {/* ── File Management ── */}
                {/* FileManagement manages its own fetch internally */}
                <TabsContent value="files">
                  <FileManagement />
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

