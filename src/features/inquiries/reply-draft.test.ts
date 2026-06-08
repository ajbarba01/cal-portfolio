import { describe, expect, it } from "vitest";

import {
  mailtoUrl,
  replyBody,
  replySubject,
  smsUrl,
  type InquiryLike,
} from "./reply-draft";

const inquiry: InquiryLike = {
  name: "Jamie Rivera",
  subject: "Weekend walks",
  message: "Do you cover weekends?",
};

describe("reply-draft", () => {
  it("prefixes the subject, falling back when absent", () => {
    expect(replySubject(inquiry)).toBe("Re: Weekend walks");
    expect(replySubject({ ...inquiry, subject: null })).toBe(
      "Re: your inquiry",
    );
  });

  it("greets by first name and leaves space for the real reply", () => {
    const body = replyBody(inquiry);
    expect(body.startsWith("Hi Jamie,")).toBe(true);
    expect(body).toContain("Thanks for reaching out");
  });

  it("greets 'there' when name is blank", () => {
    expect(replyBody({ ...inquiry, name: "  " }).startsWith("Hi there,")).toBe(
      true,
    );
  });

  it("builds an encoded mailto with subject + body, kept short", () => {
    const url = mailtoUrl(
      "jamie@example.com",
      "Re: Weekend walks",
      "Hi Jamie,",
    );
    expect(url.startsWith("mailto:jamie@example.com?")).toBe(true);
    expect(url).toContain("subject=Re");
    expect(url).toContain("body=Hi");
    expect(url.length).toBeLessThan(1500);
  });

  it("builds an sms url with an encoded body and no subject", () => {
    const url = smsUrl("7205550143", "Hi Jamie,");
    expect(url).toBe("sms:7205550143?&body=Hi%20Jamie%2C");
  });
});
