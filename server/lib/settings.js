import crypto from "crypto";
import { pool } from "../db/pool.js";

const ALGO = "aes-256-gcm";

function getKey() {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error("ENCRYPTION_KEY is missing from .env — required to store/read secret settings.");
  return crypto.createHash("sha256").update(raw).digest();
}

function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(String(text), "utf-8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}
function decrypt(payload) {
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf-8");
}

export const SETTINGS_SCHEMA = [
  { group: "Stripe", key: "stripe_publishable_key", label: "Stripe Publishable Key", secret: false },
  { group: "Stripe", key: "stripe_secret_key", label: "Stripe Secret Key", secret: true },
  { group: "Stripe", key: "stripe_webhook_secret", label: "Stripe Webhook Signing Secret", secret: true },
  { group: "Platform", key: "public_base_url", label: "Public Base URL", secret: false },
  // Toggle which payment methods registrants are offered on the event
  // registration success page. Bank transfer defaults on (it needs no
  // external setup); card defaults off until Stripe keys above are filled
  // in and an admin deliberately switches it on.
  { group: "Payment Methods", key: "payment_method_bank_transfer", label: "Bank Transfer", type: "boolean", default: "true" },
  { group: "Payment Methods", key: "payment_method_card", label: "Pay by Card (Stripe)", type: "boolean", default: "false" },
];

export async function getSetting(key) {
  const { rows } = await pool.query("SELECT value, is_secret FROM kutumb_platform_settings WHERE key = $1", [key]);
  if (rows.length === 0 || rows[0].value == null) return null;
  return rows[0].is_secret ? decrypt(rows[0].value) : rows[0].value;
}

export async function getAllSettingsForAdmin() {
  const { rows } = await pool.query("SELECT key, value, is_secret, updated_at FROM kutumb_platform_settings");
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
  return SETTINGS_SCHEMA.map((def) => {
    const row = byKey[def.key];
    const hasValue = !!row?.value;
    if (def.type === "boolean") {
      const raw = hasValue ? row.value : def.default ?? "false";
      return { ...def, hasValue: true, value: raw === "true" ? "true" : "false", updatedAt: row?.updated_at || null };
    }
    return {
      ...def,
      hasValue,
      value: def.secret ? (hasValue ? "••••••••" : "") : row?.value || "",
      updatedAt: row?.updated_at || null,
    };
  });
}

// Public (unauthenticated) view of just the payment-method toggles — used
// by the registration success page to decide which payment options to show
// a registrant. Deliberately doesn't expose anything else in the schema.
export async function getPaymentMethodSettings() {
  const bankDef = SETTINGS_SCHEMA.find((s) => s.key === "payment_method_bank_transfer");
  const cardDef = SETTINGS_SCHEMA.find((s) => s.key === "payment_method_card");
  const [bankRaw, cardRaw] = await Promise.all([
    getSetting("payment_method_bank_transfer"),
    getSetting("payment_method_card"),
  ]);
  return {
    bankTransfer: (bankRaw ?? bankDef.default) === "true",
    card: (cardRaw ?? cardDef.default) === "true",
  };
}

export async function setSetting(key, value, isSecret) {
  const stored = isSecret ? encrypt(value) : value;
  await pool.query(
    `INSERT INTO kutumb_platform_settings (key, value, is_secret, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (key) DO UPDATE SET value = $2, is_secret = $3, updated_at = now()`,
    [key, stored, !!isSecret]
  );
}

export async function deleteSetting(key) {
  await pool.query("DELETE FROM kutumb_platform_settings WHERE key = $1", [key]);
}
