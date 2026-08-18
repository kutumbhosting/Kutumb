import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TabsContent } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Calendar, MapPin, Users, Clock, Sparkles } from "lucide-react";

// Key used to stash the in-progress registration form while the registrant
// pops over to the Membership page, so we can restore it on return.
export const EVENT_REGISTRATION_DRAFT_KEY = "kutumb_event_registration_draft";

interface FormData {
  eventName: string;
  eventDate: string;
  name: string;
  email: string;
  phone: string;
  comments: string;
  adults: number;
  children: number;
}

interface UpcomingEventsProps {
  upcomingEvents: any[];
  formData: FormData;
  setFormData: React.Dispatch<React.SetStateAction<FormData>>;
  submitMessage: string;
  handleSubmit: (e: React.FormEvent) => Promise<void>;
}

const UpcomingEvents = ({
  upcomingEvents,
  formData,
  setFormData,
  submitMessage,
  handleSubmit,
}: UpcomingEventsProps) => {
  const navigate = useNavigate();

  // ── Live membership lookup as the registrant fills in name + email ───────
  const [membershipNumber, setMembershipNumber] = useState<string | null>(null);
  const [checkingMembership, setCheckingMembership] = useState(false);

  useEffect(() => {
    const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email);
    if (!formData.name.trim() || !emailValid) {
      setMembershipNumber(null);
      return;
    }

    const timer = setTimeout(async () => {
      setCheckingMembership(true);
      try {
        const res = await fetch(
          `/api/members/lookup?name=${encodeURIComponent(formData.name)}&email=${encodeURIComponent(formData.email)}`
        );
        const data = await res.json();
        setMembershipNumber(data.found ? data.membershipNumber : null);
      } catch {
        setMembershipNumber(null);
      } finally {
        setCheckingMembership(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [formData.name, formData.email]);

  // ── Applicable fee for the currently selected event ───────────────────────
  const selectedEvent = (Array.isArray(upcomingEvents) ? upcomingEvents : []).find(
    (e) => e.title === formData.eventName
  );
  const isMember = !!membershipNumber;
  const perPersonFee = selectedEvent
    ? Number(isMember ? selectedEvent.memberFee : selectedEvent.nonMemberFee) || 0
    : null;
  const totalAttendees = 1 + (Number(formData.adults) || 0) + (Number(formData.children) || 0);
  const totalFee = perPersonFee !== null ? perPersonFee * totalAttendees : null;

  // ── Member pricing preview, shown to non-members to encourage sign-up ────
  const memberPerPersonFee = selectedEvent ? Number(selectedEvent.memberFee) || 0 : null;
  const memberTotalFee = memberPerPersonFee !== null ? memberPerPersonFee * totalAttendees : null;
  const memberSavesMoney =
    !isMember &&
    memberPerPersonFee !== null &&
    perPersonFee !== null &&
    memberPerPersonFee < perPersonFee;

  // ── Send the registrant to the Membership page, preserving this form ─────
  const handleBecomeMember = () => {
    try {
      sessionStorage.setItem(EVENT_REGISTRATION_DRAFT_KEY, JSON.stringify(formData));
    } catch {
      // sessionStorage unavailable — worst case the form just won't restore
    }

    navigate("/membership", {
      state: {
        scrollTo: "membership",
        returnTo: "/events",
        prefill: {
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
        },
      },
    });
  };

  return (
    <TabsContent value="upcoming" className="space-y-12">
      <div className="grid md:grid-cols-2 gap-8">
        {(Array.isArray(upcomingEvents) ? upcomingEvents : [])
          .filter((event) => event.isActive)
          .map((event, index) => {
            const hasFlyer = !!event.flyerImage;

            return (
              <Card key={index} className="card-hover border border-border">
                <CardContent className="p-6">
                  <div className={`grid gap-6 ${hasFlyer ? "md:grid-cols-2" : ""}`}>

                    {/* LEFT */}
                    <div>
                      <h3 className="text-xl font-bold mb-4">{event.title}</h3>

                      <div className="space-y-3 mb-6">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Calendar size={18} className="text-primary" />
                          <span>{event.date}</span>
                        </div>

                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Clock size={18} className="text-primary" />
                          <span>{event.time}</span>
                        </div>

                        <div className="flex items-center gap-2 text-muted-foreground">
                          <MapPin size={18} className="text-primary" />
                          <span>{event.location}</span>
                        </div>

                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Users size={18} className="text-primary" />
                          <span> {event.availableSpots} / {event.capacity} spots available</span>
                        </div>
                      </div>

                      <p className="text-muted-foreground">
                        {event.description}
                      </p>
                    </div>

                    {/* RIGHT (IMAGE) */}
                    {hasFlyer && (
                      <div className="flex justify-center items-start">
                        <img
                          src={`/api/media/${event.flyerImage}`}
                          alt={event.title}
                          className="rounded-lg shadow-md max-h-[350px] object-contain"
                        />
                      </div>
                    )}

                    {/* ✅ BUTTON → FULL WIDTH (SPANS BOTH COLUMNS) */}
                    <div className={hasFlyer ? "md:col-span-2" : ""}>
                      <Button
                        className="w-full btn-hero mt-4"
                        onClick={() => {
                          setFormData({
                            eventName: event.title,
                            eventDate: event.date,
                            name: "",
                            email: "",
                            phone: "",
                            comments: "",
                            adults: 0,
                            children: 0,
                          });

                          setTimeout(() => {
                            document
                              .getElementById("registration-form")
                              ?.scrollIntoView({ behavior: "smooth" });
                          }, 0);
                        }}
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

      <div
        id="registration-form"
        className="max-w-2xl mx-auto mt-16 scroll-mt-24"
      >
        <Card className="border border-border">
          <CardContent className="p-8">
            <h2 className="mb-6 text-center">Event Registration</h2>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <Label htmlFor="event">Event Name *</Label>
                <Input
                  id="event"
                  value={formData.eventName}
                  placeholder="Enter event name"
                  readOnly
                  className="mt-2 bg-muted"
                />
              </div>

              <div>
                <Label htmlFor="event">Event Date *</Label>
                <Input
                  id="date"
                  value={formData.eventDate}
                  placeholder="Enter event date"
                  readOnly
                  className="mt-2 bg-muted"
                />
              </div>

              <div>
                <Label htmlFor="name">Full Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="Enter your full name"
                  className="mt-2"
                />
              </div>

              <div>
                <Label htmlFor="email">Email Address *</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  placeholder="your.email@example.com"
                  className="mt-2"
                />
              </div>

              <div>
                <Label htmlFor="phone">Phone Number *</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) =>
                    setFormData({ ...formData, phone: e.target.value })
                  }
                  placeholder="+61 XXX XXX XXX"
                  className="mt-2"
                />
              </div>

              {/* Live membership lookup */}
              <div className="rounded-lg bg-muted/50 px-4 py-3 text-sm">
                {checkingMembership ? (
                  <span className="text-muted-foreground">Checking membership…</span>
                ) : membershipNumber ? (
                  <span>
                    Kutumb Membership Number: <strong>{membershipNumber}</strong>
                  </span>
                ) : (
                  <span className="text-muted-foreground">
                    Enter your name and email above to check your Kutumb membership status.
                  </span>
                )}
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="adults">Number of Additional Adults *</Label>
                  <Input
                    id="adults"
                    type="number"
                    min="0"
                    value={formData.adults}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        adults: Number(e.target.value),
                      })
                    }
                    className="mt-2"
                  />
                </div>

                <div>
                  <Label htmlFor="children">Children (Under 12)</Label>
                  <Input
                    id="children"
                    type="number"
                    min="0"
                    value={formData.children}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        children: Number(e.target.value),
                      })
                    }
                    className="mt-2"
                  />
                </div>
              </div>

              {/* Total registration fee, based on membership status and attendee count */}
              {selectedEvent && (selectedEvent.memberFee > 0 || selectedEvent.nonMemberFee > 0) && (
                <div className="rounded-lg border-2 border-orange-200 bg-orange-50 px-4 py-3 text-sm space-y-1">
                  <p className="font-semibold text-orange-800">Registration Fee</p>
                  <p>
                    {isMember ? "Member fee" : "Non-member fee"}: <strong>${perPersonFee}</strong> per person
                    &times; {totalAttendees} {totalAttendees === 1 ? "attendee" : "attendees"}
                  </p>
                  <p className="text-base">
                    Total: <strong>{totalFee && totalFee > 0 ? `$${totalFee}` : "Free"}</strong>
                  </p>

                  {!isMember && (
                    <div className="mt-3 pt-3 border-t border-orange-200">
                      <p className="text-orange-700">
                        {memberSavesMoney ? (
                          <>
                            Kutumb members pay just{" "}
                            <strong>${memberPerPersonFee}</strong> per person for this event
                            {memberTotalFee !== null && (
                              <>
                                {" "}
                                — <strong>
                                  {memberTotalFee > 0 ? `$${memberTotalFee}` : "Free"}
                                </strong>{" "}
                                total for {totalAttendees}{" "}
                                {totalAttendees === 1 ? "attendee" : "attendees"}
                              </>
                            )}
                            .
                          </>
                        ) : (
                          <>Kutumb membership is free and unlocks member pricing on future events.</>
                        )}
                      </p>
                      <button
                        type="button"
                        onClick={handleBecomeMember}
                        className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-primary underline underline-offset-2 hover:text-primary/80"
                      >
                        <Sparkles size={14} />
                        Join Kutumb for free {memberSavesMoney ? "to unlock this rate." : "."}
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div>
                <Label htmlFor="comments">Additional Comments</Label>
                <Textarea
                  id="comments"
                  value={formData.comments}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      comments: e.target.value,
                    })
                  }
                  placeholder="Any special requirements or questions?"
                  className="mt-2 min-h-24"
                />
              </div>

              <Button
                type="submit"
                className="w-full btn-hero text-lg py-6"
              >
                Submit Registration
              </Button>

              {submitMessage && (
                <p
                  className={`mt-4 text-center text-sm ${
                    submitMessage === "Registration successful!"
                      ? "text-green-600"
                      : "text-red-600"
                  }`}
                >
                  {submitMessage}
                </p>
              )}
            </form>
          </CardContent>
        </Card>
      </div>
    </TabsContent>
  );
};

export default UpcomingEvents;

