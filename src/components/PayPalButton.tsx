import { useEffect, useRef, useState } from "react";

interface PayPalButtonProps {
  /** Which kind of thing is being paid for — picks the right backend endpoint. */
  kind?: "registration" | "donation";
  registrationId?: number;
  donationId?: number;
  onSuccess: () => void;
  onError: (message: string) => void;
}

declare global {
  interface Window {
    paypal?: any;
  }
}

// Loads PayPal's JS SDK on demand (never bundled — most events won't use
// PayPal) and renders its Smart Buttons. Approval alone never confirms
// payment: onApprove calls our server's capture endpoint, and only that
// server-to-PayPal call — not the browser — decides whether the
// registration gets marked paid.
export default function PayPalButton({ kind = "registration", registrationId, donationId, onSuccess, onError }: PayPalButtonProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const targetId = kind === "donation" ? donationId : registrationId;
  const createOrderPath = kind === "donation" ? `/api/paypal/donations/${targetId}/create-order` : `/api/paypal/${targetId}/create-order`;

  useEffect(() => {
    let cancelled = false;

    const render = (paypal: any) => {
      if (cancelled || !containerRef.current) return;
      containerRef.current.innerHTML = "";
      paypal
        .Buttons({
          style: { layout: "vertical", label: "pay" },
          createOrder: async () => {
            const res = await fetch(createOrderPath, { method: "POST" });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || "Could not start PayPal checkout");
            return data.orderId;
          },
          onApprove: async (data: { orderID: string }) => {
            const res = await fetch(`/api/paypal/orders/${data.orderID}/capture`, { method: "POST" });
            const result = await res.json();
            if (!res.ok) throw new Error(result.message || "PayPal payment could not be completed");
            onSuccess();
          },
          onError: (err: any) => {
            onError(typeof err === "string" ? err : err?.message || "PayPal checkout failed");
          },
        })
        .render(containerRef.current);
      setLoading(false);
    };

    (async () => {
      try {
        const configRes = await fetch("/api/paypal/config");
        const config = await configRes.json();
        if (!config.clientId) {
          if (!cancelled) {
            setUnavailable(true);
            setLoading(false);
          }
          return;
        }

        if (window.paypal) {
          render(window.paypal);
          return;
        }

        const existing = document.getElementById("paypal-sdk-script");
        if (existing) {
          existing.addEventListener("load", () => window.paypal && render(window.paypal));
          return;
        }

        const script = document.createElement("script");
        script.id = "paypal-sdk-script";
        script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(config.clientId)}&currency=AUD`;
        script.onload = () => window.paypal && render(window.paypal);
        script.onerror = () => {
          if (!cancelled) {
            setUnavailable(true);
            setLoading(false);
          }
        };
        document.body.appendChild(script);
      } catch {
        if (!cancelled) {
          setUnavailable(true);
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetId, kind]);

  if (unavailable) {
    return <p className="text-xs text-muted-foreground">PayPal isn't available right now.</p>;
  }

  return (
    <div>
      {loading && <p className="text-xs text-muted-foreground">Loading PayPal...</p>}
      <div ref={containerRef} />
    </div>
  );
}
