import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOGO_PATH = path.join(__dirname, "../../public/kutumb-logo.png");
const LOGO_EXISTS = fs.existsSync(LOGO_PATH);
const LOGO_HTML = LOGO_EXISTS
  ? `<img src="cid:kutumbLogo" alt="Kutumb" width="148" height="40" style="height:40px;width:148px;max-width:148px;display:block;margin-bottom:16px;border:0;" />`
  : "";
function logoAttachment() {
  return LOGO_EXISTS
    ? [{ filename: "kutumb-logo.png", path: LOGO_PATH, cid: "kutumbLogo" }]
    : [];
}

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  if (!process.env.SMTP_HOST) {
    console.warn(
      "⚠️  SMTP_HOST not set - emails will NOT be sent. Configure .env (see .env.example)."
    );
    return null;
  }

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true", // true for port 465, false for 587/25
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });

  return transporter;
}

const FROM_ADDRESS =
  process.env.EMAIL_FROM || `"Kutumb" <${process.env.SMTP_USER || "pramod@kutumb.org.au"}>`;

/**
 * Returns whether SMTP looks configured, and (if so) actually verifies the
 * connection/credentials with the mail server - so config problems are
 * caught immediately instead of only failing silently later at send time.
 */
export async function checkEmailConfig() {
  if (!process.env.SMTP_HOST) {
    return { configured: false, verified: false, error: "SMTP_HOST is not set in .env" };
  }

  const t = getTransporter();
  if (!t) return { configured: false, verified: false, error: "SMTP not configured" };

  try {
    await t.verify();
    return { configured: true, verified: true, from: FROM_ADDRESS };
  } catch (err) {
    return { configured: true, verified: false, from: FROM_ADDRESS, error: err.message };
  }
}

/** Sends a simple test email - used by /api/email/test-send for diagnostics. */
export async function sendTestEmail(to) {
  return send({
    to,
    subject: "Kutumb test email",
    html: `
      <div style="font-family: Arial, sans-serif;">
        ${LOGO_HTML}
        <p>This is a test email from your Kutumb app - if you're reading this,
        SMTP is configured correctly and membership/event confirmation emails
        will be delivered.</p>
      </div>
    `,
    attachments: logoAttachment(),
  });
}

/**
 * Generic sender. Returns { sent: boolean, error?: string } instead of throwing,
 * so a mail outage never blocks the registration flow itself.
 */
async function send({ to, subject, html, attachments = [] }) {
  const t = getTransporter();
  if (!t) return { sent: false, error: "SMTP not configured" };

  try {
    await t.sendMail({ from: FROM_ADDRESS, to, subject, html, attachments });
    return { sent: true };
  } catch (err) {
    console.error("EMAIL SEND ERROR:", err.message);
    return { sent: false, error: err.message };
  }
}

export async function sendMembershipConfirmationEmail({
  to,
  name,
  membershipNumber,
  qrPngBuffer,
  cardPdfBuffer, // the same styled PDF card shown in the popup/download button
}) {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: auto;">
      ${LOGO_HTML}
      <h2 style="color:#7c3f00;">Welcome to Kutumb, ${name}!</h2>
      <p>Your membership application has been received and confirmed.</p>
      <p style="font-size: 18px;"><strong>Membership Number: ${membershipNumber}</strong></p>
      <p>Your membership card is attached to this email as a PDF, and your QR code is shown below.</p>
      <img src="cid:membershipQr" alt="Membership QR Code" style="width:180px;height:180px;" />
      <p style="margin-top:24px;color:#555;font-size:13px;">
        With Best Regards, &middot; Kutumb Executive Team
      </p>
    </div>
  `;

  return send({
    to,
    subject: "Welcome to Kutumb - Your Membership is Confirmed",
    html,
    attachments: [
      ...logoAttachment(),
      ...(qrPngBuffer
        ? [{ filename: "membership-qr.png", content: qrPngBuffer, cid: "membershipQr" }]
        : []),
      ...(cardPdfBuffer
        ? [{ filename: `kutumb-membership-card-${membershipNumber}.pdf`, content: cardPdfBuffer }]
        : []),
    ],
  });
}

export async function sendEventConfirmationEmail({
  to,
  name,
  eventName,
  eventDate,
  membershipNumber, // optional - mentioned as plain text only, no card/QR/PDF
  flyerBuffer, // optional - the event's flyer image, attached as a keepsake
  flyerFilename, // optional - original filename, used to infer extension/content type
}) {
  const membershipLine = membershipNumber
    ? `<p style="font-size:14px;">Your Kutumb Membership Number: <strong>${membershipNumber}</strong></p>`
    : "";

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: auto;">
      ${LOGO_HTML}
      <h2 style="color:#7c3f00;">Registration Confirmed</h2>
      <p>Hi ${name}, you're registered for:</p>
      <p style="font-size:16px;"><strong>${eventName}</strong>${eventDate ? ` &mdash; ${eventDate}` : ""}</p>
      ${membershipLine}
      <p>We look forward to seeing you there!</p>
      <p style="margin-top:24px;color:#555;font-size:13px;">
        With Best Regards, &middot; Kutumb Executive Team
      </p>
    </div>
  `;

  return send({
    to,
    subject: `Registration Confirmed - ${eventName}`,
    html,
    attachments: [
      ...logoAttachment(),
      ...(flyerBuffer ? [{ filename: flyerFilename || "event-flyer.jpg", content: flyerBuffer }] : []),
    ],
  });
}

export async function sendDonationThankYouEmail({
  to,
  name,
  amount,
  membershipNumber, // optional
  bankTransferred,
  transactionNumber,
}) {
  const membershipLine = membershipNumber
    ? `<p style="font-size:14px;">Kutumb Membership Number: <strong>${membershipNumber}</strong></p>`
    : "";

  const transferLine = bankTransferred
    ? `<p style="font-size:14px;">Bank transfer reference: <strong>${transactionNumber || "(not provided)"}</strong></p>`
    : `<p style="font-size:14px;">Payment method: To be arranged / not yet transferred.</p>`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: auto;">
      ${LOGO_HTML}
      <h2 style="color:#7c3f00;">Thank You for Your Donation, ${name}!</h2>
      <p>We've recorded your pledged donation of <strong>$${amount}</strong> to Kutumb.</p>
      ${membershipLine}
      ${transferLine}
      <p>Your generosity helps us continue serving the community. Thank you for your support!</p>
      <p style="margin-top:24px;color:#555;font-size:13px;">
        With Best Regards, &middot; Kutumb Executive Team
      </p>
    </div>
  `;

  return send({
    to,
    subject: "Thank You for Your Donation to Kutumb",
    html,
    attachments: logoAttachment(),
  });
}
