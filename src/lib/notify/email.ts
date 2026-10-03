import "server-only";

/**
 * Email through Resend's HTTP API (no SDK needed). Configure RESEND_API_KEY and
 * EMAIL_FROM, e.g. "ResearchFlow <digest@yourdomain.com>". Until a domain is
 * verified in Resend, it can only deliver to the Resend account's own address.
 */
export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendEmail(message: { to: string; subject: string; html: string; text: string }): Promise<boolean> {
  if (!isEmailConfigured()) return false;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [message.to], subject: message.subject, html: message.html, text: message.text }),
  });
  if (!response.ok) console.error("email failed", response.status, await response.text().catch(() => ""));
  return response.ok;
}
