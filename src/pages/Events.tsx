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

const Events = () => {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    comments: "",
  });

  const upcomingEvents = [
    {
      title: "Food Distribution Drive",
      date: "TBA, 2026",
      time: "12:00 PM - 3:00 PM",
      location: "University Campus",
      spots: "30",
      description: "Help us prepare and distribute nutritious meals to university's international students. Volunteers welcome!",
    },
    {
      title: "International Yoga Day 2026",
      date: "June 21, 2026",
      time: "8:00 AM - 12:00 PM",
      location: "TBA",
      spots: "150",
      description: "Join us on this speacial day of yoga to know benefits and impact of it in our mental and physical well being",
    },
    {
      title: "Guru Purnima Celebration",
      date: "September, 2026",
      time: "TBA",
      location: "TBA",
      spots: "100",
      description: "Join us in celebrating Guru Purnima Purv as we honor and express our gratitude to the teachers and gurus who have deeply influenced our lives.",
    },

    {
      title: "Diwali and Multi Cultural Event",
      date: "October, 2026",
      time: "6:00 PM - 10:00 PM",
      location: "TBA",
      spots: "300",
      description: "Celebrate Diwali with family and friends, great cultural programs and foods.",
    },
  ];

  const pastEvents = [
    {
      title: "Sri Ramcharitmanas Satsang 2026",
      date: "April 11-15, 2026",
      description: "Joined Hands with Hanumant Seva Trust to organise a 5 day Sundarkand and Ramcharitmanas program with Shri Dhaval Kumar ji. Completely free event for members and their family and friends. Attended by over 100 Kutumbians.",
      images: ["A very spiritual and devotional atmosphere, great sessions on ram bhakts like Hanuman ji, Kewat Ji, nice prasadam on each day"],
    },
    {
      title: "Kutumb Yoga Picnic 2025",
      date: "December 7, 2025",
      description: "Bring your health questions and dicover insights on well-beingthrough yoga and home remedies. Over 100 participants joined us for a special yoga picnic and get together session in the park.",
      images: ["A meaningful yoga and home remedies session, favourite home cooked dish to share, peaceful atmosphere"],
    },
    {
      title: "Kutumb Pariwar Diwali Party 2025",
      date: "October 26, 2025",
      description: "Our biggest event of the year brought together over 300 community members for a day of celebration, cultural performances, food, and fun. The festival showcased the diversity and unity of our community.",
      images: ["Event featured cultural dances, food stalls, kids activities, and community performances"],
    },
    {
      title: "International Yoga Day 2025",
      date: "June 21, 2025",
      description: "Over 100 participants joined us for a special yoga session in the park to celebrate International Yoga Day. The session focused on unity, wellness, and community bonding.",
      images: ["Large group yoga session in the park, diverse participants, peaceful atmosphere"],
    },
    {
      title: "Kutumb Holi Celebration 2025",
      date: "March 16, 2025",
      description: "Joined Hands with Darpan Radio to organise a Community Holi Celebration. Completely free event for members and their family and friends. Attended by over 100 Kutumbians including kids. Lots of Masti with singing and dancing; and traditional Holi sweets and savouries",
      images: ["Volunteers preparing meals, distribution to community members, smiling faces"],
    },
    {
      title: "Kutumb NewYear SundarkandPath 2025",
      date: "January 1, 2025",
      description: "Event for members and their family and friends. For a perfect and devotional start of the year. Joined hands with our own Nand and Rajni Upadhyay by sponsoring the hall rental.",
      images: ["Large group session in the hall, devotional atmosphere"],
    },
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Basic validation
    if (!formData.name || !formData.email || !formData.phone) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      toast({
        title: "Invalid Email",
        description: "Please enter a valid email address.",
        variant: "destructive",
      });
      return;
    }

    // In a real app, this would send data to backend
    console.log("Event Registration:", formData);
    
    toast({
      title: "Registration Successful!",
      description: "We've received your registration. You'll receive a confirmation email shortly.",
    });

    // Reset form
    setFormData({
      name: "",
      email: "",
      phone: "",
      comments: "",
    });
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      
      <main className="flex-grow">
        {/* Hero Section */}
        <section className="gradient-hero text-white py-20">
          <div className="container mx-auto px-4 text-center">
            <h1 className="mb-6">Events</h1>
            <p className="text-xl max-w-3xl mx-auto opacity-95">
              Join us for upcoming community events or explore our past activities and impact.
            </p>
          </div>
        </section>

        {/* Events Tabs */}
        <section className="py-20">
          <div className="container mx-auto px-4">
            <Tabs defaultValue="upcoming" className="max-w-7xl mx-auto">
              <TabsList className="grid w-full max-w-md mx-auto grid-cols-2 mb-12">
                <TabsTrigger value="upcoming" className="text-lg">Upcoming Events</TabsTrigger>
                <TabsTrigger value="past" className="text-lg">Past Events</TabsTrigger>
              </TabsList>

              {/* Upcoming Events */}
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

                        <Button className="w-full bg-primary hover:bg-primary/90">
                          Register for This Event
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Registration Form */}
                <div className="max-w-2xl mx-auto mt-16">
                  <Card className="border-2">
                    <CardContent className="p-8">
                      <h2 className="mb-6 text-center">Event Registration</h2>
                      <form onSubmit={handleSubmit} className="space-y-6">
                        <div>
                          <Label htmlFor="name">Full Name *</Label>
                          <Input
                            id="name"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
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
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
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
                            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                            placeholder="+61 XXX XXX XXX"
                            className="mt-2"
                          />
                        </div>

                        <div>
                          <Label htmlFor="comments">Additional Comments</Label>
                          <Textarea
                            id="comments"
                            value={formData.comments}
                            onChange={(e) => setFormData({ ...formData, comments: e.target.value })}
                            placeholder="Any special requirements or questions?"
                            className="mt-2 min-h-24"
                          />
                        </div>

                        <Button type="submit" className="w-full btn-accent text-lg py-6">
                          Submit Registration
                        </Button>
                      </form>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* Past Events */}
              <TabsContent value="past" className="space-y-8">
                {pastEvents.map((event, index) => (
                  <Card key={index} className="border-2">
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

                      <div className="bg-muted/50 rounded-lg p-4">
                        <h4 className="font-semibold mb-2 text-sm">Event Highlights:</h4>
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

