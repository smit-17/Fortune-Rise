import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";
const BACKUP_EMAIL_TO = "lepdogroup@gmail.com";

function toBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function buildRawEmail(filename: string, contentBase64: string): string {
  const boundary = "lepdo_backup_boundary";
  const lines = [
    `To: ${BACKUP_EMAIL_TO}`,
    `Subject: LEPDO Backup - ${filename}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    "Your LEPDO Accounting backup is attached. Keep this file safe — you can restore it from Settings > Backup & Restore.",
    "",
    `--${boundary}`,
    `Content-Type: application/json; name="${filename}"`,
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename="${filename}"`,
    "",
    contentBase64,
    `--${boundary}--`,
  ];
  return toBase64Url(lines.join("\r\n"));
}

export const emailBackup = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({ filename: z.string().min(1), contentBase64: z.string().min(1) })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const lovableKey = process.env["LOVABLE_API_KEY"];
    const gmailKey = process.env["GOOGLE_MAIL_API_KEY"];
    if (!lovableKey || !gmailKey) {
      return { ok: false as const, error: "Email is not connected yet." };
    }
    const response = await fetch(`${GATEWAY_URL}/users/me/messages/send`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": gmailKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: buildRawEmail(data.filename, data.contentBase64) }),
    });
    if (!response.ok) {
      const body = await response.text();
      console.error(`Gmail send failed [${response.status}]: ${body}`);
      return { ok: false as const, error: `Send failed (${response.status}).` };
    }
    return { ok: true as const };
  });
