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

// images unchanged...

const Events = () => {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    comments: "",
  });

  const upcomingEvents = [/* unchanged */];
  const pastEvents = [/* unchanged */];

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-grow">

        {/* Hero Section - MATCHED */}
        <section className="gradient-warm text-white py-20">
          <div className="container mx-auto px-4 text-center">
            <h1 className="mb-6">Events</h1>
            <p className="text-xl max-w-3xl mx-auto opacity-95">
              Join us for upcoming community events or explore our past activities and impact.
            </p>
          </div>
        </section>

        {/* Tabs Section */}
        <section className="py-20">
          <div className="container mx-auto px-4">

            <Tabs defaultValue="upcoming" className="max-w-7xl mx-auto">

              {/* Tabs - softened styling */}
              <TabsList className="grid w-full max-w-md mx-auto grid-cols-2 mb-12 bg-muted/40">
                <TabsTrigger value="upcoming" className="text-lg data-[state=active]:bg-primary data-[state=active]:text-white">
                  Upcoming Events
                </TabsTrigger>
                <TabsTrigger value="past" className="text-lg data-[state=active]:bg-primary data-[state=active]:text-white">
                  Past Events
                </TabsTrigger>
              </TabsList>

              {/* UPCOMING */}
              <TabsContent value="upcoming" className="space-y-12">

                <div className="grid md:grid-cols-2 gap-8">
                  {upcomingEvents.map((event, index) => (
                    <Card key={index} className="card-hover border-2">
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

                        <Button className="w-full btn-hero">
                          Register for This Event
                        </Button>

                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* FORM - MATCHED CARD STYLE */}
                <div className="max-w-2xl mx-auto mt-16">
                  <Card className="border-2">
                    <CardContent className="p-8">

                      <h2 className="mb-6 text-center">Event Registration</h2>

                      <form className="space-y-6">

                        <div>
                          <Label htmlFor="name">Full Name *</Label>
                          <Input className="mt-2" />
                        </div>

                        <div>
                          <Label htmlFor="email">Email Address *</Label>
                          <Input type="email" className="mt-2" />
                        </div>

                        <div>
                          <Label htmlFor="phone">Phone Number *</Label>
                          <Input type="tel" className="mt-2" />
                        </div>

                        <div>
                          <Label>Additional Comments</Label>
                          <Textarea className="mt-2 min-h-24" />
                        </div>

                        <Button className="w-full btn-accent text-lg py-6">
                          Submit Registration
                        </Button>

                      </form>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* PAST */}
              <TabsContent value="past" className="space-y-8">

                {pastEvents.map((event, index) => (
                  <Card key={index} className="border-2 card-hover">
                    <CardContent className="p-8">

                      <div className="flex items-start justify-between mb-4">
                        <h3 className="text-2xl font-bold">{event.title}</h3>

                        {/* MATCHED BADGE STYLE */}
                        <span className="text-sm font-semibold bg-primary/10 text-primary px-4 py-2 rounded-full">
                          {event.date}
                        </span>
                      </div>

                      <p className="text-muted-foreground mb-6">
                        {event.description}
                      </p>

                      {/* MEDIA unchanged */}
                      {event.media && (
                        <div className="flex gap-4 overflow-x-auto mb-6">
                          {event.media.map((item, i) => (
                            <div key={i} className="min-w-[240px] h-44 rounded-lg overflow-hidden shadow-md">
                              {item.type === "image" ? (
                                <img src={item.src} className="w-full h-full object-cover" />
                              ) : (
                                <video src={item.src} controls className="w-full h-full object-cover" />
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="bg-muted/50 rounded-lg p-4">
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


