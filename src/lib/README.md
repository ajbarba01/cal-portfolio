# lib/

Business-agnostic, reusable infrastructure. **Zero knowledge of the business domain** (no clients, dogs, services, pricing rules). If it knows about the business, it belongs in a `features/<domain>/` folder instead.

Current: `utils.ts` (`cn` class merger), `design-tokens.ts` (non-color tokens + semantic role list). Color tokens live in `app/globals.css`.

Check: grep this folder for any domain term → should be empty. See [../../docs/ENGINEERING.md](../../docs/ENGINEERING.md) #2.
