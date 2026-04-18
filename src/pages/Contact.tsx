import { useState } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { MapPin, Phone, Mail, Clock } from "lucide-react";

const Contact = () => {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    subject: "",
    message: "",
  });

  const contactInfo = [
    {
      icon: MapPin,
      title: "Address",
      details: "Sydney, New South Wales, Australia",
      color: "text-primary",
    },
    {
      icon: Phone,
      title: "Phone",
      details: "+61 412 830 048",
      link: "tel:+61412830048",
      color: "text-secondary",
    },
    {
      icon: Mail,
      title: "Email",
      details: "info@kutumb.org.au",
      link: "mailto:info@kutumb.org.au",
      color: "text-accent",
    },
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!formData.name || !formData.email || !formData.message) {
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
    console.log("Contact Form:", formData);

    toast({
      title: "Message Sent!",
      description: "Thank you for contacting us. We'll get back to you soon!",
    });

    // Reset form
    setFormData({
      name: "",
      email: "",
      phone: "",
      subject: "",
      message: "",
    });
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      
      <main className="flex-grow">
        {/* Hero Section */}
        <section className="gradient-hero text-white py-20">
          <div className="container mx-auto px-4 text-center">
            <h1 className="mb-6">Contact Us</h1>
            <p className="text-xl max-w-3xl mx-auto opacity-95">
              Have questions or want to get involved? We'd love to hear from you. Reach out to us anytime!
            </p>
          </div>
        </section>

        {/* Contact Info Cards */}
        <section className="py-20">
          <div className="container mx-auto px-4">
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto mb-16">
              {contactInfo.map((info, index) => {
                const Icon = info.icon;
                return (
                  <Card key={index} className="text-center card-hover border-2">
                    <CardContent className="p-6">
                      <div className={`w-16 h-16 bg-gradient-hero rounded-full flex items-center justify-center mx-auto mb-4`}>
                        <Icon className="w-8 h-8 text-white" />
                      </div>
                      <h3 className="font-bold mb-2">{info.title}</h3>
                      {info.link ? (
                        <a
                          href={info.link}
                          className={`text-sm ${info.color} hover:underline`}
                        >
                          {info.details}
                        </a>
                      ) : (
                        <p className="text-sm text-muted-foreground">{info.details}</p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        {/* Contact Form & Map */}
        <section className="py-20 bg-muted/30">
          <div className="container mx-auto px-4">
            <div className="grid lg:grid-cols-2 gap-12 max-w-6xl mx-auto">
              {/* Contact Form */}
              <div>
                <Card className="border-2">
                  <CardContent className="p-8">
                    <h2 className="mb-6">Send Us a Message</h2>
                    
                    <form onSubmit={handleSubmit} className="space-y-6">
                      <div className="grid md:grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="name">Name *</Label>
                          <Input
                            id="name"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            placeholder="Your name"
                            className="mt-2"
                          />
                        </div>

                        <div>
                          <Label htmlFor="phone">Phone</Label>
                          <Input
                            id="phone"
                            type="tel"
                            value={formData.phone}
                            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                            placeholder="+61 XXX XXX XXX"
                            className="mt-2"
                          />
                        </div>
                      </div>

                      <div>
                        <Label htmlFor="email">Email *</Label>
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
                        <Label htmlFor="subject">Subject</Label>
                        <Input
                          id="subject"
                          value={formData.subject}
                          onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                          placeholder="What is this regarding?"
                          className="mt-2"
                        />
                      </div>

                      <div>
                        <Label htmlFor="message">Message *</Label>
                        <Textarea
                          id="message"
                          value={formData.message}
                          onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                          placeholder="Tell us how we can help you..."
                          className="mt-2 min-h-32"
                        />
                      </div>

                      <Button type="submit" className="w-full btn-accent text-lg py-6">
                        Send Message
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              </div>

              {/* Additional Info */}
              <div className="space-y-8">
                <Card className="border-2">
                  <CardContent className="p-8">
                    <h3 className="text-2xl font-bold mb-4">Quick Links</h3>
                    <div className="space-y-3">
                      <a
                        href="/membership"
                        className="block text-primary hover:underline font-medium"
                      >
                        → Become a Member
                      </a>
                      <a
                        href="/events"
                        className="block text-primary hover:underline font-medium"
                      >
                        → Register for Events
                      </a>
                      <a
                        href="/activities"
                        className="block text-primary hover:underline font-medium"
                      >
                        → View Our Activities
                      </a>
                      <a
                        href="/executive"
                        className="block text-primary hover:underline font-medium"
                      >
                        → Meet Our Team
                      </a>
                    </div>
                  </CardContent>
                </Card>

                <Card className="gradient-warm text-white border-2">
                  <CardContent className="p-8">
                    <h3 className="text-2xl font-bold mb-4">Join Our Community</h3>
                    <p className="mb-6 opacity-95">
                      Ready to make a difference? Become a member today and be part of our growing community.
                    </p>
                    <a href="/membership">
                      <Button className="w-full bg-white text-primary hover:bg-white/90">
                        Join Now
                      </Button>
                    </a>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="py-20">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto">
              <h2 className="mb-12 text-center">Frequently Asked Questions</h2>
              
              <div className="space-y-6">
                <Card>
                  <CardContent className="p-6">
                    <h4 className="font-bold mb-2">How can I become a member?</h4>
                    <p className="text-muted-foreground">
                      Simply fill out the membership registration form on our Membership page. It's completely free and only takes a few minutes!
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <h4 className="font-bold mb-2">Are your events open to non-members?</h4>
                    <p className="text-muted-foreground">
                      Most of our events are open to everyone in the community. However, members get priority registration and early notifications.
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <h4 className="font-bold mb-2">How can I volunteer?</h4>
                    <p className="text-muted-foreground">
                      Contact us through this form expressing your interest in volunteering, or register for one of our volunteer events on the Events page.
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <h4 className="font-bold mb-2">Do you accept donations?</h4>
                    <p className="text-muted-foreground">
                      Yes! As a registered non-profit, we accept donations to support our community programs. Contact us for more information about how you can contribute.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default Contact;

