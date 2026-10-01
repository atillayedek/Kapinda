import { escapeHtml } from "./resend.ts";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const tl = (n: unknown) => `${Number(n ?? 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`;

function layout(title: string, bodyHtml: string, footerHtml: string): string {
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;background:#f6f4ef;font-family:Arial,Helvetica,sans-serif;color:#1f2a24">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;padding:28px">
<tr><td style="font-size:22px;font-weight:bold;color:#0f6b4f">Kapında</td></tr>
<tr><td style="padding-top:16px;font-size:15px;line-height:1.6">${bodyHtml}</td></tr>
<tr><td style="padding-top:24px;font-size:12px;color:#6b7280;line-height:1.5">${footerHtml}</td></tr>
</table></td></tr></table></body></html>`;
}

const FOOTER = "Kapında · Hopa / Artvin · destek@kapinda.site · +90 531 870 1189";

export function renderEmail(template: string, data: Record<string, unknown>, unsubscribeUrl?: string): RenderedEmail {
  const footer = unsubscribeUrl
    ? `${FOOTER}<br><a href="${escapeHtml(unsubscribeUrl)}" style="color:#6b7280">E-posta aboneliğinden çık</a>`
    : FOOTER;
  const footerText = unsubscribeUrl ? `${FOOTER}\nAbonelikten çık: ${unsubscribeUrl}` : FOOTER;
  const order = escapeHtml(String(data.order_number ?? ""));
  const vendor = escapeHtml(String(data.vendor_name ?? ""));
  switch (template) {
    case "order_received": {
      const subject = `Siparişiniz alındı (${data.order_number})`;
      const body = `<p>${order} numaralı siparişiniz <strong>${vendor}</strong> işletmesine iletildi.</p>
<p>Ürün tutarı (kapıda ödenecek): <strong>${tl(data.product_subtotal)}</strong><br>Online ödenen teslimat ücreti: <strong>${
        tl(data.delivery_fee_payable)
      }</strong></p>
<p>Teslimatta uygulamadaki QR kodunu kuryeye okutmanız gerekir.</p>`;
      return {
        subject,
        html: layout(subject, body, footer),
        text: `${data.order_number} numaralı siparişiniz ${data.vendor_name} işletmesine iletildi.\nÜrün tutarı (kapıda): ${
          tl(data.product_subtotal)
        }\nTeslimat ücreti (online): ${tl(data.delivery_fee_payable)}\n\n${footerText}`,
      };
    }
    case "order_delivered": {
      const subject = `Siparişiniz teslim edildi (${data.order_number})`;
      const body =
        `<p>${order} numaralı siparişiniz teslim edildi. Afiyet olsun!</p><p>Siparişinizi uygulamadan değerlendirebilirsiniz.</p>`;
      return {
        subject,
        html: layout(subject, body, footer),
        text: `${data.order_number} numaralı siparişiniz teslim edildi.\n\n${footerText}`,
      };
    }
    case "order_cancelled": {
      const subject = `Siparişiniz iptal edildi (${data.order_number})`;
      const body = `<p>${order} numaralı siparişiniz iptal edildi. Ödenen teslimat ücreti iade edilecektir.</p>`;
      return {
        subject,
        html: layout(subject, body, footer),
        text: `${data.order_number} numaralı siparişiniz iptal edildi.\n\n${footerText}`,
      };
    }
    case "vendor_application_result":
    case "courier_application_result": {
      const approved = data.approved === true;
      const kind = template.startsWith("vendor") ? "Esnaf" : "Kurye";
      const subject = `${kind} başvurunuz ${approved ? "onaylandı" : "sonuçlandı"}`;
      const body = approved
        ? `<p>${kind} başvurunuz onaylandı. ${
          kind === "Esnaf" ? "Kapında İşletme (Windows)" : "Kapında Kurye (Android)"
        } uygulamasına kayıtlı e-posta adresinizle giriş yapabilirsiniz.</p>`
        : `<p>${kind} başvurunuz bu aşamada onaylanmadı.</p>${data.reason ? `<p>Açıklama: ${escapeHtml(String(data.reason))}</p>` : ""}`;
      return { subject, html: layout(subject, body, footer), text: `${subject}\n\n${footerText}` };
    }
    case "vendor_application_received":
    case "courier_application_received": {
      const subject = "Başvurunuz alındı";
      return {
        subject,
        html: layout(subject, "<p>Başvurunuz alındı. İnceleme sonrası size bilgi vereceğiz.</p>", footer),
        text: `Başvurunuz alındı.\n\n${footerText}`,
      };
    }
    case "support_reply": {
      const subject = "Destek talebinize yanıt verildi";
      return {
        subject,
        html: layout(subject, "<p>Destek talebinize yanıt verildi. Mesajı uygulamadan görüntüleyebilirsiniz.</p>", footer),
        text: `Destek talebinize yanıt verildi.\n\n${footerText}`,
      };
    }
    case "announcement":
    case "newsletter": {
      const subject = String(data.subject ?? "Kapında");
      const bodyText = String(data.body ?? "");
      const body = bodyText.split(/\n{2,}/).map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`).join("");
      return { subject, html: layout(subject, body, footer), text: `${bodyText}\n\n${footerText}` };
    }
    default:
      throw new Error(`unknown_template_${template}`);
  }
}
