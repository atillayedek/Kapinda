// Resend e-posta gönderimi
export interface EmailMessage {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
}

export async function sendEmail(apiKey: string, msg: EmailMessage, idempotencyKey: string, fetchImpl: typeof fetch = fetch) {
  const res = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(msg),
  });
  const body = await res.json().catch(() => ({})) as { id?: string; message?: string };
  if (!res.ok) return { ok: false as const, error: `resend_${res.status}` };
  return { ok: true as const, id: body.id ?? "" };
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
