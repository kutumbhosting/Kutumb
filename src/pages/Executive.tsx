import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Phone, Mail } from "lucide-react";

const Executive = () => {
  const team = [
    {
      name: "Rajesh Kumar",
      role: "President",
      phone: "+61 412 345 678",
      email: "rajesh@kutumb.org.au",
      bio: "Passionate community leader with over 10 years of experience in social impact initiatives. Dedicated to building inclusive communities and fostering positive change.",
      imageInitials: "RK",
    },
    {
      name: "Priya Sharma",
      role: "Vice President",
      phone: "+61 423 456 789",
      email: "priya@kutumb.org.au",
      bio: "Experienced nonprofit professional committed to community wellness and engagement. Specializes in program development and volunteer coordination.",
      imageInitials: "PS",
    },
    {
      name: "Amit Patel",
      role: "Secretary",
      phone: "+61 434 567 890",
      email: "amit@kutumb.org.au",
      bio: "Detail-oriented administrator with a passion for organization excellence. Ensures smooth operations and effective communication within the organization.",
      imageInitials: "AP",
    },
    {
      name: "Sunita Reddy",
      role: "Treasurer",
      phone: "+61 445 678 901",
      email: "sunita@kutumb.org.au",
      bio: "Financial professional dedicated to transparency and fiscal responsibility. Manages organizational finances with integrity and accountability.",
      imageInitials: "SR",
    },
    {
      name: "Vikram Singh",
      role: "Events Coordinator",
      phone: "+61 456 789 012",
      email: "vikram@kutumb.org.au",
      bio: "Creative event planner with expertise in community engagement. Designs and executes memorable events that bring people together.",
      imageInitials: "VS",
    },
    {
      name: "Anjali Mehta",
      role: "Membership Coordinator",
      phone: "+61 467 890 123",
      email: "anjali@kutumb.org.au",
      bio: "Warm and welcoming membership coordinator focused on building strong relationships. Ensures every member feels valued and connected.",
      imageInitials: "AM",
    },
  ];

  const getGradientClass = (index: number) => {
    const gradients = [
      "bg-gradient-to-br from-primary to-primary-dark",
      "bg-gradient-to-br from-secondary to-emerald-600",
      "bg-gradient-to-br from-accent to-orange-600",
      "bg-gradient-to-br from-purple-500 to-purple-700",
      "bg-gradient-to-br from-blue-500 to-blue-700",
      "bg-gradient-to-br from-pink-500 to-pink-700",
    ];
    return gradients[index % gradients.length];
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      
      <main className="flex-grow">
        {/* Hero Section */}
        <section className="gradient-hero text-white py-20">
          <div className="container mx-auto px-4 text-center">
            <h1 className="mb-6">Executive Team</h1>
            <p className="text-xl max-w-3xl mx-auto opacity-95">
              Meet the dedicated individuals who lead Kutumb with passion, integrity, and a commitment to community service.
            </p>
          </div>
        </section>

        {/* Team Grid */}
        <section className="py-20">
          <div className="container mx-auto px-4">
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-7xl mx-auto">
              {team.map((member, index) => (
                <Card key={index} className="card-hover border-2 overflow-hidden">
                  <CardContent className="p-0">
                    {/* Avatar */}
                    <div className={`h-48 flex items-center justify-center ${getGradientClass(index)}`}>
                      <div className="text-6xl font-bold text-white">
                        {member.imageInitials}
                      </div>
                    </div>
                    
                    {/* Info */}
                    <div className="p-6">
                      <h3 className="text-xl font-bold mb-1">{member.name}</h3>
                      <div className="text-primary font-semibold mb-4">{member.role}</div>
                      <p className="text-muted-foreground text-sm mb-6 leading-relaxed">
                        {member.bio}
                      </p>
                      
                      {/* Contact */}
                      <div className="space-y-2 pt-4 border-t">
                        <a
                          href={`tel:${member.phone}`}
                          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
                        >
                          <Phone size={16} className="text-primary" />
                          {member.phone}
                        </a>
                        <a
                          href={`mailto:${member.email}`}
                          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
                        >
                          <Mail size={16} className="text-primary" />
                          {member.email}
                        </a>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Join Team CTA */}
        <section className="py-20 bg-muted/30">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto text-center">
              <h2 className="mb-6">Want to Get Involved?</h2>
              <p className="text-lg text-muted-foreground mb-8">
                We're always looking for passionate individuals who want to make a difference in our community. If you're interested in joining our team or volunteering, we'd love to hear from you.
              </p>
              <a href="/contact">
                <button className="btn-hero">
                  Contact Us
                </button>
              </a>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default Executive;
