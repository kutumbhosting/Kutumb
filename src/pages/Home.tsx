import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Users, Heart, Calendar, TrendingUp } from "lucide-react";
import heroImage from "@/assets/hero-community.jpg";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const Home = () => {
  const stats = [
    { icon: Users, value: "500+", label: "Community Members" },
    { icon: Heart, value: "50+", label: "Events Organized" },
    { icon: Calendar, value: "100+", label: "Volunteer Hours" },
    { icon: TrendingUp, value: "Growing", label: "Social Impact" },
  ];

  const upcomingEvents = [
    {
      title: "Community Yoga Session",
      date: "October 20, 2025",
      description: "Join us for a peaceful morning yoga session in the park.",
    },
    {
      title: "Food Distribution Drive",
      date: "October 25, 2025",
      description: "Help us serve meals to those in need in our community.",
    },
    {
      title: "Community Clean-Up",
      date: "November 5, 2025",
      description: "Let's make our neighborhood cleaner and greener together.",
    },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      
      <main className="flex-grow">
        {/* Hero Section */}
        <section className="relative h-[600px] lg:h-[700px] flex items-center justify-center overflow-hidden gradient-warm">
          
          {/* Subtle Background Image */}
          <div
            className="absolute inset-0 bg-cover bg-center opacity-20"
            style={{ backgroundImage: `url(${heroImage})` }}
          />

          {/* Soft overlay for blending */}
          <div className="absolute inset-0 bg-gradient-to-r from-black/10 to-transparent" />

          <div className="container mx-auto px-4 relative z-10 text-center text-white">
            <h1 className="mb-6 animate-fade-in">
              Building Stronger Communities Together
            </h1>
            <p className="text-xl md:text-2xl mb-8 max-w-3xl mx-auto opacity-95">
              Kutumb is a registered non-profit organization dedicated to creating positive social impact through community engagement, compassion, and service.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/membership">
                <Button size="lg" className="btn-accent text-lg px-10 py-6">
                  Become a Member
                </Button>
              </Link>
              <Link to="/events">
                <Button
                  size="lg"
                  variant="outline"
                  className="text-lg px-10 py-6 bg-white/10 backdrop-blur-sm border-white text-white hover:bg-white hover:text-primary"
                >
                  View Events
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* Stats Section */}
        <section className="py-16 bg-muted/50">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
              {stats.map((stat, index) => {
                const Icon = stat.icon;
                return (
                  <div
                    key={index}
                    className="text-center p-6 bg-card rounded-xl shadow-md hover:shadow-lg transition-shadow"
                  >
                    <Icon className="w-12 h-12 mx-auto mb-4 text-primary" />
                    <div className="text-3xl font-bold text-primary mb-2">{stat.value}</div>
                    <div className="text-muted-foreground">{stat.label}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Mission Section */}
        <section className="py-20">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto text-center">
              <h2 className="mb-6">Our Mission</h2>
              <p className="text-lg text-muted-foreground leading-relaxed mb-8">
                At Kutumb, we believe in the power of community. Our mission is to bring people together,
                foster meaningful connections, and create lasting positive change through compassionate service,
                wellness activities, and community engagement programs.
              </p>
              <Link to="/about">
                <Button size="lg" variant="outline" className="text-primary border-primary hover:bg-primary hover:text-white">
                  Learn More About Us
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* Upcoming Events */}
        <section className="py-20 bg-muted/30">
          <div className="container mx-auto px-4">
            <div className="text-center mb-12">
              <h2 className="mb-4">Upcoming Events</h2>
              <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                Join us in our upcoming community events and make a difference
              </p>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
              {upcomingEvents.map((event, index) => (
                <Card key={index} className="card-hover border-2">
                  <CardContent className="p-6">
                    <div className="text-sm text-primary font-semibold mb-2">{event.date}</div>
                    <h3 className="text-xl font-bold mb-3">{event.title}</h3>
                    <p className="text-muted-foreground mb-4">{event.description}</p>
                    <Link to="/events">
                      <Button variant="outline" className="w-full">
                        Register Now
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              ))}
            </div>
            <div className="text-center mt-12">
              <Link to="/events">
                <Button size="lg" className="bg-primary hover:bg-primary/90">
                  View All Events
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20 bg-accent">
          <div className="container mx-auto px-4 text-center text-white">
            <h2 className="mb-6">Ready to Make a Difference?</h2>
            <p className="text-xl mb-8 max-w-2xl mx-auto opacity-95">
              Join our growing community of compassionate individuals dedicated to creating positive change
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/membership">
                <Button size="lg" className="bg-white text-primary hover:bg-white/90 px-10 py-6">
                  Join Kutumb Today
                </Button>
              </Link>
              <Link to="/contact">
                <Button size="lg" variant="outline" className="border-white text-white hover:bg-white/20 px-10 py-6">
                  Get in Touch
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default Home;
