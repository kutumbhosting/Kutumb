import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useState } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Calendar, MapPin, Users, Clock } from "lucide-react";
import { upcomingEvents } from "@/data/upcomingEventsData";
import { pastEvents } from "@/data/pastEventsData";

const Events = () => {
  const { toast } = useToast();

  const location = useLocation();
  const [activeEvent, setActiveEvent] = useState<string>("");
  const eventTitle = location.state?.eventTitle || "";

  const [submitMessage, setSubmitMessage] = useState<string>("");
  const [formData, setFormData] = useState({
    event: "",
    name: "",
    email: "",
    phone: "",
    comments: "",
    adults: 0,
    children: 0,
  });

  useEffect(() => {
    if (location.state) {
      // ✅ Set event name
      if (location.state.eventTitle) {
        setFormData((prev) => ({
          ...prev,
          event: location.state.eventTitle,
        }));
      }

      // ✅ Scroll to form
      if (location.state.scrollTo === "registration") {
        setTimeout(() => {
          const el = document.getElementById("registration-form");
          if (el) {
            const y =
              el.getBoundingClientRect().top + window.pageYOffset;

            window.scrollTo({
              top: y - 90,
              behavior: "smooth",
            });
          }
        }, 200);
      }
    }
  }, [location]);

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
      description: "We’ve received your registration.",
    });

    // ✅ RESET FORM TO INITIAL STATE
    const initialState = {
      event: location.state?.eventTitle || "",
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

              <TabsContent value="upcoming" className="space-y-12">
                <div className="grid md:grid-cols-2 gap-8">
                  {upcomingEvents.map((event, index) => (
                    <Card key={index} className="card-hover border border-border">
                      <CardContent className="p-6">
                        <h3 className="text-xl font-bold mb-4">{event.title}</h3>

                        <div className="space-y-3 mb-6">
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Calendar size={18} className="text-primary" />
                            <span>{event.date}</span>
                          </div>
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Clock size={18} className="text-primary" />
                            <span>{event.time}</span>
                          </div>
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <MapPin size={18} className="text-primary" />
                            <span>{event.location}</span>
                          </div>
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Users size={18} className="text-primary" />
                            <span>{event.spots} spots available</span>
                          </div>
                        </div>

                        <p className="text-muted-foreground mb-6">
                          {event.description}
                        </p>

                        <Button
                          className="w-full btn-hero"
                          onClick={() => {
                            const eventName = event.title;

                            setFormData({
                              event: eventName,
                              name: "",
                              email: "",
                              phone: "",
                              comments: "",
                              adults: 0,
                              children: 0,
                            });

                            setTimeout(() => {
                              const el = document.getElementById("registration-form");

                              if (el) {
                                el.scrollIntoView({
                                  behavior: "smooth",
                                  block: "start",
                                });
                              }
                            }, 0);
                          }}
                        >
                          Register for This Event
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <div
                  id="registration-form"
                  className="max-w-2xl mx-auto mt-16 scroll-mt-24"
                >
                  <Card className="border border-border">
                    <CardContent className="p-8">
                      <h2 className="mb-6 text-center">Event Registration</h2>

                      <form onSubmit={handleSubmit} className="space-y-6">
                        <div>
                          <Label htmlFor="event">Event Name *</Label>
                          <Input
                            id="event"
                            value={formData.event}
                            placeholder="Enter event name"
                            readOnly
                            className="mt-2 bg-muted"
                          />
                        </div>

                        <div>
                          <Label htmlFor="name">Full Name *</Label>
                          <Input
                            id="name"
                            value={formData.name}
                            onChange={(e) =>
                              setFormData({ ...formData, name: e.target.value })
                            }
                            placeholder="Enter your full name"
                            className="mt-2"
                          />
                        </div>

                        <div>
                          <Label htmlFor="email">Email Address *</Label>
                          <Input
                            id="email"
                            type="email"
                            value={formData.email}
                            onChange={(e) =>
                              setFormData({ ...formData, email: e.target.value })
                            }
                            placeholder="your.email@example.com"
                            className="mt-2"
                          />
                        </div>

                        <div>
                          <Label htmlFor="phone">Phone Number *</Label>
                          <Input
                            id="phone"
                            type="tel"
                            value={formData.phone}
                            onChange={(e) =>
                              setFormData({ ...formData, phone: e.target.value })
                            }
                            placeholder="+61 XXX XXX XXX"
                            className="mt-2"
                          />
                        </div>

                        <div className="grid md:grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor="adults">Number of Adults *</Label>
                            <Input
                              id="adults"
                              type="number"
                              min="0"
                              value={formData.adults}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  adults: Number(e.target.value),
                                })
                              }
                              className="mt-2"
                            />
                          </div>

                          <div>
                            <Label htmlFor="children">Children (Under 12)</Label>
                            <Input
                              id="children"
                              type="number"
                              min="0"
                              value={formData.children}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  children: Number(e.target.value),
                                })
                              }
                              className="mt-2"
                            />
                          </div>
                        </div>

                        <div>
                          <Label htmlFor="comments">Additional Comments</Label>
                          <Textarea
                            id="comments"
                            value={formData.comments}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                comments: e.target.value,
                              })
                            }
                            placeholder="Any special requirements or questions?"
                            className="mt-2 min-h-24"
                          />
                        </div>

                        <Button
                          type="submit"
                          className="w-full btn-hero text-lg py-6"
                        >
                          Submit Registration
                        </Button>
{submitMessage && (
  <p
    className={`mt-4 text-center text-sm ${
      submitMessage === "Registration successful!"
        ? "text-green-600"
        : "text-red-600"
    }`}
  >
    {submitMessage}
  </p>
)}
                      </form>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="past" className="space-y-8">
                {Array.isArray(pastEvents) &&
                  pastEvents.map((event, index) => (
                    <Card key={index} className="border border-border">
                      <CardContent className="p-8">
                        <div className="flex items-start justify-between mb-4">
                          <h3 className="text-2xl font-bold">{event.title}</h3>
                          <span className="text-sm text-primary font-semibold bg-primary/10 px-4 py-2 rounded-full">
                            {event.date}
                          </span>
                        </div>

                        <p className="text-muted-foreground leading-relaxed mb-6">
                          {event.description}
                        </p>

                        {event.media && (
                          <div className="flex justify-center">
                            <div className="flex gap-4 overflow-x-auto mb-6">
                              {event.media.map((item, i) => (
                                <div
                                  key={i}
                                  className="min-w-[240px] h-44 rounded-lg overflow-hidden shadow-md"
                                >
                                  {item.type === "image" ? (
                                    <img
                                      src={item.src}
                                      alt="event"
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    <video
                                      src={item.src}
                                      controls
                                      preload="metadata"
                                      className="w-full h-full object-cover"
                                    />
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="bg-muted/50 rounded-lg p-4">
                          <h4 className="font-semibold mb-2 text-sm">
                            Event Highlights:
                          </h4>
                          <p className="text-sm text-muted-foreground italic">
                            {event.images[0]}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
              </TabsContent>
            </Tabs>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default Events;


