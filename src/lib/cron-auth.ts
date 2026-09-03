import { timingSafeEqual } from "node:crypto";

/**
 * Returns true when the request carries the expected `Bearer <secret>`
 * Authorization header.
 *
 * Fails closed: with no secret configured every request is rejected, so a
 * deployment that forgets the variable cannot leave the endpoint open. The
 * comparison is constant-time so that an attacker cannot recover the secret one
 * byte at a time from response timing; lengths are checked first because
 * `timingSafeEqual` throws on buffers of different sizes, and the length of a
 * bearer token leaks nothing worth protecting.
 *
 * @param secret - Defaults to `CRON_SECRET`, read per call rather than at
 * import time so that route modules stay importable without it.
 */
export function assertCronAuth(
  request: Request,
  secret: string | undefined = process.env.CRON_SECRET,
): boolean {
  if (!secret) return false;

  const header = request.headers.get("authorization");
  if (header === null) return false;

  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(header);

  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
}
