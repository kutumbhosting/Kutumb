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
    req.admin = jwt.verify(token, getSecret());
    next();
  } catch {
    return res.status(401).json({ message: "Admin session expired — please log in again" });
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
