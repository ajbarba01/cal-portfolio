# features/

Domain logic, organized one folder per concept (e.g. `booking/`, `accounts/`, `pricing/`, `gallery/`). Each feature owns its UI, hooks, services, and vendor adapters.

Rules: see [../../docs/ENGINEERING.md](../../docs/ENGINEERING.md) — feature-first organization, one-way dependency direction (components → hooks → services → data), vendors behind adapters, pure core logic isolated from IO.

`app/` is routing only and composes features; it does not contain domain logic.
