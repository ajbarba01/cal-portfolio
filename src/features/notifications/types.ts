/**
 * Mailer DI seam — the app and cores depend on this interface, never on the
 * Resend SDK directly. The SDK is isolated inside resend-mailer.ts.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export type SendResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export interface Mailer {
  send(msg: EmailMessage): Promise<SendResult>;
}
