import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import UpcomingEvents from "./events/UpcomingEvents";
import PastEvents from "./events/PastEvents";

import { pastEvents } from "@/data/pastEventsData";
import { useToast } from "@/hooks/use-toast";

const Events = () => {
  const { toast } = useToast();
  const [upcomingEvents, setUpcomingEvents] = useState<any[]>([]);

  const location = useLocation();

  const [submitMessage, setSubmitMessage] = useState<string>("");

  const [formData, setFormData] = useState({
    eventName: "",
    eventDate: "",
    name: "",
    email: "",
    phone: "",
    comments: "",
    adults: 0,
    children: 0,
  });

  useEffect(() => {
    fetchUpcomingEvents();
  }, []);

  const fetchUpcomingEvents = async () => {
    const res = await fetch("/api/upcoming-events");
    const data = await res.json();
    setUpcomingEvents(data);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.email || !formData.phone) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    const res = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });

    const data = await res.json();

    if (res.status === 409) {
      setSubmitMessage("You are already registered for this event.");
      return;
    }

    if (!res.ok) throw new Error(data.message);

    setSubmitMessage("Registration successful!");
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-grow">

        <section className="gradient-warm text-white py-20 text-center">
          <h1>Events</h1>
        </section>

        <section className="py-20 bg-muted/30">
          <Tabs defaultValue="upcoming" className="max-w-7xl mx-auto">

            <TabsList className="grid w-full max-w-md mx-auto grid-cols-2 mb-12">
              <TabsTrigger value="upcoming">Upcoming Events</TabsTrigger>
              <TabsTrigger value="past">Past Events</TabsTrigger>
            </TabsList>

            {/* ✅ UPCOMING */}
            <TabsContent value="upcoming">
              <UpcomingEvents
                upcomingEvents={upcomingEvents}
                setFormData={setFormData}
              />
            </TabsContent>

            {/* ✅ PAST */}
            <TabsContent value="past">
              <PastEvents events={pastEvents} />
            </TabsContent>

          </Tabs>
        </section>

      </main>

      <Footer />
    </div>
  );
};

export default Events;




