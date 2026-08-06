import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

// Stripe's Embedded Checkout navigates the browser HERE once payment
// completes (it's a real page load, not just closing the modal — that's
// how Embedded Checkout is designed to work). We look up the payment
// status by session_id and show a simple confirmation.
export default function CheckoutReturn() {
  const [params] = useSearchParams();
  const sessionId = params.get("session_id");
  const [status, setStatus] = useState<"loading" | "paid" | "pending" | "error">("loading");
  const [orderId, setOrderId] = useState<number | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setStatus("error");
      return;
    }
    fetch(`/api/ticketing/session-status?session_id=${encodeURIComponent(sessionId)}`)
      .then((r) => r.json())
      .then((data) => {
        setOrderId(data.orderId || null);
        setStatus(data.status === "paid" ? "paid" : "pending");
      })
      .catch(() => setStatus("error"));
  }, [sessionId]);

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 container mx-auto px-4 py-20 text-center">
        {status === "loading" && <p className="text-muted-foreground">Checking your payment...</p>}

        {status === "paid" && (
          <>
            <h1 className="text-3xl font-extrabold mb-2">🎉 Payment confirmed!</h1>
            <p className="text-muted-foreground mb-6">
              {orderId ? `Order #${orderId} is confirmed.` : "Your tickets are confirmed."} A confirmation has been recorded.
            </p>
          </>
        )}

        {status === "pending" && (
          <>
            <h1 className="text-2xl font-bold mb-2">Almost there...</h1>
            <p className="text-muted-foreground mb-6">
              We're still waiting for final confirmation from Stripe. This is usually instant — refresh in a few seconds if it doesn't update.
            </p>
          </>
        )}

        {status === "error" && (
          <>
            <h1 className="text-2xl font-bold mb-2">Something went wrong</h1>
            <p className="text-muted-foreground mb-6">We couldn't find that payment session. If you were charged, please contact us.</p>
          </>
        )}

        <Link to="/events" className="text-primary hover:underline">Back to Events</Link>
      </main>
      <Footer />
    </div>
  );
}
