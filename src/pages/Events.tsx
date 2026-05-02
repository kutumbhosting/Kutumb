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
  const [activeEvent, setActiveEvent] = useState<string>("");
  const eventName = location.state?.eventName || "";

  const [submitMessage, setSubmitMessage] = useState<string>("");
  const [formData, setFormData] = useState({
    eventName: "",
    eventDate:"",
    name: "",
    email: "",
    phone: "",
    comments: "",
    adults: 0,
    children: 0,
  });

  useEffect(() => {
    if (location.state) {
      setFormData((prev) => ({
        ...prev,
        eventName: location.state.eventName || "",
        eventDate: location.state.eventDate || "",
      }));

      if (location.state.scrollTo === "registration") {
        setTimeout(() => {
          const el = document.getElementById("registration-form");
          if (el) {
            const y = el.getBoundingClientRect().top + window.pageYOffset;

            window.scrollTo({
              top: y - 90,
              behavior: "smooth",
            });
          }
        }, 200);
      }
    }
  }, [location]);

  useEffect(() => {
    fetchUpcomingEvents();
  }, []);

  const fetchUpcomingEvents = async () => {
    const res = await fetch("http://localhost:5000/api/upcoming-events");
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
      const res = await fetch("http://localhost:5000/api/events", {
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

      if (!res.ok) {
        throw new Error(data.message || "Server error");
      }

      setSubmitMessage("Registration successful!");
      setTimeout(() => setSubmitMessage(""), 5000);

      // ✅ SUCCESS MESSAGE
      toast({
        title: "Registration Successful!",
        description: "We've received your registration.",
      });

      // ✅ RESET FORM TO INITIAL STATE
      const initialState = {
        eventName: location.state?.eventName || "",
        eventDate: location.state?.eventDate || "",
        name: "",
        email: "",
        phone: "",
        comments: "",
        adults: 0,
        children: 0,
      };

      setFormData(initialState);

      // ✅ SCROLL BACK TO TOP OF FORM
      setTimeout(() => {
        const el = document.getElementById("registration-form");
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
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
        {/* Hero Section */}
        <section className="gradient-warm text-white py-20">
          <div className="container mx-auto px-4 text-center">
            <h1 className="mb-6">Events</h1>
            <p className="text-xl max-w-3xl mx-auto opacity-95">
              Join us for upcoming community events or explore our past activities and impact.
            </p>
          </div>
        </section>

        {/* Events Tabs */}
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





