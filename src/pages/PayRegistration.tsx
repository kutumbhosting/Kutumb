import { useEffect, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import RegistrationPaymentPanel, { type PreferredPaymentMethod } from "@/components/RegistrationPaymentPanel";
import { CheckCircle2, CreditCard } from "lucide-react";

interface RegistrationInfo {
  id: number;
  eventName: string;
  eventDate: string | null;
  eventYear: string;
  registrationNumber: string;
  name: string;
  email: string;
  adults: number;
  children: number;
  fee: number; // amount still owed
  totalFee: number;
  paymentStatus: string;
  registrationStatus: string;
}

// Landed on from the "Pay Now" link in the pending-payment registration
// email — lets someone finish paying for a registration without having to
// dig back through the site to find it, days after they originally
// submitted the form. Keyed by the registration's opaque pay_token (see
// GET /api/events/registration/by-token/:token), not a guessable numeric
// id, so the link works with no login but can't be used to browse to
// anyone else's registration.
const PREFERRED_METHODS: PreferredPaymentMethod[] = ["card", "paypal", "square", "bank"];

export default function PayRegistration() {
  const { token } = useParams<{ token: string }>();
  // The registration email links each payment option to /pay/:token?method=…
  // so the one the person clicked is shown first. Anything else is ignored.
  const [searchParams] = useSearchParams();
  const methodParam = searchParams.get("method");
  const preferredMethod = PREFERRED_METHODS.includes(methodParam as PreferredPaymentMethod)
    ? (methodParam as PreferredPaymentMethod)
    : null;
  const [status, setStatus] = useState<"loading" | "found" | "not-found" | "already-paid">("loading");
  const [registration, setRegistration] = useState<RegistrationInfo | null>(null);
  const [paid, setPaid] = useState(false);

  useEffect(() => {
    if (!token) {
      setStatus("not-found");
      return;
    }
    fetch(`/api/events/registration/by-token/${encodeURIComponent(token)}`)
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then((data: RegistrationInfo) => {
        setRegistration(data);
        setStatus(data.registrationStatus === "confirmed" ? "already-paid" : "found");
      })
      .catch(() => setStatus("not-found"));
  }, [token]);

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 container mx-auto px-4 py-16 max-w-lg">
        {status === "loading" && (
          <p className="text-center text-muted-foreground">Loading your registration...</p>
        )}

        {status === "not-found" && (
          <div className="text-center space-y-3">
            <h1 className="text-xl font-bold">We couldn't find that registration</h1>
            <p className="text-muted-foreground text-sm">
              This payment link may be incorrect, or the registration it points to no longer
              exists. If you think this is a mistake, please contact us.
            </p>
            <Link to="/events" className="text-primary hover:underline text-sm inline-block">
              Back to Events
            </Link>
          </div>
        )}

        {status === "already-paid" && registration && (
          <div className="text-center space-y-3">
            <CheckCircle2 className="w-10 h-10 text-green-600 mx-auto" />
            <h1 className="text-xl font-bold">Already paid — thank you!</h1>
            <p className="text-muted-foreground text-sm">
              Registration <strong>{registration.registrationNumber}</strong> for{" "}
              <strong>{registration.eventName}</strong> is already confirmed — there's nothing
              more to pay. If you're expecting your ticket(s), check your inbox (and spam
              folder) for a separate email with your QR code(s).
            </p>
            <Link to="/events" className="text-primary hover:underline text-sm inline-block">
              Back to Events
            </Link>
          </div>
        )}

        {status === "found" && registration && !paid && (
          <div className="space-y-6">
            <div className="text-center space-y-1">
              <CreditCard className="w-8 h-8 text-orange-600 mx-auto" />
              <h1 className="text-xl font-bold">Complete Your Payment</h1>
              <p className="text-muted-foreground text-sm">
                {registration.eventName}
                {registration.eventDate ? ` — ${registration.eventDate}` : ""}
              </p>
            </div>

            <div className="rounded-lg border bg-muted/40 p-4 space-y-1 text-sm">
              <p>
                <span className="font-medium">Registration Number:</span> {registration.registrationNumber}
              </p>
              <p>
                <span className="font-medium">Name:</span> {registration.name}
              </p>
              <p>
                <span className="font-medium">Amount Due:</span> ${registration.fee.toFixed(2)}
              </p>
            </div>

            <RegistrationPaymentPanel
              data={{
                id: registration.id,
                eventName: registration.eventName,
                eventDate: registration.eventDate || undefined,
                eventYear: registration.eventYear,
                email: registration.email,
                name: registration.name,
                fee: registration.fee,
                adults: registration.adults,
                children: registration.children,
              }}
              preferredMethod={preferredMethod}
              onPaid={() => setPaid(true)}
            />
          </div>
        )}

        {status === "found" && paid && (
          <div className="text-center space-y-3">
            <CheckCircle2 className="w-10 h-10 text-green-600 mx-auto" />
            <h1 className="text-xl font-bold">Payment confirmed! 🎉</h1>
            <p className="text-muted-foreground text-sm">
              Thank you — your registration is now confirmed. Your ticket(s), with a QR code for
              each person on this registration, will be emailed to you shortly.
            </p>
            <Link to="/events" className="text-primary hover:underline text-sm inline-block">
              Back to Events
            </Link>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
