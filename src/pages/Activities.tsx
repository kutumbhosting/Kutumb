import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

import yogaImage from "@/data/activities/yoga.jpeg";
import onlineyogaImage from "@/data/activities/online-yoga.jpeg";
import foodImage from "@/data/activities/food-service.jpeg";
import bhajanImage from "@/data/activities/bhajan.jpeg";
import menImage from "@/data/activities/menshed.jpeg";

const Activities = () => {
  const activities = [
    {
      title: "Kutumb Yoga",
      image1: yogaImage,
      image2: onlineyogaImage,
      description:
        "Regular yoga sessions promoting physical wellness, mental clarity, and strong community bonding. Suitable for all levels.",
      schedule:
        "Daily on Zoom (5:30 AM - 6:45 AM) + in-person sessions at parks.",

      onlineYoga: [
        "Regular Zoom yoga on all days catering for Australian and Indian yogis",
        "Over 250 members in WhatsApp Yoga Group",
        "Dedicated Australian yoga teachers from Kutumb family",
        "Under the guidance of Shri Arun Srivastav (Resident Expert & Yoga Guru)",
      ],

      inPersonYoga: [
        "Continuing summer in-person yoga in The Ponds and Kellyville North parks",
        "New location started at The Gables",
        "Run by dedicated and passionate yoga teachers",
        "Becoming very popular with locals",
      ],

      benefits: [
        "Improve flexibility and strength",
        "Reduce stress and anxiety",
        "Connect with like-minded individuals",
        "Free for all community members",
      ],
    },
    {
      title: "Kutumb Food Distribution",
      image: foodImage,
      description:
        "Our food distribution program serves nutritious meals to those in need within our community, like international students at Western Sydney University.",
      schedule: "Every Saturday, 12:00 PM - 3:00 PM",
      benefits: [
        "Support community members in need",
        "Reduce food waste",
        "Build compassion and empathy",
        "Make a tangible difference",
      ],
    },
    {
      title: "Kutumb Bhajan Sandhya",
      image: bhajanImage,
      description:
        "Monthly Bhajan Sandhya and special knowledge sessions bringing the community together in a spiritual and positive environment.",
      schedule: "First Saturday of every month, 7:00 PM - 10:00 PM",

      bhajanDetails: [
        "Organised at Kutumb members' houses on rotation",
        "Followed by shared food plates (bhojan prasad)",
      ],

      location: "Rotating locations",

      benefits: [
        "Promote Indian culture",
        "Promote mental health and well-being",
        "Meet spiritually inclined people",
        "Create positive impact in the community",
      ],
    },
    {
      title: "Kutumb Men Shed",
      image: menImage,
      description:
        "Organise Men shed activities like long walk, chit-chat sessions, movie night, clean-ups and indoor-outdoor games.",
      schedule: "Fortnightly on Saturdays, 4:00 PM - 9:00 PM",
      location: "Rotating locations",
      benefits: [
        "Promote men's mental health and well-being",
        "Promote bond among members",
        "Create positive impact in the community",
        "Brainstorming for community betterment",
      ],
    },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-grow">
        {/* Hero */}
        <section className="gradient-warm text-white py-20">
          <div className="container mx-auto px-4 text-center">
            <h1 className="mb-6">Our Regular Activities</h1>
            <p className="text-xl max-w-3xl mx-auto opacity-95">
              Engage with your community through activities that promote wellness,
              compassion, and social impact.
            </p>
          </div>
        </section>

        {/* Activities */}
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
                  {/* Image Section */}
                  <div className={index % 2 === 1 ? "md:col-start-2" : ""}>
                    <div className="flex flex-col gap-4">
                      {activity.image1 && (
                        <img
                          src={activity.image1}
                          alt={activity.title}
                          className="w-full h-72 object-cover rounded-xl shadow-lg"
                        />
                      )}

                      {activity.image2 && (
                        <img
                          src={activity.image2}
                          alt={activity.title}
                          className="w-full h-72 object-cover rounded-xl shadow-lg"
                        />
                      )}

                      {!activity.image1 && activity.image && (
                        <img
                          src={activity.image}
                          alt={activity.title}
                          className="w-full h-80 object-cover rounded-xl shadow-lg"
                        />
                      )}
                    </div>
                  </div>

                  {/* Content */}
                  <div
                    className={
                      index % 2 === 1
                        ? "md:col-start-1 md:row-start-1"
                        : ""
                    }
                  >
                    <Card className="border-2 h-full">
                      <CardContent className="p-8">
                        <h2 className="mb-4">{activity.title}</h2>
                        <p className="text-muted-foreground mb-6">
                          {activity.description}
                        </p>

                        {/* Schedule */}
                        <div className="space-y-4 mb-6 p-4 bg-muted/50 rounded-lg">
                          <div>
                            <span className="font-semibold text-primary">
                              Schedule:{" "}
                            </span>
                            {activity.schedule}
                          </div>

                          {activity.onlineYoga && (
                            <ul className="text-sm">
                              {activity.onlineYoga.map((item, i) => (
                                <li key={i}>✓ {item}</li>
                              ))}
                            </ul>
                          )}

                          {activity.inPersonYoga && (
                            <ul className="text-sm">
                              {activity.inPersonYoga.map((item, i) => (
                                <li key={i}>✓ {item}</li>
                              ))}
                            </ul>
                          )}

                          {activity.bhajanDetails && (
                            <ul className="text-sm">
                              {activity.bhajanDetails.map((item, i) => (
                                <li key={i}>✓ {item}</li>
                              ))}
                            </ul>
                          )}

                          {activity.location && (
                            <div>
                              <span className="font-semibold text-primary">
                                Location:{" "}
                              </span>
                              {activity.location}
                            </div>
                          )}
                        </div>

                        {/* Benefits */}
                        <ul className="mb-6 text-sm">
                          {activity.benefits.map((b, i) => (
                            <li key={i}>✓ {b}</li>
                          ))}
                        </ul>

                        <Link to="/events">
                          <Button className="w-full">
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
      </main>

      <Footer />
    </div>
  );
};

export default Activities;
