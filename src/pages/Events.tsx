import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useState } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import UpcomingEvents from "@/pages/events/UpcomingEvents";
import PastEvents from "@/pages/events/PastEvents";

const Events = () => {
  const { toast } = useToast();
  const [upcomingEvents, setUpcomingEvents] = useState([]);
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

  // ── Shared fetch function used on load and after registration ────────────
  const loadUpcomingEvents = () => {
    fetch("/api/upcoming-events")
      .then((res) => res.json())
      .then((data) => setUpcomingEvents(Array.isArray(data) ? data : []))
      .catch((err) => {
        console.error("Failed to fetch upcoming events:", err);
        setUpcomingEvents([]);
      });
  };

  // ── Initial load ─────────────────────────────────────────────────────────
  useEffect(() => {
    loadUpcomingEvents();
  }, []);

  // ── Scroll to form when navigating from Home / Activities ────────────────
  useEffect(() => {
    if (location.state?.scrollTo === "registration") {
      setFormData((prev) => ({
        ...prev,
        eventName: location.state.eventName || "",
        eventDate: location.state.eventDate || "",
      }));

      const timer = setTimeout(() => {
        const el = document.getElementById("registration-form");
        if (el) {
          const y = el.getBoundingClientRect().top + window.pageYOffset - 90;
          window.scrollTo({ top: y, behavior: "smooth" });
        }
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [location.state]);

  // ── Submit handler ────────────────────────────────────────────────────────
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

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      toast({
        title: "Invalid Email",
        description: "Please enter a valid email address.",
        variant: "destructive",
      });
      return;
    }

    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (res.status === 409) {
        setSubmitMessage("You are already registered for this event.");
        setTimeout(() => setSubmitMessage(""), 5000);
        return;
      }

      if (!res.ok) throw new Error(data.message || "Server error");

      setSubmitMessage("Registration successful!");
      setTimeout(() => setSubmitMessage(""), 5000);

      toast({
        title: "Registration Successful!",
        description: "We've received your registration.",
      });

      // ✅ Refetch so available spots update immediately in the UI
      loadUpcomingEvents();

      // ✅ Reset form
      setFormData({
        eventName: location.state?.eventName || "",
        eventDate: location.state?.eventDate || "",
        name: "",
        email: "",
        phone: "",
        comments: "",
        adults: 0,
        children: 0,
      });

      setTimeout(() => {
        const el = document.getElementById("registration-form");
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);

    } catch (error) {
      console.error("API Error:", error);
      setSubmitMessage("Submission failed. Try again.");
      setTimeout(() => setSubmitMessage(""), 5000);
      toast({
        title: "Submission Failed",
        description: "Backend not running or API not reachable.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-grow">
        <section className="gradient-warm text-white py-20">
          <div className="container mx-auto px-4 text-center">
            <h1 className="mb-6">Events</h1>
            <p className="text-xl max-w-3xl mx-auto opacity-95">
              Join us for upcoming community events or explore our past activities and impact.
            </p>
          </div>
        </section>

        <section className="py-20 bg-muted/30">
          <div className="container mx-auto px-4">
            <Tabs defaultValue="upcoming" className="max-w-7xl mx-auto">
              <TabsList className="grid w-full max-w-md mx-auto grid-cols-2 mb-12">
                <TabsTrigger value="upcoming" className="text-lg">
                  Upcoming Events
                </TabsTrigger>
                <TabsTrigger value="past" className="text-lg">
                  Past Events
                </TabsTrigger>
              </TabsList>

              <UpcomingEvents
                upcomingEvents={upcomingEvents}
                formData={formData}
                setFormData={setFormData}
                submitMessage={submitMessage}
                handleSubmit={handleSubmit}
              />

              <PastEvents />
            </Tabs>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default Events;
