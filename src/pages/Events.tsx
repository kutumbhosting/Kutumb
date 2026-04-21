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
import satsang1_26 from "@/assets/events/26satsang1.jpeg";
import satsang2_26 from "@/assets/events/26satsang2.jpeg";
import satsang3_26 from "@/assets/events/26satsang3.jpeg";
import satsangvideo_26 from "@/assets/events/26satsangvideo.mp4";
import intyoga1_25 from "@/assets/events/25intyoga1.jpeg";
import intyoga2_25 from "@/assets/events/25intyoga2.jpeg";
import intyoga3_25 from "@/assets/events/25intyoga3.jpeg";
import intyogavideo_25 from "@/assets/events/25intyogavideo.mp4";
import sunderkand1_25 from "@/assets/events/25sunderkand1.jpeg";
import sunderkand2_25 from "@/assets/events/25sunderkand2.jpeg";
import sunderkandvideo1_25 from "@/assets/events/25sunderkandvideo1.mp4";
import sunderkandvideo2_25 from "@/assets/events/25sunderkandvideo2.mp4";
import holi1_25 from "@/assets/events/25holi1.jpeg";
import holi2_25 from "@/assets/events/25holi2.jpeg";
import holi3_25 from "@/assets/events/25holi3.jpeg";
import holivideo_25 from "@/assets/events/25holivideo.mp4";
import diwali1_25 from "@/assets/events/25diwali1.jpeg";
import diwali2_25 from "@/assets/events/25diwali2.jpeg";
import diwali3_25 from "@/assets/events/25diwali3.jpeg";
import diwali4_25 from "@/assets/events/25diwali4.jpeg";
import diwalivideo_25 from "@/assets/events/25diwalivideo.mp4";
import yogapic1_25 from "@/assets/events/25yogapicnic1.jpeg";
import yogapic2_25 from "@/assets/events/25yogapicnic2.jpeg";
import yogapic3_25 from "@/assets/events/25yogapicnic3.jpeg";
import yogapicvideo_25 from "@/assets/events/25yogapicnicvideo.mp4";

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
      media: [
        { type: "image", src: satsang1_26 },
        { type: "image", src: satsang2_26 },
        { type: "image", src: satsang3_26 },
        { type: "video", src: satsangvideo_26 },
      ],
      images: ["A very spiritual and devotional atmosphere, great sessions on ram bhakts like Hanuman ji, Kewat Ji, nice prasadam on each day"],
    },
    {
      title: "Kutumb Yoga Picnic 2025",
      date: "December 7, 2025",
      description: "Bring your health questions and dicover insights on well-beingthrough yoga and home remedies. Over 100 participants joined us for a special yoga picnic and get together session in the park.",
      media: [
        { type: "image", src: yogapic1_25 },
        { type: "image", src: yogapic2_25 },
        { type: "image", src: yogapic3_25 },
        { type: "video", src: yogapicvideo_25 },
      ],
      images: ["A meaningful yoga and home remedies session, favourite home cooked dish to share, peaceful atmosphere"],
    },
    {
      title: "Kutumb Pariwar Diwali Party 2025",
      date: "October 26, 2025",
      description: "Our biggest event of the year brought together over 300 community members for a day of celebration, cultural performances, food, and fun. The festival showcased the diversity and unity of our community.",
      media: [
        { type: "image", src: diwali2_25 },
        { type: "image", src: diwali3_25 },
        { type: "image", src: diwali4_25 },
        { type: "video", src: diwalivideo_25 },
      ],
      images: ["Event featured cultural dances, food stalls, kids activities, and community performances"],
    },
    {
      title: "International Yoga Day 2025",
      date: "June 21, 2025",
      description: "Over 100 participants joined us for a special yoga session in the park to celebrate International Yoga Day. The session focused on unity, wellness, and community bonding.",
      media: [
        { type: "image", src: intyoga1_25 },
        { type: "image", src: intyoga2_25 },
        { type: "image", src: intyoga3_25 },
        { type: "video", src: intyogavideo_25 },
      ],
      images: ["Large group yoga session in community hall, diverse participants, peaceful atmosphere"],
    },
    {
      title: "Kutumb Holi Celebration 2025",
      date: "March 16, 2025",
      description: "Joined Hands with Darpan Radio to organise a Community Holi Celebration. Completely free event for members and their family and friends. Attended by over 100 Kutumbians including kids. Lots of Masti with singing and dancing; and traditional Holi sweets and savouries",
      media: [
        { type: "image", src: holi1_25 },
        { type: "image", src: holi2_25 },
        { type: "image", src: holi3_25 },
        { type: "video", src: holivideo_25 },
      ],
      images: ["Volunteers preparing meals, distribution to community members, smiling faces"],
    },
    {
      title: "Kutumb NewYear SundarkandPath 2025",
      date: "January 1, 2025",
      description: "Event for members and their family and friends. For a perfect and devotional start of the year. Joined hands with our own Nand and Rajni Upadhyay by sponsoring the hall rental.",
      media: [
        { type: "image", src: sunderkand1_25 },
        { type: "image", src: sunderkand2_25 },
        { type: "video", src: sunderkandvideo1_25 },
        { type: "video", src: sunderkandvideo2_25 },
      ],
      images: ["Large group session in the hall, devotional atmosphere"],
    },
  ];

  const handleSubmit = (e: React.FormEvent) => {
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

    console.log("Event Registration:", formData);

    toast({
      title: "Registration Successful!",
      description: "We've received your registration. You'll receive a confirmation email shortly.",
    });

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
                <TabsTrigger value="upcoming" className="text-lg">Upcoming Events</TabsTrigger>
                <TabsTrigger value="past" className="text-lg">Past Events</TabsTrigger>
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

                        <Button className="w-full btn-hero">
                          Register for This Event
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <div className="max-w-2xl mx-auto mt-16">
                  <Card className="border border-border">
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

                        <Button type="submit" className="w-full btn-hero text-lg py-6">
                          Submit Registration
                        </Button>

                      </form>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="past" className="space-y-8">
                {pastEvents.map((event, index) => (
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
                              <div key={i} className="min-w-[240px] h-44 rounded-lg overflow-hidden shadow-md">
                                {item.type === "image" ? (
                                  <img src={item.src} alt="event" className="w-full h-full object-cover" />
                                ) : (
                                  <video src={item.src} controls preload="metadata" className="w-full h-full object-cover" />
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

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


