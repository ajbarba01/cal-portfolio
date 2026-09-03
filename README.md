# cal-portfolio

The site behind `calbarba.com`: a portfolio for Cal's dog-walking and house-sitting work with a self-serve booking system attached — clients pick a service, see a server-derived quote, book, pay, and manage the booking from their account, while Cal runs availability, approvals, clients and pricing from an admin area. It is a Next.js App Router app in TypeScript, styled with Tailwind and a token-driven component kit, on Supabase for data and auth, with Stripe for payments and Resend for mail, deployed to Vercel.

Working on it starts with [AGENTS.md](AGENTS.md) — the shared instruction file every coding agent reads, and the router to the rest of the docs. `npm run dev` starts the app; `npm run typecheck`, `npm run lint` and `npm run test:unit` are the gates before a commit.

---

_Last reviewed: 2026-09-03_
