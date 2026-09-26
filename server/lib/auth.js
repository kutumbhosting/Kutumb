import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

function getSecret() {
  return process.env.JWT_SECRET || "dev-only-insecure-secret-change-me";
}

export async function hashPassword(pw) {
  return bcrypt.hash(pw, 10);
}
export async function comparePassword(pw, hash) {
  return bcrypt.compare(pw, hash);
}

export function signAdminToken(admin) {
  return jwt.sign(
    { id: admin.id, email: admin.email, name: admin.name, role: admin.role },
    getSecret(),
    { expiresIn: "12h" }
  );
}

// A temporary check-in code's session is deliberately much narrower than a
// real admin's: the token carries scope: "checkin_code" so requireAdmin
// (used by every other admin route) explicitly refuses it, and only the
// check-in routes (via requireAdminOrCheckinSession) accept it. It also
// never outlives the code itself - expiresIn is capped to whatever time is
// actually left until the code's own expiry, not a fixed window, so a
// captured token can't be replayed after the code has expired/been deleted.
export function signCheckinCodeToken({ eventName, eventYear, code, expiresAt }) {
  const secondsLeft = Math.max(60, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
  return jwt.sign(
    {
      email: "info@kutumb.org.au",
      name: `Check-in code — ${eventName}`,
      role: "checkin",
      scope: "checkin_code",
      checkinEventName: eventName,
      checkinEventYear: eventYear,
      checkinCode: code,
    },
    getSecret(),
    { expiresIn: secondsLeft }
  );
}

export const ADMIN_COOKIE_NAME = "kutumb_admin_token";

// Protects every admin-only route (the 24 pre-existing JSON-file admin
// endpoints in server.js, plus the new settings/ticketing/check-in routes).
//
// Reads the session from an httpOnly cookie set at login, not an
// Authorization header. That's deliberate: the existing admin pages
// (UpcomingEvents.tsx, EventRegistration.tsx, Members.tsx, PastEvents.tsx,
// FileManagement.tsx, ...) already make plain same-origin fetch() calls
// with no auth header, and browsers automatically attach cookies to
// same-origin requests — so protecting routes this way needed zero changes
// to any of those existing fetch call sites. A Bearer header is still
// accepted too, for any API-only usage outside the browser.
export function requireAdmin(req, res, next) {
  const header = req.headers.authorization || "";
  const headerToken = header.startsWith("Bearer ") ? header.slice(7) : null;
  const token = headerToken || req.cookies?.[ADMIN_COOKIE_NAME];
  if (!token) return res.status(401).json({ message: "Admin login required" });
  try {
    const decoded = jwt.verify(token, getSecret());
    // A temporary check-in code's session must never satisfy a plain
    // requireAdmin check — only the check-in routes accept it, via
    // requireAdminOrCheckinSession below. Every other admin endpoint in the
    // app (registrations, members, coupons, settings, ...) uses requireAdmin
    // directly and stays exactly as restrictive as before.
    if (decoded.scope === "checkin_code") {
      return res.status(403).json({ message: "This check-in code only grants access to the check-in scanner" });
    }
    req.admin = decoded;
    next();
  } catch {
    return res.status(401).json({ message: "Admin session expired — please log in again" });
  }
}

// Accepts a full admin session OR a temporary check-in code session. Used
// only by the check-in scan/attendee-list routes and by /admin-auth/me +
// /logout so the check-in page's own session check and log-out keep working
// for a code-based login too.
export function requireAdminOrCheckinSession(req, res, next) {
  const header = req.headers.authorization || "";
  const headerToken = header.startsWith("Bearer ") ? header.slice(7) : null;
  const token = headerToken || req.cookies?.[ADMIN_COOKIE_NAME];
  if (!token) return res.status(401).json({ message: "Login required" });
  try {
    req.admin = jwt.verify(token, getSecret());
    next();
  } catch {
    return res.status(401).json({ message: "Session expired — please log in again" });
  }
}

export function requireSuperAdmin(req, res, next) {
  requireAdmin(req, res, () => {
    if (req.admin.role !== "superadmin") {
      return res.status(403).json({ message: "Super admin access required" });
    }
    next();
  });
}
