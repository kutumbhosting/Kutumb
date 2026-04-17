import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import yogaImage from "@/assets/activity-yoga.jpg";
import foodServiceImage from "@/assets/activity-food-service.jpg";
import communityServiceImage from "@/assets/activity-community-service.jpg";

const Activities = () => {
  const activities = [
    {
      title: "Community Yoga",
      image: yogaImage,
      description: "Join our regular yoga sessions designed to promote physical wellness, mental clarity, and community bonding. Suitable for all levels, from beginners to advanced practitioners.",
      schedule: "Every Sunday, 8:00 AM - 9:30 AM",
      location: "Community Park, Sydney",
      benefits: [
        "Improve flexibility and strength",
        "Reduce stress and anxiety",
        "Connect with like-minded individuals",
        "Free for all community members",
      ],
    },
    {
      title: "Food Service",
      image: foodServiceImage,
      description: "Our food distribution program serves nutritious meals to those in need within our community. Volunteers prepare and distribute meals with love and compassion.",
      schedule: "Every Saturday, 12:00 PM - 3:00 PM",
      location: "Various locations across Sydney",
      benefits: [
        "Support community members in need",
        "Reduce food waste",
        "Build compassion and empathy",
        "Make a tangible difference",
      ],
    },
    {
      title: "Community Service",
      image: communityServiceImage,
      description: "Participate in various community improvement projects including park clean-ups, tree planting, and neighborhood beautification initiatives.",
      schedule: "First Saturday of every month, 9:00 AM - 12:00 PM",
      location: "Rotating locations",
      benefits: [
        "Beautify our neighborhoods",
        "Promote environmental sustainability",
        "Meet new people",
        "Create visible positive impact",
      ],
    },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      
      <main className="flex-grow">
        {/* Hero Section */}
        <section className="gradient-warm text-white py-20">
          <div className="container mx-auto px-4 text-center">
            <h1 className="mb-6">Our Activities</h1>
            <p className="text-xl max-w-3xl mx-auto opacity-95">
              Engage with your community through our diverse range of activities designed to promote wellness, compassion, and positive social impact.
            </p>
          </div>
        </section>

        {/* Activities List */}
        <section className="py-20">
          <div className="container mx-auto px-4">
            <div className="space-y-16 max-w-6xl mx-auto">
              {activities.map((activity, index) => (
                <div
                  key={index}
                  className={`grid md:grid-cols-2 gap-8 items-center ${
                    index % 2 === 1 ? "md:grid-flow-dense" : ""
                  }`}
                >
                  {/* Image */}
                  <div className={index % 2 === 1 ? "md:col-start-2" : ""}>
                    <div className="rounded-xl overflow-hidden shadow-lg hover:shadow-xl transition-shadow">
                      <img
                        src={activity.image}
                        alt={activity.title}
                        className="w-full h-80 object-cover"
                      />
                    </div>
                  </div>

                  {/* Content */}
                  <div className={index % 2 === 1 ? "md:col-start-1 md:row-start-1" : ""}>
                    <Card className="border-2 h-full">
                      <CardContent className="p-8">
                        <h2 className="mb-4">{activity.title}</h2>
                        <p className="text-muted-foreground mb-6 leading-relaxed">
                          {activity.description}
                        </p>

                        {/* Schedule Info */}
                        <div className="space-y-3 mb-6 p-4 bg-muted/50 rounded-lg">
                          <div>
                            <span className="font-semibold text-primary">Schedule: </span>
                            <span className="text-muted-foreground">{activity.schedule}</span>
                          </div>
                          <div>
                            <span className="font-semibold text-primary">Location: </span>
                            <span className="text-muted-foreground">{activity.location}</span>
                          </div>
                        </div>

                        {/* Benefits */}
                        <div className="mb-6">
                          <h4 className="font-semibold mb-3">Benefits:</h4>
                          <ul className="space-y-2">
                            {activity.benefits.map((benefit, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                                <span className="text-secondary text-lg">✓</span>
                                {benefit}
                              </li>
                            ))}
                          </ul>
                        </div>

                        <Link to="/events">
                          <Button className="w-full bg-primary hover:bg-primary/90">
                            Register for Upcoming Session
                          </Button>
                        </Link>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20 bg-muted/30">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto text-center">
              <h2 className="mb-6">Ready to Participate?</h2>
              <p className="text-lg text-muted-foreground mb-8">
                All our activities are open to community members. Join us and be part of something meaningful.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link to="/membership">
                  <Button size="lg" className="bg-primary hover:bg-primary/90 px-10">
                    Become a Member
                  </Button>
                </Link>
                <Link to="/events">
                  <Button size="lg" variant="outline" className="px-10">
                    View Event Schedule
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default Activities;
