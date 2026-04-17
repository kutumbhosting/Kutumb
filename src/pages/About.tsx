import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Target, Eye, Heart, Users } from "lucide-react";

const About = () => {
  const values = [
    {
      icon: Heart,
      title: "Compassion",
      description: "We believe in treating everyone with kindness, empathy, and respect.",
    },
    {
      icon: Users,
      title: "Community",
      description: "Together we are stronger. We foster connections and build lasting relationships.",
    },
    {
      icon: Target,
      title: "Impact",
      description: "We are committed to creating measurable, positive change in our community.",
    },
    {
      icon: Eye,
      title: "Transparency",
      description: "We operate with honesty, integrity, and accountability in all we do.",
    },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      
      <main className="flex-grow">
        {/* Hero Section */}
        <section className="gradient-hero text-white py-20">
          <div className="container mx-auto px-4 text-center">
            <h1 className="mb-6">About Kutumb</h1>
            <p className="text-xl max-w-3xl mx-auto opacity-95">
              A registered non-profit community organization in NSW, Australia, dedicated to building stronger communities through compassionate service and meaningful engagement.
            </p>
          </div>
        </section>

        {/* Our Story */}
        <section className="py-20">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto">
              <h2 className="mb-8 text-center">Our Story</h2>
              <div className="prose prose-lg max-w-none text-muted-foreground space-y-6">
                <p>
                  Kutumb was founded with a simple yet powerful vision: to create a community where everyone feels valued, supported, and empowered to make a positive difference. Registered with NSW Fair Trading as a non-profit organization, we are committed to serving our community with integrity and compassion.
                </p>
                <p>
                  What started as a small group of passionate individuals has grown into a thriving community of members who share our values and dedication to social impact. Through our various programs and initiatives, we've touched the lives of hundreds of community members and continue to expand our reach.
                </p>
                <p>
                  Our name, "Kutumb," reflects our core belief in the power of family and community. We strive to create an environment where everyone feels they belong, where differences are celebrated, and where collective action leads to meaningful change.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Mission & Vision */}
        <section className="py-20 bg-muted/30">
          <div className="container mx-auto px-4">
            <div className="grid md:grid-cols-2 gap-12 max-w-6xl mx-auto">
              <Card className="border-2 border-primary/20">
                <CardContent className="p-8">
                  <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-6">
                    <Target className="w-8 h-8 text-primary" />
                  </div>
                  <h2 className="mb-4">Our Mission</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    To bring people together through compassionate service, wellness activities, and community engagement programs that foster meaningful connections and create lasting positive change in our society.
                  </p>
                </CardContent>
              </Card>

              <Card className="border-2 border-secondary/20">
                <CardContent className="p-8">
                  <div className="w-16 h-16 bg-secondary/10 rounded-full flex items-center justify-center mb-6">
                    <Eye className="w-8 h-8 text-secondary" />
                  </div>
                  <h2 className="mb-4">Our Vision</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    A thriving, inclusive community where every individual feels valued, supported, and empowered to contribute to the collective wellbeing of society through active participation and compassionate action.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Core Values */}
        <section className="py-20">
          <div className="container mx-auto px-4">
            <div className="text-center mb-12">
              <h2 className="mb-4">Our Core Values</h2>
              <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                These principles guide everything we do and shape the culture of our community
              </p>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-6xl mx-auto">
              {values.map((value, index) => {
                const Icon = value.icon;
                return (
                  <Card key={index} className="text-center card-hover">
                    <CardContent className="p-6">
                      <div className="w-16 h-16 bg-gradient-hero rounded-full flex items-center justify-center mx-auto mb-4">
                        <Icon className="w-8 h-8 text-white" />
                      </div>
                      <h3 className="text-xl font-bold mb-3">{value.title}</h3>
                      <p className="text-muted-foreground">{value.description}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        {/* Registration Info */}
        <section className="py-20 bg-muted/30">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto">
              <Card className="border-2">
                <CardContent className="p-8 md:p-12">
                  <h2 className="mb-6 text-center">Official Registration</h2>
                  <div className="text-center space-y-4 text-muted-foreground">
                    <p className="text-lg">
                      Kutumb is a registered non-profit community organization with{" "}
                      <span className="font-semibold text-primary">NSW Fair Trading</span>
                    </p>
                    <p>
                      We operate with full transparency and accountability, ensuring that all our activities and programs serve the best interests of our community members and the wider society.
                    </p>
                    <p className="text-sm pt-4 border-t">
                      <strong>Location:</strong> New South Wales, Australia
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default About;
