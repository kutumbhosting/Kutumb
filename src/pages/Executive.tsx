import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Phone, Mail } from "lucide-react";

const Executive = () => {
  const team = [
    {
      name: "Seema Garg",
      role: "President",
      phone: "+61 432 716 406",
      email: "seema@kutumb.org.au",
      bio: "Passionate community leader with over 30 years of experience in social impact initiatives. Dedicated to building inclusive communities and fostering positive change.",
      image: "Seema.png",
    },
    {
      name: "Raj Garg",
      role: "Vice President",
      phone: "+61 411 766 170",
      email: "raj@kutumb.org.au",
      bio: "Experienced nonprofit professional committed to community wellness and engagement. Specializes in program development and volunteer coordination.",
      image: "Raj.png",
    },
    {
      name: "Ashok Gupta",
      role: "Company Secretary and Principal Officer",
      phone: "+61 412 830 048",
      email: "ashok@kutumb.org.au",
      bio: "Detail-oriented administrator with a passion for organization excellence. Ensures smooth operations and effective communication within the organization.",
      image: "Ashok.png",
    },
    {
      name: "Naresh Kumar",
      role: "Treasurer",
      phone: "+61 xxx xxx xxx",
      email: "naresh@kutumb.org.au",
      bio: "Financial professional dedicated to transparency and fiscal responsibility. Manages organizational finances with integrity and accountability.",
      image: "Naresh.png",
    },
    {
      name: "Suruchi Thapliyal",
      role: "Coordinator, Event Performance",
      phone: "+61 415 578 569",
      email: "suruchi@kutumb.org.au",
      bio: "Creative event planner with expertise in community engagement. Designs and executes memorable events that bring people together.",
      image: "Suruchi.png",
    },
    {
      name: "Anil Mishra",
      role: "Coordinator, Online Presence",
      phone: "+61 466 713 166",
      email: "anil@kutumb.org.au",
      bio: "A detail-oriented digital coordinator responsible for managing Kutumb's online presence across platforms, ensuring consistent branding, engagement, and community outreach through effective digital communication.",
      image: "Anil.png",
    },
    {
      name: "Dr Vikas Kesarvani",
      role: "Coordinator, Kutumb Men's Shed",
      phone: "+61 449 843 496",
      email: "vikash@kutumb.org.au",
      bio: "Responsible for coordinating Kutumb's Men's Shed activities, organizing events that promote connection, wellbeing, and peer support among men in the community.",
      image: "Vikas.png",
    },
    {
      name: "Anjali Gupta",
      role: "Committee Member",
      phone: "+61 425 366 592",
      email: "anjali@kutumb.org.au",
      bio: "Warm and welcoming membership coordinator focused on building strong relationships. Ensures every member feels valued and connected.",
      image: "Anjali.png",
    },
    {
      name: "Pramodh Rai",
      role: "Advisor",
      phone: "+61 431 471 879",
      email: "pramodh@kutumb.org.au",
      bio: "A highly experienced community leader and advisor with a strong background in social and cultural engagement. An active member of organisations such as the Indian Diaspora Council and Arya Samaj Association, bringing valuable insight and guidance to Kutumb's mission.",
      image: "Pramodh.png",
    },
  ];

  const getGradientClass = (index: number) => {
    const gradients = [
      "bg-gradient-hero",
      "bg-gradient-to-br from-primary/80 to-primary",
      "bg-gradient-to-br from-secondary/80 to-emerald-600",
      "bg-gradient-to-br from-accent/80 to-orange-600",
      "bg-gradient-to-br from-purple-500/80 to-purple-700",
      "bg-gradient-to-br from-blue-500/80 to-blue-700",
      "bg-gradient-to-br from-pink-500/80 to-pink-700",
    ];
    return gradients[index % gradients.length];
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-grow">
        <section className="gradient-warm text-white py-20">
          <div className="container mx-auto px-4 text-center">
            <h1 className="mb-6">Executive Team</h1>
            <p className="text-xl max-w-3xl mx-auto opacity-95">
              Meet the dedicated individuals who lead Kutumb with passion, integrity, and a commitment to community service.
            </p>
          </div>
        </section>

        <section className="py-20">
          <div className="container mx-auto px-4">
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-7xl mx-auto">
              {team.map((member, index) => (
                <Card key={index} className="card-hover border-2 overflow-hidden">
                  <CardContent className="p-0">

                    <div className={`h-48 flex items-center justify-center ${getGradientClass(index)}`}>
                      <img
                        src={`/team/${member.image}`}
                        alt={member.name}
                        className="w-40 h-40 object-cover rounded-full shadow-lg border-4 border-white"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    </div>

                    <div className="p-6">
                      <h3 className="text-xl font-bold mb-1">{member.name}</h3>
                      <div className="text-primary font-semibold mb-4">{member.role}</div>
                      <p className="text-muted-foreground text-sm mb-6 leading-relaxed">
                        {member.bio}
                      </p>
                      <div className="space-y-2 pt-4 border-t">
                        
                          href={`tel:${member.phone}`}
                          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
                        >
                          <Phone size={16} className="text-primary" />
                          {member.phone}
                        </a>
                        
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

        <section className="py-20 bg-muted/30">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto text-center">
              <h2 className="mb-6">Want to Get Involved?</h2>
              <p className="text-lg text-muted-foreground mb-8">
                We're always looking for passionate individuals who want to make a difference in our community.
              </p>
              <a href="/contact">
                <button className="btn-hero">Contact Us</button>
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


