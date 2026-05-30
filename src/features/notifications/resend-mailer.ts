import "server-only";

/**
 * Resend SDK adapter — the only file in the codebase that imports `resend`.
 * All other code depends on the Mailer interface from ./types.ts.
 *
 * Env vars required at runtime:
 *   RESEND_API_KEY  — Resend API key
 *   EMAIL_FROM      — Sender address (e.g. "Cal Barba <cal@calbarba.com>")
 *
 * send() never throws; errors are mapped to { ok: false, error }.
 */

import { Resend } from "resend";
import type { Mailer, EmailMessage, SendResult } from "./types";

export class ResendMailer implements Mailer {
  private readonly client: Resend;
  private readonly from: string;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ResendMailer: RESEND_API_KEY environment variable is not set",
      );
    }
    const from = process.env.EMAIL_FROM;
    if (!from) {
      throw new Error(
        "ResendMailer: EMAIL_FROM environment variable is not set",
      );
    }
    this.client = new Resend(apiKey);
    this.from = from;
  }

  async send(msg: EmailMessage): Promise<SendResult> {
    try {
      const { data, error } = await this.client.emails.send({
        from: this.from,
        to: msg.to,
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
      });

      if (error) {
        return { ok: false, error: error.message };
      }

      return { ok: true, id: data?.id ?? "unknown" };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return { ok: false, error: message };
    }
  }
}
