# lib/

Business-agnostic, reusable infrastructure. **Zero knowledge of the business domain** (no clients, pets, services, pricing rules). If it knows about the business, it belongs in a `features/<domain>/` folder instead.

What lives here: small pure helpers (class merging, phone and date formatting, pagination, plurals, haversine distance), the design-token module, environment and auth guards, and the vendor client wrappers under `supabase/` and `stripe/`. Nothing is listed by name — grep the folder; a list in a README rots.

The rule is enforced, not just documented: the `boundaries/element-types` ESLint rule forbids a `lib` module from importing a feature, a route, or a component. If a helper needs a domain type, invert the dependency or move the module into the feature that owns it.

Check: grep this folder for any domain term → should be empty. See [../../docs/ENGINEERING.md](../../docs/ENGINEERING.md) #2.
