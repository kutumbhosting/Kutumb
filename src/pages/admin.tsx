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

const [selectedEventKey, setSelectedEventKey] = useState<string>("");

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

const rows = memberData.map((row) =>
  Object.values({
    ...row,
    interests: Array.isArray(row.interests)
      ? row.interests.join(" | ")
      : row.interests,
  }).join(",")
);

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

  // ================= FETCH DATA =================

const fetchData = async () => {
  try {
    const eventsRes = await fetch("http://localhost:5000/api/events");
    const membersRes = await fetch("http://localhost:5000/api/members");

    if (!eventsRes.ok || !membersRes.ok) {
      throw new Error("API failed");
    }

    const events = await eventsRes.json();
    const members = await membersRes.json();

    const grouped = events.reduce((acc: any, item: any) => {
      const key = `${item.eventName} ${item.eventYear}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {});

    setGroupedEvents(grouped);
    setMemberData(members);
  } catch (err) {
    console.error("fetchData error:", err);
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

const rows = data.map((row) => {
  const cleanRow = {
    ...row,
    interests: normalizeInterests(row.interests),
  };

  return Object.values(cleanRow).join(",");
});


    const csv = [headers, ...rows].join("\n");

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
            <h1 className="mb-6">Admin Dashboard</h1>
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
                <TabsList className="grid w-full max-w-md mx-auto grid-cols-2 mb-12">
                  <TabsTrigger value="events">Event Registrations</TabsTrigger>
                  <TabsTrigger value="members">Members</TabsTrigger>
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

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
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

                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b">
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