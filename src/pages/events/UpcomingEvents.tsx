import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TabsContent } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Calendar, MapPin, Users, Clock } from "lucide-react";

interface FormData {
  eventName: string;
  eventDate: string;
  name: string;
  email: string;
  phone: string;
  comments: string;
  adults: number;
  children: number;
}

interface UpcomingEventsProps {
  upcomingEvents: any[];
  formData: FormData;
  setFormData: React.Dispatch<React.SetStateAction<FormData>>;
  submitMessage: string;
  handleSubmit: (e: React.FormEvent) => Promise<void>;
}

const UpcomingEvents = ({
  upcomingEvents,
  formData,
  setFormData,
  submitMessage,
  handleSubmit,
}: UpcomingEventsProps) => {
  return (
    <TabsContent value="upcoming" className="space-y-12">
      <div className="grid md:grid-cols-2 gap-8">
        {(Array.isArray(upcomingEvents) ? upcomingEvents : [])
          .filter((event) => event.isActive)
          .map((event, index) => {
            const hasFlyer = !!event.flyerImage;

            return (
              <Card key={index} className="card-hover border border-border">
                <CardContent className="p-6">
                  <div className={`grid gap-6 ${hasFlyer ? "md:grid-cols-2" : ""}`}>

                    {/* LEFT */}
                    <div>
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
                          <span> {event.availableSpots} / {event.capacity} spots available</span>
                        </div>
                      </div>

                      <p className="text-muted-foreground">
                        {event.description}
                      </p>
                    </div>

                    {/* RIGHT (IMAGE) */}
                    {hasFlyer && (
                      <div className="flex justify-center items-start">
                        <img
                          src={`http://localhost:5000/eventflyer/${event.flyerImage}`}
                          alt={event.title}
                          className="rounded-lg shadow-md max-h-[350px] object-contain"
                        />
                      </div>
                    )}

                    {/* ✅ BUTTON → FULL WIDTH (SPANS BOTH COLUMNS) */}
                    <div className={hasFlyer ? "md:col-span-2" : ""}>
                      <Button
                        className="w-full btn-hero mt-4"
                        onClick={() => {
                          setFormData({
                            eventName: event.title,
                            eventDate: event.date,
                            name: "",
                            email: "",
                            phone: "",
                            comments: "",
                            adults: 0,
                            children: 0,
                          });

                          setTimeout(() => {
                            document
                              .getElementById("registration-form")
                              ?.scrollIntoView({ behavior: "smooth" });
                          }, 0);
                        }}
                      >
                        Register for This Event
                      </Button>
                    </div>

                  </div>
                </CardContent>
              </Card>
            );
          })}
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
                  value={formData.eventName}
                  placeholder="Enter event name"
                  readOnly
                  className="mt-2 bg-muted"
                />
              </div>

              <div>
                <Label htmlFor="event">Event Date *</Label>
                <Input
                  id="date"
                  value={formData.eventDate}
                  placeholder="Enter event date"
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
  );
};

export default UpcomingEvents;

