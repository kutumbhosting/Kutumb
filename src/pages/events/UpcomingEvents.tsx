import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, MapPin, Users, Clock } from "lucide-react";

const UpcomingEvents = ({ upcomingEvents, setFormData }: any) => {
  return (
    <div className="grid md:grid-cols-2 gap-8">

      {upcomingEvents
        .filter((event: any) => event.isActive)
        .map((event: any, index: number) => {
          const hasFlyer = !!event.flyerImage;

          return (
            <Card key={index}>
              <CardContent className="p-6">

                <div className={`grid gap-6 ${hasFlyer ? "md:grid-cols-2" : ""}`}>

                  {/* LEFT */}
                  <div>
                    <h3 className="text-xl font-bold mb-4">{event.title}</h3>

                    <div className="space-y-3 mb-6">

                      <div className="flex items-center gap-2">
                        <Calendar size={18} />
                        <span>{event.date}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <Clock size={18} />
                        <span>{event.time}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <MapPin size={18} />
                        <span>{event.location}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <Users size={18} />
                        <span>
                          {event.availableSpots} / {event.capacity}
                        </span>
                      </div>

                    </div>

                    <p>{event.description}</p>
                  </div>

                  {/* RIGHT IMAGE */}
                  {hasFlyer && (
                    <div>
                      <img
                        src={`/eventflyer/${event.flyerImage}`}
                        className="rounded-lg max-h-[350px]"
                      />
                    </div>
                  )}

                  {/* BUTTON */}
                  <div className={hasFlyer ? "md:col-span-2" : ""}>
                    <Button
                      className="w-full mt-4"
                      onClick={() =>
                        setFormData({
                          eventName: event.title,
                          eventDate: event.date,
                          name: "",
                          email: "",
                          phone: "",
                          comments: "",
                          adults: 0,
                          children: 0,
                        })
                      }
                    >
                      Register for This Event
                    </Button>
                  </div>

                </div>
              </CardContent>
            </Card>
          );
        })}
    </div>
  );
};

export default UpcomingEvents;
