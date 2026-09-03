/**
 * The one place a required environment variable turns into an error message.
 *
 * The value is passed in rather than looked up from `name`, because Next.js
 * only inlines a `NEXT_PUBLIC_*` variable into the browser bundle when the code
 * reads it as a static `process.env.NAME` member. A dynamic `process.env[name]`
 * lookup survives the build but comes back undefined in the browser, so every
 * caller keeps the static read and hands this function the result.
 *
 * @param hint - what to do about it, for callers that are not the dev server.
 */
export function requireEnv(
  name: string,
  value: string | undefined,
  hint = "set it in .env.local before starting the server",
): string {
  if (!value) {
    throw new Error(`Missing ${name} — ${hint}.`);
  }
  return value;
}
