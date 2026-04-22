import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { useState } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Users, Heart, Calendar, Shield } from "lucide-react";

const Membership = () => {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    interests: [] as string[],
  });

const location = useLocation();
useEffect(() => {
  if (location.state?.scrollTo === "membership") {
    setTimeout(() => {
      const el = document.getElementById("membership-form");

      if (el) {
        const y =
          el.getBoundingClientRect().top + window.pageYOffset;

        window.scrollTo({
          top: y - 50, // adjust for navbar
          behavior: "smooth",
        });
      }
    }, 200);
  }
}, [location]);

  const benefits = [
    {
      icon: Users,
      title: "Community Network",
      description: "Connect with like-minded individuals who share your passion for making a difference.",
    },
    {
      icon: Heart,
      title: "Priority Access",
      description: "Get early registration for events, workshops, and special community programs.",
    },
    {
      icon: Calendar,
      title: "Regular Updates",
      description: "Stay informed about all our activities, events, and community initiatives.",
    },
    {
      icon: Shield,
      title: "Official Recognition",
      description: "Receive official membership certificate and recognition for your contributions.",
    },
  ];

  const interestOptions = [
    "Yoga & Wellness",
    "Food Service & Distribution",
    "Community Service",
    "Event Planning",
    "Volunteering",
    "Educational Programs",
    "Environmental Initiatives",
    "Youth Programs",
  ];

  const handleInterestToggle = (interest: string) => {
    setFormData((prev) => ({
      ...prev,
      interests: prev.interests.includes(interest)
        ? prev.interests.filter((i) => i !== interest)
        : [...prev.interests, interest],
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!formData.name || !formData.email || !formData.phone || !formData.address) {
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

    if (formData.interests.length === 0) {
      toast({
        title: "Select Interests",
        description: "Please select at least one area of interest.",
        variant: "destructive",
      });
      return;
    }

    // In a real app, this would send data to backend
    console.log("Membership Registration:", formData);

    toast({
      title: "Welcome to Kutumb!",
      description: "Your membership application has been submitted successfully. We'll contact you soon!",
    });

    // Reset form
    setFormData({
      name: "",
      email: "",
      phone: "",
      address: "",
      interests: [],
    });
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      
      <main className="flex-grow">
        {/* Hero Section */}
        <section className="gradient-warm text-white py-20">
          <div className="container mx-auto px-4 text-center">
            <h1 className="mb-6">Become a Member</h1>
            <p className="text-xl max-w-3xl mx-auto opacity-95">
              Join our growing community and be part of something meaningful. Membership is free and open to everyone who shares our values.
            </p>
          </div>
        </section>

        {/* Benefits Section */}
        <section className="py-20">
          <div className="container mx-auto px-4">
            <div className="text-center mb-12">
              <h2 className="mb-4">Membership Benefits</h2>
              <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                As a Kutumb member, you'll enjoy exclusive benefits and opportunities
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-6xl mx-auto mb-16">
              {benefits.map((benefit, index) => {
                const Icon = benefit.icon;
                return (
                  <Card key={index} className="text-center card-hover border-2">
                    <CardContent className="p-6">
                      <div className="w-16 h-16 bg-gradient-hero rounded-full flex items-center justify-center mx-auto mb-4">
                        <Icon className="w-8 h-8 text-white" />
                      </div>
                      <h3 className="text-lg font-bold mb-2">{benefit.title}</h3>
                      <p className="text-sm text-muted-foreground">{benefit.description}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        {/* Registration Form */}
        <section className="py-20 bg-muted/30">
          <div className="container mx-auto px-4">
            <div id="membership-form" className="max-w-3xl mx-auto">
              <Card className="border-2">
                <CardContent className="p-8 md:p-12">
                  <h2 className="mb-8 text-center">Membership Registration</h2>
                  
                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid md:grid-cols-2 gap-6">
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
                      <Label htmlFor="address">Address *</Label>
                      <Input
                        id="address"
                        value={formData.address}
                        onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                        placeholder="Street address, City, State, Postcode"
                        className="mt-2"
                      />
                    </div>

                    <div>
                      <Label className="mb-4 block">Areas of Interest *</Label>
                      <div className="grid md:grid-cols-2 gap-4">
                        {interestOptions.map((interest) => (
                          <div key={interest} className="flex items-center space-x-2">
                            <Checkbox
                              id={interest}
                              checked={formData.interests.includes(interest)}
                              onCheckedChange={() => handleInterestToggle(interest)}
                            />
                            <label
                              htmlFor={interest}
                              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                            >
                              {interest}
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="pt-4">
                      <Button type="submit" className="w-full btn-accent text-lg py-6">
                        Submit Application
                      </Button>
                    </div>

                    <p className="text-sm text-muted-foreground text-center pt-4">
                      By submitting this form, you agree to become a member of Kutumb and participate in our community activities.
                    </p>
                  </form>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Why Join Section */}
        <section className="py-20">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto text-center">
              <h2 className="mb-6">Why Join Kutumb?</h2>
              <div className="prose prose-lg max-w-none text-muted-foreground space-y-4">
                <p>
                  At Kutumb, we believe that every individual has the power to make a positive impact. By becoming a member, you're not just joining an organization – you're becoming part of a family dedicated to creating meaningful change in our community.
                </p>
                <p>
                  Whether you're interested in wellness activities like yoga, want to help serve those in need, or simply wish to connect with like-minded individuals, Kutumb provides a welcoming space for everyone.
                </p>
                <p className="text-primary font-semibold">
                  Membership is completely free. All we ask is your commitment to our shared values of compassion, community, and positive action.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default Membership;

