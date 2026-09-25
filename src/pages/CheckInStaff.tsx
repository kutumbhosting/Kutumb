import { useEffect, useRef, useState } from "react";

// ─── Kutumb Check-in — a deliberately tiny, single-purpose mobile page ─────
// Nothing here but: log in → point camera at ticket → big pass/fail banner.
// It reuses the exact same /api/admin-auth/* and /api/checkin/scan endpoints
// as the full Admin console (src/pages/admin/CheckIn.tsx) — this is just a
// stripped-down front door onto them for a volunteer standing at the door
// with a phone, so there's nothing else on screen to tap by mistake.
//
// Note on the login: on purpose, this page does NOT ship the door
// volunteer's email/password inside the code — anything in the JS bundle is
// visible to anyone who visits the page, so baking in real admin
// credentials would leak them to every visitor. Instead, type it in once;
// the phone's browser will offer to save it, so every login after the
// first is effectively one tap.

async function api(path: string, options: RequestInit = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers as any) },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err: any = new Error(data?.message || "Request failed");
    err.canOverride = !!data?.canOverride;
    throw err;
  }
  return data;
}

type Banner = { kind: "success" | "warning" | "error"; text: string } | null;

export default function CheckInStaff() {
  const [checkingSession, setCheckingSession] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [adminName, setAdminName] = useState("");
  const [loginData, setLoginData] = useState({ email: "", password: "" });
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  const [banner, setBanner] = useState<Banner>(null);
  const [count, setCount] = useState(0);
  const [cameraError, setCameraError] = useState("");
  const scannerRef = useRef<any>(null);
  const busyRef = useRef(false); // guards against firing two scans for the same frame burst
  const lastScanRef = useRef<{ token: string; at: number } | null>(null);
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Session check on load ────────────────────────────────────────────
  useEffect(() => {
    api("/api/admin-auth/me")
      .then((admin) => {
        setIsLoggedIn(true);
        setAdminName(admin.name || admin.email);
      })
      .catch(() => {})
      .finally(() => setCheckingSession(false));
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setLoggingIn(true);
    try {
      const data = await api("/api/admin-auth/login", {
        method: "POST",
        body: JSON.stringify({ email: loginData.email, password: loginData.password }),
      });
      setIsLoggedIn(true);
      setAdminName(data.admin?.name || data.admin?.email || "");
    } catch (err: any) {
      setLoginError(err.message || "Invalid email or password");
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await api("/api/admin-auth/logout", { method: "POST" }).catch(() => {});
    setIsLoggedIn(false);
    setLoginData({ email: "", password: "" });
    setBanner(null);
    setCount(0);
  };

  const showBanner = (b: Banner) => {
    if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
    setBanner(b);
    if (navigator.vibrate) navigator.vibrate(b?.kind === "success" ? 120 : [80, 60, 80]);
    // Auto-clear so the camera view (still scanning underneath) is visible
    // again for the next ticket without any tap needed.
    bannerTimerRef.current = setTimeout(() => setBanner(null), 2200);
  };

  const handleDecodedToken = async (token: string) => {
    if (busyRef.current) return;
    const now = Date.now();
    // A second read of the SAME code within 2s is almost always the camera
    // re-decoding the still-visible ticket, not a deliberate re-scan — so
    // ignore it. (The full admin console's 10s "type it twice to override"
    // rule doesn't belong here since this page never shows an override
    // control anyway.)
    if (lastScanRef.current?.token === token && now - lastScanRef.current.at < 2000) return;
    lastScanRef.current = { token, at: now };

    busyRef.current = true;
    try {
      const result = await api("/api/checkin/scan", { method: "POST", body: JSON.stringify({ qrToken: token }) });
      const name = result.attendee?.name || result.attendee?.email || "Attendee";
      showBanner({ kind: "success", text: `✅ Checked in\n${name}` });
      setCount((c) => c + 1);
    } catch (err: any) {
      if (err.canOverride || /already checked in/i.test(err.message || "")) {
        showBanner({ kind: "warning", text: `⚠️ Already checked in` });
      } else if (/no ticket|not found/i.test(err.message || "")) {
        showBanner({ kind: "error", text: `❌ Ticket not recognised` });
      } else {
        showBanner({ kind: "error", text: `❌ ${err.message || "Scan failed"}` });
      }
    } finally {
      // Small delay before accepting the next scan, so the same physical
      // ticket held in frame doesn't immediately re-trigger.
      setTimeout(() => { busyRef.current = false; }, 1500);
    }
  };

  // ── Camera: starts as soon as logged in, keeps running continuously ──
  useEffect(() => {
    if (!isLoggedIn) return;
    let cancelled = false;
    setCameraError("");

    (async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (cancelled) return;
        const scanner = new Html5Qrcode("staff-checkin-camera");
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: 260 },
          (decodedText: string) => handleDecodedToken(decodedText),
          () => {}
        );
      } catch (err: any) {
        if (!cancelled) setCameraError(err?.message || "Could not access the camera");
      }
    })();

    return () => {
      cancelled = true;
      const scanner = scannerRef.current;
      if (scanner) {
        scanner.stop().then(() => scanner.clear()).catch(() => {});
        scannerRef.current = null;
      }
    };
  }, [isLoggedIn]);

  // ── Render ──────────────────────────────────────────────────────────
  if (checkingSession) {
    return <div style={styles.centerScreen}>Loading…</div>;
  }

  if (!isLoggedIn) {
    return (
      <div style={styles.centerScreen}>
        <form onSubmit={handleLogin} style={styles.loginCard}>
          <h1 style={styles.title}>Kutumb Check-in</h1>
          <p style={styles.subtitle}>Sign in to start scanning tickets</p>
          <input
            style={styles.input}
            type="email"
            placeholder="Email"
            autoComplete="username"
            value={loginData.email}
            onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
            required
          />
          <input
            style={styles.input}
            type="password"
            placeholder="Password"
            autoComplete="current-password"
            value={loginData.password}
            onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
            required
          />
          {loginError && <p style={styles.errorText}>{loginError}</p>}
          <button type="submit" style={styles.primaryButton} disabled={loggingIn}>
            {loggingIn ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div style={styles.scanScreen}>
      <div style={styles.topBar}>
        <span style={styles.topBarText}>{adminName}</span>
        <span style={styles.topBarText}>Checked in: {count}</span>
        <button style={styles.logoutButton} onClick={handleLogout}>Log out</button>
      </div>

      <div style={styles.cameraWrap}>
        <div id="staff-checkin-camera" style={styles.cameraBox} />
        {!banner && (
          <p style={styles.hint}>Point the camera at the attendee's ticket QR code</p>
        )}
        {cameraError && (
          <p style={styles.errorText}>
            {cameraError}. Please allow camera access in your browser settings and reload this page.
          </p>
        )}
      </div>

      {banner && (
        <div
          style={{
            ...styles.banner,
            background: banner.kind === "success" ? "#16a34a" : banner.kind === "warning" ? "#d97706" : "#dc2626",
          }}
        >
          {banner.text.split("\n").map((line, i) => (
            <div key={i} style={i === 0 ? styles.bannerTitle : styles.bannerSubtitle}>{line}</div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  centerScreen: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#0f172a",
    padding: 16,
  },
  loginCard: {
    width: "100%",
    maxWidth: 360,
    background: "#fff",
    borderRadius: 16,
    padding: 28,
    display: "flex",
    flexDirection: "column",
    gap: 12,
    boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
  },
  title: { margin: 0, fontSize: 24, fontWeight: 800, textAlign: "center", color: "#1e293b" },
  subtitle: { margin: "0 0 8px", fontSize: 14, textAlign: "center", color: "#64748b" },
  input: {
    fontSize: 16,
    padding: "14px 16px",
    borderRadius: 10,
    border: "1px solid #cbd5e1",
    outline: "none",
  },
  primaryButton: {
    fontSize: 17,
    fontWeight: 700,
    padding: "14px 16px",
    borderRadius: 10,
    border: "none",
    background: "#ea580c",
    color: "#fff",
    cursor: "pointer",
    marginTop: 4,
  },
  errorText: { color: "#dc2626", fontSize: 13, textAlign: "center", margin: 0 },
  scanScreen: {
    minHeight: "100vh",
    background: "#0f172a",
    display: "flex",
    flexDirection: "column",
  },
  topBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    padding: "12px 16px",
    background: "#1e293b",
    color: "#fff",
    fontSize: 13,
  },
  topBarText: { opacity: 0.9, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  logoutButton: {
    background: "transparent",
    border: "1px solid rgba(255,255,255,0.4)",
    color: "#fff",
    borderRadius: 8,
    padding: "6px 12px",
    fontSize: 13,
    cursor: "pointer",
  },
  cameraWrap: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    gap: 12,
    position: "relative",
  },
  cameraBox: { width: "100%", maxWidth: 480, borderRadius: 12, overflow: "hidden" },
  hint: { color: "#cbd5e1", fontSize: 14, textAlign: "center" },
  banner: {
    position: "fixed",
    inset: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    color: "#fff",
    padding: 24,
    textAlign: "center",
  },
  bannerTitle: { fontSize: 32, fontWeight: 800 },
  bannerSubtitle: { fontSize: 22, fontWeight: 600, opacity: 0.95 },
};
