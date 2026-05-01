import { Card, CardContent } from "@/components/ui/card";

const PastEvents = ({ events }: any) => {
  return (
    <div className="space-y-8">

      {events.map((event: any, index: number) => (
        <Card key={index}>
          <CardContent className="p-8">

            <div className="flex justify-between mb-4">
              <h3 className="text-2xl font-bold">{event.title}</h3>
              <span>{event.date}</span>
            </div>

            <p className="mb-6">{event.description}</p>

            {event.media && (
              <div className="flex gap-4 overflow-x-auto">
                {event.media.map((item: any, i: number) => (
                  <div key={i} className="min-w-[240px] h-44">
                    {item.type === "image" ? (
                      <img src={item.src} className="w-full h-full object-cover" />
                    ) : (
                      <video src={item.src} controls className="w-full h-full" />
                    )}
                  </div>
                ))}
              </div>
            )}

          </CardContent>
        </Card>
      ))}

    </div>
  );
};

export default PastEvents;