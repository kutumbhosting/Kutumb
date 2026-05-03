import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

interface Activity {
  title: string;
  image?: string;
  image1?: string;
  image2?: string;
  description: string;
  schedule: string;
  location?: string;
  onlineYoga?: string[];
  inPersonYoga?: string[];
  bhajanDetails?: string[];
  benefits: string[];
}

const Activities = () => {
  const [activities, setActivities] = useState<Activity[]>([]);

  useEffect(() => {
    fetch("/api/activities")
      .then((res) => res.json())
      .then((data) => setActivities(data))
      .catch((err) => console.error("Failed to load activities:", err));
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-grow">
        <section className="gradient-warm text-white py-20">
          <div className="container mx-auto px-4 text-center">
            <h1 className="mb-6">Our Regular Activities</h1>
            <p className="text-xl max-w-3xl mx-auto opacity-95">
              Engage with your community through activities that promote wellness,
              compassion, and social impact.
            </p>
          </div>
        </section>

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
                          src={`/activity-images/${activity.image1}`}
                          alt={activity.title}
                          className="w-full h-72 object-cover rounded-xl shadow-lg"
                        />
                      )}
                      {activity.image2 && (
                        <img
                          src={`/activity-images/${activity.image2}`}
                          alt={activity.title}
                          className="w-full h-72 object-cover rounded-xl shadow-lg"
                        />
                      )}
                      {!activity.image1 && activity.image && (
                        <img
                          src={`/activity-images/${activity.image}`}
                          alt={activity.title}
                          className="w-full h-80 object-cover rounded-xl shadow-lg"
                        />
                      )}
                    </div>
                  </div>

                  {/* Content */}
                  <div
                    className={
                      index % 2 === 1 ? "md:col-start-1 md:row-start-1" : ""
                    }
                  >
                    <Card className="border-2 h-full">
                      <CardContent className="p-8">
                        <h2 className="mb-4">{activity.title}</h2>
                        <p className="text-muted-foreground mb-6">
                          {activity.description}
                        </p>

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
