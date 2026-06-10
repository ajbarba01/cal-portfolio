# Inquiries Tab (account + admin) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a client-facing **Inquiries** account tab (searchable, paginated, recency-sorted list of the client's own inquiries with read/edit/resolve in a popup) and restructure the existing admin inquiries view to reuse the exact same component set, minus client-edit.

**Architecture:** One pure logic module (`inquiry-list.ts`: filter/sort/paginate/edit-gate) backs a set of presentational, capability-driven React components (`InquiryList`, `InquiryCard`, `InquiryDetailDialog`, plus a generic `ConfirmDialog`). Two thin "use client" wrappers — account and admin — supply data + side-effect handlers as props. Client edit/resolve go through new service-role server-action cores with code-level ownership + state guards (RLS already allows owner reads; UPDATE stays admin-only at the DB, so client writes route through the service role like `submitInquiry` does).

**Tech Stack:** Next.js App Router, React 19, TypeScript strict, Tailwind v4 + tokens in `globals.css`, `@base-ui/react` (Dialog/Button), `lucide-react`, Supabase, Zod, Vitest.

**Design source of truth:** [docs/mockups/inquiries.html](../../mockups/inquiries.html) — the implementation must stay faithful to it (uniform fixed-height tiles, 1-line subject clamp + 3-line body clamp, popup with scrollable body, resolve-confirm flow, mobile = no tile actions / bottom-sheet popup with all actions, admin keeps Email/Text/View-client).

**Key decisions (locked):**

- Edit allowed **only** while `status === "new"` AND `replied_at === null`. Replied or resolved → read-only.
- Filter/search/pagination run **client-side** (realistic volume is small).
- Mobile: tiles carry **no** action buttons; tapping a tile opens the popup where every action lives.
- Admin can resolve + reply (Email/Text) + view client, but **never** edits a client's words.

---

## File Structure

**Create:**

- `src/features/inquiries/inquiry-list.ts` — pure filter/sort/paginate/edit-gate/date-format helpers.
- `src/features/inquiries/inquiry-list.test.ts` — fast unit tests (no Supabase).
- `src/features/inquiries/inquiry-client-actions.test.ts` — integration tests for client cores (local Supabase).
- `src/components/ui/confirm-dialog.tsx` — generic confirm dialog.
- `src/features/inquiries/components/inquiry-card.tsx` — uniform tile.
- `src/features/inquiries/components/inquiry-detail-dialog.tsx` — detail popup (read + edit).
- `src/features/inquiries/components/inquiry-list.tsx` — orchestrator (toolbar + grid + pager + dialogs).
- `src/app/(account)/account/inquiries/page.tsx` — account server page.
- `src/app/(account)/account/inquiries/_components/account-inquiries-client.tsx` — account wrapper.

**Modify:**

- `src/features/inquiries/inquiry-schema.ts` — add `editInquirySchema`.
- `src/features/inquiries/inquiry-actions.ts` — add `ClientDeps`, `resolveMyInquiryCore`, `editMyInquiryCore`, and `resolveMyInquiry`/`editMyInquiry` wrappers.
- `src/components/layout/nav-config.ts` — add `Inquiries` to `accountNav`.
- `src/app/(admin)/admin/inquiries/_components/inquiries-client.tsx` — rewrite to use shared components.
- `docs/DESIGN.md` — register the new `/account/inquiries` route/page.

---

## Task 1: Pure list logic (`inquiry-list.ts`)

**Files:**

- Create: `src/features/inquiries/inquiry-list.ts`
- Test: `src/features/inquiries/inquiry-list.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/features/inquiries/inquiry-list.test.ts
import { describe, expect, it } from "vitest";

import type { InquiryRow } from "./inquiry-actions";
import {
  canEditInquiry,
  filterInquiries,
  formatInquiryDate,
  paginate,
  sortByRecency,
} from "./inquiry-list";

function row(overrides: Partial<InquiryRow>): InquiryRow {
  return {
    id: "1",
    client_id: "c1",
    name: "Jamie Rivera",
    email: "jamie@example.com",
    phone: null,
    subject: "Weekend walks",
    message: "Do you cover weekends?",
    status: "new",
    replied_at: null,
    resolved_at: null,
    created_at: "2026-06-01T12:00:00.000Z",
    ...overrides,
  };
}

describe("sortByRecency", () => {
  it("orders newest first without mutating the input", () => {
    const a = row({ id: "a", created_at: "2026-06-01T00:00:00.000Z" });
    const b = row({ id: "b", created_at: "2026-06-03T00:00:00.000Z" });
    const c = row({ id: "c", created_at: "2026-06-02T00:00:00.000Z" });
    const input = [a, b, c];
    const sorted = sortByRecency(input);
    expect(sorted.map((r) => r.id)).toEqual(["b", "c", "a"]);
    expect(input.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });
});

describe("filterInquiries", () => {
  const rows = [
    row({ id: "1", subject: "Weekend walks", status: "new" }),
    row({
      id: "2",
      subject: "Holiday rates",
      message: "fourth of july",
      status: "resolved",
    }),
    row({
      id: "3",
      subject: null,
      name: "Priya Anand",
      email: "priya@example.com",
      status: "new",
    }),
  ];

  it("filters by status", () => {
    expect(filterInquiries(rows, "", "new").map((r) => r.id)).toEqual([
      "1",
      "3",
    ]);
    expect(filterInquiries(rows, "", "resolved").map((r) => r.id)).toEqual([
      "2",
    ]);
    expect(filterInquiries(rows, "", "all")).toHaveLength(3);
  });

  it("matches case-insensitively across subject, message, name, and email", () => {
    expect(filterInquiries(rows, "WEEKEND", "all").map((r) => r.id)).toEqual([
      "1",
    ]);
    expect(filterInquiries(rows, "july", "all").map((r) => r.id)).toEqual([
      "2",
    ]);
    expect(filterInquiries(rows, "priya@", "all").map((r) => r.id)).toEqual([
      "3",
    ]);
  });

  it("combines query and status", () => {
    expect(filterInquiries(rows, "a", "new").map((r) => r.id)).toEqual([
      "1",
      "3",
    ]);
  });
});

describe("paginate", () => {
  const items = [1, 2, 3, 4, 5];

  it("slices the requested page and reports the page count", () => {
    expect(paginate(items, 1, 2)).toEqual({
      items: [1, 2],
      page: 1,
      pageCount: 3,
    });
    expect(paginate(items, 2, 2)).toEqual({
      items: [3, 4],
      page: 2,
      pageCount: 3,
    });
    expect(paginate(items, 3, 2)).toEqual({
      items: [5],
      page: 3,
      pageCount: 3,
    });
  });

  it("clamps out-of-range pages and never reports fewer than one page", () => {
    expect(paginate(items, 99, 2).page).toBe(3);
    expect(paginate(items, 0, 2).page).toBe(1);
    expect(paginate([], 1, 2)).toEqual({ items: [], page: 1, pageCount: 1 });
  });
});

describe("canEditInquiry", () => {
  it("allows editing only an unanswered, still-new inquiry", () => {
    expect(canEditInquiry({ status: "new", replied_at: null })).toBe(true);
    expect(
      canEditInquiry({ status: "new", replied_at: "2026-06-02T00:00:00.000Z" }),
    ).toBe(false);
    expect(canEditInquiry({ status: "resolved", replied_at: null })).toBe(
      false,
    );
    expect(canEditInquiry({ status: "resolved", replied_at: "x" })).toBe(false);
  });
});

describe("formatInquiryDate", () => {
  it("renders a human date and time with a separator", () => {
    const out = formatInquiryDate("2026-06-03T20:14:00.000Z");
    expect(out).toContain("Jun 3, 2026");
    expect(out).toContain("·");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/features/inquiries/inquiry-list.test.ts`
Expected: FAIL — `Cannot find module './inquiry-list'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/features/inquiries/inquiry-list.ts
import type { InquiryRow } from "./inquiry-actions";

export type StatusFilter = "all" | "new" | "resolved";

/** Newest-first. Pure: returns a new array, never mutates the input. */
export function sortByRecency(inquiries: InquiryRow[]): InquiryRow[] {
  return [...inquiries].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );
}

/** Case-insensitive substring match across subject, message, name, email. */
export function filterInquiries(
  inquiries: InquiryRow[],
  query: string,
  status: StatusFilter,
): InquiryRow[] {
  const q = query.trim().toLowerCase();
  return inquiries.filter((inquiry) => {
    if (status !== "all" && inquiry.status !== status) return false;
    if (!q) return true;
    const haystack = [
      inquiry.subject,
      inquiry.message,
      inquiry.name,
      inquiry.email,
    ]
      .filter((value): value is string => Boolean(value))
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

export interface Page<T> {
  items: T[];
  /** Clamped 1-based page actually shown. */
  page: number;
  /** Always >= 1. */
  pageCount: number;
}

export function paginate<T>(
  items: T[],
  page: number,
  pageSize: number,
): Page<T> {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const clamped = Math.min(Math.max(1, page), pageCount);
  const start = (clamped - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    page: clamped,
    pageCount,
  };
}

/** Client may edit only an unanswered, still-new inquiry. */
export function canEditInquiry(
  inquiry: Pick<InquiryRow, "status" | "replied_at">,
): boolean {
  return inquiry.status === "new" && inquiry.replied_at === null;
}

/** e.g. "Jun 3, 2026 · 2:14 PM" in Cal's timezone. */
export function formatInquiryDate(iso: string): string {
  const date = new Date(iso);
  const day = date.toLocaleDateString("en-US", {
    timeZone: "America/Denver",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const time = date.toLocaleTimeString("en-US", {
    timeZone: "America/Denver",
    hour: "numeric",
    minute: "2-digit",
  });
  return `${day} · ${time}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/features/inquiries/inquiry-list.test.ts`
Expected: PASS (all assertions green).

- [ ] **Step 5: Typecheck + lint the new files**

Run: `npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/features/inquiries/inquiry-list.ts src/features/inquiries/inquiry-list.test.ts
git commit -m "feat: pure inquiry list filter/sort/paginate helpers"
```

---

## Task 2: Client edit/resolve server actions

**Files:**

- Modify: `src/features/inquiries/inquiry-schema.ts`
- Modify: `src/features/inquiries/inquiry-actions.ts`
- Test: `src/features/inquiries/inquiry-client-actions.test.ts` (integration — needs local Supabase)

- [ ] **Step 1: Add the edit schema**

In `src/features/inquiries/inquiry-schema.ts`, append after `submitInquirySchema`/`SubmitInquiryInput`:

```ts
/** Client-side edit of an existing inquiry. Subject optional; message required. */
export const editInquirySchema = z.object({
  subject: z.string().trim().max(200).optional().or(z.literal("")),
  message: z.string().trim().min(1, "Message is required").max(4000),
});

export type EditInquiryInput = z.infer<typeof editInquirySchema>;
```

- [ ] **Step 2: Add cores + wrappers to `inquiry-actions.ts`**

Add these imports to the existing import block at the top of `src/features/inquiries/inquiry-actions.ts`:

```ts
import { canEditInquiry } from "./inquiry-list";
import {
  editInquirySchema,
  submitInquirySchema,
  type EditInquiryInput,
  type SubmitInquiryInput,
} from "./inquiry-schema";
```

(Replace the existing `submitInquirySchema`/`SubmitInquiryInput` import line with the combined block above.)

Add near the other `interface AdminDeps` declaration:

```ts
export interface ClientDeps {
  serviceClient: SupabaseClient;
  /** The authenticated client's user id; ownership is enforced against this. */
  actorUserId: string;
}

const inquiryGuardSchema = z.object({
  client_id: z.string().nullable(),
  status: z.enum(["new", "resolved"]),
  replied_at: z.string().nullable(),
});
```

Add these cores (e.g. after `stampInquiryRepliedCore`):

```ts
export async function resolveMyInquiryCore(
  deps: ClientDeps,
  inquiryId: string,
): Promise<InquiryMutationResult> {
  const { data, error } = await deps.serviceClient
    .from("inquiries")
    .select("client_id, status, replied_at")
    .eq("id", inquiryId)
    .maybeSingle();
  if (error) return { kind: "error", message: error.message };
  if (!data) return { kind: "not_found" };

  const guard = inquiryGuardSchema.safeParse(data);
  if (!guard.success) return { kind: "error", message: "Bad inquiry row." };
  if (guard.data.client_id !== deps.actorUserId) return { kind: "forbidden" };

  const { error: updateError } = await deps.serviceClient
    .from("inquiries")
    .update({ status: "resolved", resolved_at: new Date().toISOString() })
    .eq("id", inquiryId)
    .eq("client_id", deps.actorUserId);
  if (updateError) return { kind: "error", message: updateError.message };
  return { kind: "success" };
}

export async function editMyInquiryCore(
  deps: ClientDeps,
  inquiryId: string,
  rawInput: EditInquiryInput,
): Promise<InquiryMutationResult> {
  const parsed = editInquirySchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      kind: "error",
      message: parsed.error.issues.map((issue) => issue.message).join("; "),
    };
  }
  const input = parsed.data;

  const { data, error } = await deps.serviceClient
    .from("inquiries")
    .select("client_id, status, replied_at")
    .eq("id", inquiryId)
    .maybeSingle();
  if (error) return { kind: "error", message: error.message };
  if (!data) return { kind: "not_found" };

  const guard = inquiryGuardSchema.safeParse(data);
  if (!guard.success) return { kind: "error", message: "Bad inquiry row." };
  if (guard.data.client_id !== deps.actorUserId) return { kind: "forbidden" };
  if (!canEditInquiry(guard.data)) {
    return { kind: "error", message: "This inquiry can no longer be edited." };
  }

  const { error: updateError } = await deps.serviceClient
    .from("inquiries")
    .update({
      subject: input.subject ? input.subject : null,
      message: input.message,
    })
    .eq("id", inquiryId)
    .eq("client_id", deps.actorUserId);
  if (updateError) return { kind: "error", message: updateError.message };
  return { kind: "success" };
}
```

Add the public wrappers (after `stampInquiryReplied`):

```ts
async function currentUserId(): Promise<string | null> {
  const session = await createClient();
  const {
    data: { user },
  } = await session.auth.getUser();
  return user?.id ?? null;
}

export async function resolveMyInquiry(
  inquiryId: string,
): Promise<InquiryMutationResult> {
  const actorUserId = await currentUserId();
  if (!actorUserId) return { kind: "forbidden" };
  const result = await resolveMyInquiryCore(
    { serviceClient: createServiceClient(), actorUserId },
    inquiryId,
  );
  if (result.kind === "success") revalidatePath("/account/inquiries");
  return result;
}

export async function editMyInquiry(
  inquiryId: string,
  input: EditInquiryInput,
): Promise<InquiryMutationResult> {
  const actorUserId = await currentUserId();
  if (!actorUserId) return { kind: "forbidden" };
  const result = await editMyInquiryCore(
    { serviceClient: createServiceClient(), actorUserId },
    inquiryId,
    input,
  );
  if (result.kind === "success") revalidatePath("/account/inquiries");
  return result;
}
```

- [ ] **Step 3: Write the integration test**

```ts
// src/features/inquiries/inquiry-client-actions.test.ts
/**
 * Integration tests for client-owned inquiry cores.
 * Prerequisites: local Supabase stack running; .env.test present (gitignored).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";

import { editMyInquiryCore, resolveMyInquiryCore } from "./inquiry-actions";

const url = process.env.SUPABASE_TEST_URL!;
const serviceKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY!;
if (!url || !serviceKey) {
  throw new Error("Missing SUPABASE_TEST_* env vars — is .env.test present?");
}

const serviceClient = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ts = Date.now();
const TEST_PASS = "Test1234!";
let ownerId: string;
let otherId: string;
const inquiryIds: string[] = [];

async function makeUser(email: string): Promise<string> {
  const { data, error } = await serviceClient.auth.admin.createUser({
    email,
    password: TEST_PASS,
    email_confirm: true,
  });
  if (error || !data.user)
    throw new Error(`createUser failed: ${error?.message}`);
  return data.user.id;
}

async function makeInquiry(opts: {
  clientId: string;
  status?: "new" | "resolved";
  repliedAt?: string | null;
}): Promise<string> {
  const { data, error } = await serviceClient
    .from("inquiries")
    .insert({
      client_id: opts.clientId,
      name: "Owner Test",
      email: `owner-${ts}-${inquiryIds.length}@example.invalid`,
      message: "Original message",
      status: opts.status ?? "new",
      replied_at: opts.repliedAt ?? null,
    })
    .select("id")
    .single();
  if (error || !data)
    throw new Error(`inquiry insert failed: ${error?.message}`);
  inquiryIds.push(data.id);
  return data.id;
}

beforeAll(async () => {
  [ownerId, otherId] = await Promise.all([
    makeUser(`inq-owner-${ts}@example.invalid`),
    makeUser(`inq-other-${ts}@example.invalid`),
  ]);
});

afterAll(async () => {
  if (inquiryIds.length > 0) {
    await serviceClient.from("inquiries").delete().in("id", inquiryIds);
  }
  await Promise.all(
    [ownerId, otherId]
      .filter(Boolean)
      .map((id) => serviceClient.auth.admin.deleteUser(id)),
  );
});

describe("resolveMyInquiryCore", () => {
  it("owner resolves their own inquiry", async () => {
    const id = await makeInquiry({ clientId: ownerId });
    const result = await resolveMyInquiryCore(
      { serviceClient, actorUserId: ownerId },
      id,
    );
    expect(result.kind).toBe("success");
    const { data } = await serviceClient
      .from("inquiries")
      .select("status")
      .eq("id", id)
      .single();
    expect(data?.status).toBe("resolved");
  });

  it("non-owner is forbidden and status is unchanged", async () => {
    const id = await makeInquiry({ clientId: ownerId });
    const result = await resolveMyInquiryCore(
      { serviceClient, actorUserId: otherId },
      id,
    );
    expect(result.kind).toBe("forbidden");
    const { data } = await serviceClient
      .from("inquiries")
      .select("status")
      .eq("id", id)
      .single();
    expect(data?.status).toBe("new");
  });

  it("missing inquiry → not_found", async () => {
    const result = await resolveMyInquiryCore(
      { serviceClient, actorUserId: ownerId },
      "00000000-0000-0000-0000-000000000000",
    );
    expect(result.kind).toBe("not_found");
  });
});

describe("editMyInquiryCore", () => {
  it("owner edits an unanswered new inquiry", async () => {
    const id = await makeInquiry({ clientId: ownerId });
    const result = await editMyInquiryCore(
      { serviceClient, actorUserId: ownerId },
      id,
      { subject: "Updated subject", message: "Updated message" },
    );
    expect(result.kind).toBe("success");
    const { data } = await serviceClient
      .from("inquiries")
      .select("subject, message")
      .eq("id", id)
      .single();
    expect(data?.subject).toBe("Updated subject");
    expect(data?.message).toBe("Updated message");
  });

  it("rejects edits once Cal has replied", async () => {
    const id = await makeInquiry({
      clientId: ownerId,
      repliedAt: new Date().toISOString(),
    });
    const result = await editMyInquiryCore(
      { serviceClient, actorUserId: ownerId },
      id,
      { subject: "", message: "Should not save" },
    );
    expect(result.kind).toBe("error");
  });

  it("non-owner is forbidden", async () => {
    const id = await makeInquiry({ clientId: ownerId });
    const result = await editMyInquiryCore(
      { serviceClient, actorUserId: otherId },
      id,
      { subject: "", message: "Hijack" },
    );
    expect(result.kind).toBe("forbidden");
  });
});
```

- [ ] **Step 4: Verify (typecheck + lint)**

Run: `npm run typecheck && npm run lint`
Expected: no errors.

> **Note (handoff gate):** The integration tests in this task require the local Supabase stack + `.env.test`. Per repo policy the subagent gate for this task is **typecheck + lint only**; the maintainer runs `npx vitest run src/features/inquiries/inquiry-client-actions.test.ts` against the local stack and expects all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/inquiries/inquiry-schema.ts src/features/inquiries/inquiry-actions.ts src/features/inquiries/inquiry-client-actions.test.ts
git commit -m "feat: client edit and resolve inquiry server actions"
```

---

## Task 3: Generic `ConfirmDialog`

**Files:**

- Create: `src/components/ui/confirm-dialog.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/ui/confirm-dialog.tsx
"use client";

import * as React from "react";
import { Dialog } from "@base-ui/react/dialog";
import { TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Generic confirmation modal over base-ui Dialog. Controlled via `open` +
 * `onOpenChange`. The confirm button is disabled while `pending`.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  confirmVariant = "brand",
  pending = false,
  onConfirm,
  onOpenChange,
}: {
  open: boolean;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: "brand" | "destructive" | "default";
  pending?: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-[#1c1813]/60 backdrop-blur-[2px]" />
        <Dialog.Popup className="bg-popover text-popover-foreground border-border fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border p-6 shadow-2xl outline-none">
          <div className="bg-brand/15 text-brand-strong mb-4 flex size-10 items-center justify-center rounded-full">
            <TriangleAlert className="size-5" aria-hidden="true" />
          </div>
          <Dialog.Title className="font-heading text-xl font-semibold">
            {title}
          </Dialog.Title>
          <Dialog.Description className="text-muted-foreground mt-2 text-sm">
            {description}
          </Dialog.Description>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              {cancelLabel}
            </Button>
            <Button
              variant={confirmVariant}
              onClick={onConfirm}
              disabled={pending}
            >
              {pending ? "Working…" : confirmLabel}
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/confirm-dialog.tsx
git commit -m "feat: generic confirm dialog component"
```

---

## Task 4: `InquiryCard`

**Files:**

- Create: `src/features/inquiries/components/inquiry-card.tsx`

> Faithfulness note: uniform fixed height (`h-[188px]`), subject clamps to one line (`truncate`), body clamps to three (`line-clamp-3`), hover lift. The whole tile opens the popup via a stretched overlay button (valid HTML — no nested buttons); footer actions sit above it (`relative z-10 pointer-events-auto`) and are hidden on mobile (`hidden sm:flex`).

- [ ] **Step 1: Write the component**

```tsx
// src/features/inquiries/components/inquiry-card.tsx
"use client";

import * as React from "react";
import { Check, Pencil } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { InquiryRow } from "@/features/inquiries/inquiry-actions";
import {
  canEditInquiry,
  formatInquiryDate,
} from "@/features/inquiries/inquiry-list";

export function InquiryCard({
  inquiry,
  editable,
  newLabel,
  renderIdentity,
  renderExtraActions,
  onOpen,
  onEditClick,
  onResolveClick,
}: {
  inquiry: InquiryRow;
  /** Capability: this consumer permits client edits at all (account = true). */
  editable: boolean;
  /** Label for the "new" status badge ("Open" for account, "New" for admin). */
  newLabel: string;
  renderIdentity?: (inquiry: InquiryRow) => React.ReactNode;
  renderExtraActions?: (inquiry: InquiryRow) => React.ReactNode;
  onOpen: (inquiry: InquiryRow) => void;
  onEditClick: (inquiry: InquiryRow) => void;
  onResolveClick: (inquiry: InquiryRow) => void;
}) {
  const isNew = inquiry.status === "new";
  const showEdit = editable && canEditInquiry(inquiry);
  const showResolve = isNew;

  return (
    <div className="group bg-card border-border hover:border-brand/40 relative flex h-[188px] flex-col rounded-xl border p-4 transition-all hover:-translate-y-px hover:shadow-lg">
      {/* Stretched overlay button: opens the popup; sits below the content. */}
      <button
        type="button"
        onClick={() => onOpen(inquiry)}
        aria-label={`Open inquiry${inquiry.subject ? `: ${inquiry.subject}` : ""}`}
        className="focus-visible:ring-ring/50 absolute inset-0 z-0 rounded-xl focus-visible:ring-3 focus-visible:outline-none"
      />

      {/* Content layer — pointer-events-none so clicks reach the overlay. */}
      <div className="pointer-events-none relative z-[1] flex min-h-0 flex-1 flex-col">
        <div className="mb-2 flex items-start gap-2">
          {inquiry.subject ? (
            <span className="font-heading flex-1 truncate text-base font-semibold">
              {inquiry.subject}
            </span>
          ) : (
            <span className="text-muted-foreground flex-1 truncate text-base font-medium italic">
              No subject
            </span>
          )}
          <Badge variant={isNew ? "pending" : "available"}>
            {isNew ? newLabel : "Resolved"}
          </Badge>
        </div>

        {renderIdentity ? (
          <div className="text-muted-foreground -mt-1 mb-2 truncate text-xs font-medium">
            {renderIdentity(inquiry)}
          </div>
        ) : null}

        <p className="text-foreground/80 line-clamp-3 min-h-0 flex-1 text-sm">
          {inquiry.message}
        </p>
      </div>

      {/* Footer: meta always; actions desktop-only (mobile defers to the popup). */}
      <div className="border-border/60 relative z-10 mt-3 flex items-center gap-2 border-t pt-3">
        <span className="text-muted-foreground pointer-events-none mr-auto text-xs">
          {formatInquiryDate(inquiry.created_at)}
        </span>
        {inquiry.replied_at ? (
          <span className="text-status-available-foreground pointer-events-none inline-flex items-center gap-1 text-xs font-medium">
            <Check className="size-3" aria-hidden="true" /> replied
          </span>
        ) : null}
        <div className="pointer-events-auto hidden items-center gap-1.5 sm:flex">
          {renderExtraActions ? renderExtraActions(inquiry) : null}
          {showEdit ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onEditClick(inquiry)}
            >
              <Pencil className="size-3.5" /> Edit
            </Button>
          ) : null}
          {showResolve ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onResolveClick(inquiry)}
            >
              Resolve
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/features/inquiries/components/inquiry-card.tsx
git commit -m "feat: uniform inquiry card tile"
```

---

## Task 5: `InquiryDetailDialog`

**Files:**

- Create: `src/features/inquiries/components/inquiry-detail-dialog.tsx`

> Faithfulness note: header (subject / "Editing inquiry"), meta line (date + replied), close X, **scrollable** body (`max-h` + `overflow-y-auto`, `whitespace-pre-wrap` — this is the fix for text escaping its box), footer actions. Responsive: centered card on `sm`, full-width bottom sheet on mobile; footer buttons full-width + stacked on mobile. Edit mode swaps the body for subject input + message textarea and turns Edit into Save.

- [ ] **Step 1: Write the component**

```tsx
// src/features/inquiries/components/inquiry-detail-dialog.tsx
"use client";

import * as React from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Check, Pencil, Save, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { InquiryRow } from "@/features/inquiries/inquiry-actions";
import {
  canEditInquiry,
  formatInquiryDate,
} from "@/features/inquiries/inquiry-list";

export function InquiryDetailDialog({
  inquiry,
  editing,
  editable,
  pending,
  renderExtraActions,
  onOpenChange,
  onResolveClick,
  onToggleEdit,
  onCancelEdit,
  onSave,
}: {
  /** null = closed. */
  inquiry: InquiryRow | null;
  editing: boolean;
  editable: boolean;
  pending: boolean;
  renderExtraActions?: (inquiry: InquiryRow) => React.ReactNode;
  onOpenChange: (open: boolean) => void;
  onResolveClick: (inquiry: InquiryRow) => void;
  onToggleEdit: () => void;
  onCancelEdit: () => void;
  onSave: (patch: { subject: string | null; message: string }) => void;
}) {
  const open = inquiry !== null;

  // Seed edit fields whenever the edited inquiry changes. Keying the fields by
  // id avoids set-state-in-effect (the inputs remount with fresh defaults).
  const showEdit = inquiry !== null && editable && canEditInquiry(inquiry);
  const showResolve = inquiry !== null && inquiry.status === "new";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-[#1c1813]/60 backdrop-blur-[2px]" />
        <Dialog.Popup className="bg-popover text-popover-foreground border-border fixed inset-x-0 bottom-0 z-50 flex max-h-[88vh] flex-col rounded-t-2xl border shadow-2xl outline-none sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:max-h-[80vh] sm:w-[min(32rem,calc(100%-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl">
          {inquiry ? (
            <>
              <div className="flex items-start gap-3 px-6 pt-6 pb-3">
                <div className="min-w-0 flex-1">
                  {editing ? (
                    <Dialog.Title className="text-muted-foreground text-sm font-semibold">
                      Editing inquiry
                    </Dialog.Title>
                  ) : (
                    <Dialog.Title className="font-heading truncate text-xl font-semibold">
                      {inquiry.subject ?? "No subject"}
                    </Dialog.Title>
                  )}
                  <p className="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                    <span>Sent {formatInquiryDate(inquiry.created_at)}</span>
                    {inquiry.replied_at ? (
                      <span className="text-status-available-foreground inline-flex items-center gap-1 font-medium">
                        <Check className="size-3" aria-hidden="true" /> Cal
                        replied
                      </span>
                    ) : null}
                  </p>
                </div>
                <Dialog.Close
                  aria-label="Close"
                  className="bg-muted text-muted-foreground hover:bg-accent hover:text-foreground flex size-8 shrink-0 items-center justify-center rounded-full"
                >
                  <X className="size-4" />
                </Dialog.Close>
              </div>

              {editing ? (
                <div className="flex flex-col gap-4 overflow-y-auto px-6 pb-5">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="inquiry-edit-subject">Subject</Label>
                    <Input
                      id="inquiry-edit-subject"
                      name="subject"
                      defaultValue={inquiry.subject ?? ""}
                      maxLength={200}
                      key={`subject-${inquiry.id}`}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="inquiry-edit-message">Message</Label>
                    <textarea
                      id="inquiry-edit-message"
                      name="message"
                      defaultValue={inquiry.message}
                      maxLength={4000}
                      key={`message-${inquiry.id}`}
                      className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 min-h-32 w-full rounded-md border px-3 py-2 text-sm whitespace-pre-wrap outline-none focus-visible:ring-3"
                    />
                  </div>
                </div>
              ) : (
                <div className="text-foreground/85 overflow-y-auto px-6 pb-5 text-sm leading-relaxed whitespace-pre-wrap">
                  {inquiry.message}
                </div>
              )}

              <div className="border-border bg-background/60 flex flex-col gap-2 border-t px-6 py-4 sm:flex-row sm:items-center">
                {editing ? (
                  <>
                    <Button
                      variant="ghost"
                      className="w-full sm:w-auto"
                      onClick={onCancelEdit}
                      disabled={pending}
                    >
                      Cancel
                    </Button>
                    <Button
                      className="w-full sm:ml-auto sm:w-auto"
                      disabled={pending}
                      onClick={() => {
                        const subjectEl = document.getElementById(
                          "inquiry-edit-subject",
                        ) as HTMLInputElement | null;
                        const messageEl = document.getElementById(
                          "inquiry-edit-message",
                        ) as HTMLTextAreaElement | null;
                        const subject = subjectEl?.value.trim() ?? "";
                        onSave({
                          subject: subject ? subject : null,
                          message: messageEl?.value ?? "",
                        });
                      }}
                    >
                      <Save className="size-3.5" />{" "}
                      {pending ? "Saving…" : "Save changes"}
                    </Button>
                  </>
                ) : (
                  <>
                    {renderExtraActions ? (
                      <div className="flex flex-wrap gap-2">
                        {renderExtraActions(inquiry)}
                      </div>
                    ) : null}
                    {showEdit ? (
                      <Button
                        variant="ghost"
                        className="w-full sm:w-auto"
                        onClick={onToggleEdit}
                      >
                        <Pencil className="size-3.5" /> Edit
                      </Button>
                    ) : null}
                    {showResolve ? (
                      <Button
                        variant="brand"
                        className="w-full sm:ml-auto sm:w-auto"
                        onClick={() => onResolveClick(inquiry)}
                      >
                        Mark resolved
                      </Button>
                    ) : null}
                  </>
                )}
              </div>
            </>
          ) : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

> Implementation note for the worker: reading the field values via `document.getElementById` on Save keeps the dialog stateless (uncontrolled inputs keyed by inquiry id). This is intentional and avoids set-state-in-effect lint violations. If you prefer controlled inputs, lift `subject`/`message` to `InquiryList` state seeded on entering edit mode — but do **not** seed via `useEffect`.

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm run lint`
Expected: no errors. (If `Label` is unused because you chose controlled inputs, remove the import.)

- [ ] **Step 3: Commit**

```bash
git add src/features/inquiries/components/inquiry-detail-dialog.tsx
git commit -m "feat: inquiry detail dialog with edit mode"
```

---

## Task 6: `InquiryList` orchestrator

**Files:**

- Create: `src/features/inquiries/components/inquiry-list.tsx`

> Faithfulness note: toolbar = search Input (left, grows) + segmented status control + result count; uniform 2-col grid (`sm:grid-cols-2`, 1 col mobile); centered pager. Owns dialog/edit/confirm UI state; mutations are delegated to `onResolve`/`onSaveEdit` props (returning `Promise<boolean>` success). Resolve from a card opens the confirm directly; resolve from the detail dialog closes the dialog first, then opens the confirm.

- [ ] **Step 1: Write the component**

```tsx
// src/features/inquiries/components/inquiry-list.tsx
"use client";

import * as React from "react";
import { Search } from "lucide-react";

import { EmptyState } from "@/components/feedback/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { InquiryRow } from "@/features/inquiries/inquiry-actions";
import {
  filterInquiries,
  paginate,
  sortByRecency,
  type StatusFilter,
} from "@/features/inquiries/inquiry-list";

import { InquiryCard } from "./inquiry-card";
import { InquiryDetailDialog } from "./inquiry-detail-dialog";

const PAGE_SIZE = 8;

export function InquiryList({
  inquiries,
  editable,
  newLabel,
  searchPlaceholder,
  emptyTitle,
  renderIdentity,
  renderExtraActions,
  onResolve,
  onSaveEdit,
}: {
  inquiries: InquiryRow[];
  editable: boolean;
  newLabel: string;
  searchPlaceholder: string;
  emptyTitle: string;
  renderIdentity?: (inquiry: InquiryRow) => React.ReactNode;
  renderExtraActions?: (inquiry: InquiryRow) => React.ReactNode;
  onResolve: (id: string) => Promise<boolean>;
  onSaveEdit?: (
    id: string,
    patch: { subject: string | null; message: string },
  ) => Promise<boolean>;
}) {
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState<StatusFilter>("all");
  const [page, setPage] = React.useState(1);

  const [openId, setOpenId] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState(false);
  const [confirmId, setConfirmId] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const filtered = filterInquiries(sortByRecency(inquiries), query, status);
  const view = paginate(filtered, page, PAGE_SIZE);

  const openInquiry = openId
    ? (inquiries.find((i) => i.id === openId) ?? null)
    : null;

  const statuses: { key: StatusFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "new", label: newLabel },
    { key: "resolved", label: "Resolved" },
  ];

  function changeQuery(value: string) {
    setQuery(value);
    setPage(1);
  }
  function changeStatus(next: StatusFilter) {
    setStatus(next);
    setPage(1);
  }

  function requestResolve(inquiry: InquiryRow) {
    setOpenId(null);
    setEditing(false);
    setConfirmId(inquiry.id);
  }

  async function confirmResolve() {
    if (!confirmId) return;
    setPending(true);
    const ok = await onResolve(confirmId);
    setPending(false);
    if (ok) setConfirmId(null);
  }

  function openForEdit(inquiry: InquiryRow) {
    setOpenId(inquiry.id);
    setEditing(true);
  }

  async function saveEdit(patch: { subject: string | null; message: string }) {
    if (!openId || !onSaveEdit) return;
    setPending(true);
    const ok = await onSaveEdit(openId, patch);
    setPending(false);
    if (ok) setEditing(false);
  }

  if (inquiries.length === 0) {
    return <EmptyState title={emptyTitle} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => changeQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="pl-9"
            aria-label="Search inquiries"
          />
        </div>
        <div
          role="group"
          aria-label="Filter by status"
          className="bg-muted border-border inline-flex gap-1 rounded-md border p-1"
        >
          {statuses.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              aria-pressed={status === key}
              onClick={() => changeStatus(key)}
              className={cn(
                "rounded px-3 py-1.5 text-sm font-medium transition-colors",
                status === key
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="text-muted-foreground text-sm sm:ml-auto">
          {filtered.length} {filtered.length === 1 ? "inquiry" : "inquiries"}
        </span>
      </div>

      {view.items.length === 0 ? (
        <EmptyState title="No inquiries match your search." />
      ) : (
        <ul className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          {view.items.map((inquiry) => (
            <li key={inquiry.id}>
              <InquiryCard
                inquiry={inquiry}
                editable={editable}
                newLabel={newLabel}
                renderIdentity={renderIdentity}
                renderExtraActions={renderExtraActions}
                onOpen={(i) => {
                  setOpenId(i.id);
                  setEditing(false);
                }}
                onEditClick={openForEdit}
                onResolveClick={requestResolve}
              />
            </li>
          ))}
        </ul>
      )}

      {view.pageCount > 1 ? (
        <nav
          aria-label="Pagination"
          className="flex items-center justify-center gap-1.5"
        >
          <button
            type="button"
            disabled={view.page <= 1}
            onClick={() => setPage(view.page - 1)}
            className="border-border bg-card hover:bg-accent disabled:hover:bg-card h-9 rounded-md border px-3 text-sm disabled:opacity-40"
          >
            ‹ Prev
          </button>
          {Array.from({ length: view.pageCount }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              aria-current={n === view.page ? "page" : undefined}
              onClick={() => setPage(n)}
              className={cn(
                "border-border h-9 min-w-9 rounded-md border px-2 text-sm",
                n === view.page
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card hover:bg-accent",
              )}
            >
              {n}
            </button>
          ))}
          <button
            type="button"
            disabled={view.page >= view.pageCount}
            onClick={() => setPage(view.page + 1)}
            className="border-border bg-card hover:bg-accent disabled:hover:bg-card h-9 rounded-md border px-3 text-sm disabled:opacity-40"
          >
            Next ›
          </button>
        </nav>
      ) : null}

      <InquiryDetailDialog
        inquiry={openInquiry}
        editing={editing}
        editable={editable}
        pending={pending}
        renderExtraActions={renderExtraActions}
        onOpenChange={(open) => {
          if (!open) {
            setOpenId(null);
            setEditing(false);
          }
        }}
        onResolveClick={requestResolve}
        onStartEdit={() => setEditing(true)}
        onCancelEdit={() => setEditing(false)}
        onSave={saveEdit}
      />

      <ConfirmDialog
        open={confirmId !== null}
        title="Mark this inquiry resolved?"
        description="This tells Cal you no longer need a reply. This can't be undone."
        confirmLabel="Yes, mark resolved"
        pending={pending}
        onConfirm={confirmResolve}
        onOpenChange={(open) => {
          if (!open) setConfirmId(null);
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/features/inquiries/components/inquiry-list.tsx
git commit -m "feat: inquiry list orchestrator with search and pagination"
```

---

## Task 7: Account page + wrapper + nav entry

**Files:**

- Create: `src/app/(account)/account/inquiries/page.tsx`
- Create: `src/app/(account)/account/inquiries/_components/account-inquiries-client.tsx`
- Modify: `src/components/layout/nav-config.ts`

- [ ] **Step 1: Add the nav entry**

In `src/components/layout/nav-config.ts`, add to `accountNav.items` after the Bookings entry:

```ts
    { href: "/account/inquiries", label: "Inquiries" },
```

- [ ] **Step 2: Write the account wrapper**

```tsx
// src/app/(account)/account/inquiries/_components/account-inquiries-client.tsx
"use client";

import { useState } from "react";

import { useToast } from "@/components/feedback/toast";
import { InquiryList } from "@/features/inquiries/components/inquiry-list";
import {
  editMyInquiry,
  resolveMyInquiry,
  type InquiryRow,
} from "@/features/inquiries/inquiry-actions";

export function AccountInquiriesClient({
  initialInquiries,
}: {
  initialInquiries: InquiryRow[];
}) {
  const toast = useToast();
  const [inquiries, setInquiries] = useState(initialInquiries);

  function patch(id: string, fields: Partial<InquiryRow>) {
    setInquiries((prev) =>
      prev.map((inquiry) =>
        inquiry.id === id ? { ...inquiry, ...fields } : inquiry,
      ),
    );
  }

  async function onResolve(id: string): Promise<boolean> {
    const result = await resolveMyInquiry(id);
    if (result.kind === "success") {
      patch(id, { status: "resolved", resolved_at: new Date().toISOString() });
      toast.add({ title: "Marked resolved" });
      return true;
    }
    toast.add({ title: "Could not update the inquiry." });
    return false;
  }

  async function onSaveEdit(
    id: string,
    next: { subject: string | null; message: string },
  ): Promise<boolean> {
    const result = await editMyInquiry(id, {
      subject: next.subject ?? "",
      message: next.message,
    });
    if (result.kind === "success") {
      patch(id, { subject: next.subject, message: next.message });
      toast.add({ title: "Inquiry updated" });
      return true;
    }
    toast.add({
      title:
        result.kind === "error" ? result.message : "Could not save changes.",
    });
    return false;
  }

  return (
    <InquiryList
      inquiries={inquiries}
      editable
      newLabel="Open"
      searchPlaceholder="Search your inquiries…"
      emptyTitle="No inquiries yet."
      onResolve={onResolve}
      onSaveEdit={onSaveEdit}
    />
  );
}
```

- [ ] **Step 3: Write the account page**

```tsx
// src/app/(account)/account/inquiries/page.tsx
import { redirect } from "next/navigation";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import type { InquiryRow } from "@/features/inquiries/inquiry-actions";
import { createClient } from "@/lib/supabase/server";

import { AccountInquiriesClient } from "./_components/account-inquiries-client";

export default async function AccountInquiriesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("inquiries")
    .select(
      "id, client_id, name, email, phone, subject, message, status, replied_at, resolved_at, created_at",
    )
    .eq("client_id", user.id)
    .order("created_at", { ascending: false });

  const inquiries = (data ?? []) as InquiryRow[];

  return (
    <PageContainer width="app">
      <PageHeader
        title="Your inquiries"
        subtitle="Messages you've sent to Cal. Mark one resolved once you no longer need a reply."
      />
      <AccountInquiriesClient initialInquiries={inquiries} />
    </PageContainer>
  );
}
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 5: Manual smoke (dev server)**

Run: `npm run dev`, sign in as an **approved** client, visit `/account/inquiries`. Expected: the Inquiries tab appears in the account sidebar; the page lists your inquiries (or the empty state); search/filter/pager work; clicking a tile opens the popup; Edit (on an unanswered new inquiry) → save persists; Resolve → confirm → tile flips to Resolved.

- [ ] **Step 6: Commit**

```bash
git add src/app/(account)/account/inquiries src/components/layout/nav-config.ts
git commit -m "feat: account inquiries tab"
```

---

## Task 8: Restructure the admin inquiries view

**Files:**

- Modify (rewrite): `src/app/(admin)/admin/inquiries/_components/inquiries-client.tsx`

> The admin page (`page.tsx`) already passes `initialInquiries`; leave it untouched. The wrapper below preserves all existing admin functionality — reply via Email/Text (stamping `replied_at`), View client link, Mark resolved — but supplies `editable={false}` so the shared dialog/card never offer client edit.

- [ ] **Step 1: Rewrite the admin wrapper**

```tsx
// src/app/(admin)/admin/inquiries/_components/inquiries-client.tsx
"use client";

import Link from "next/link";
import { useState } from "react";

import { useToast } from "@/components/feedback/toast";
import { buttonVariants } from "@/components/ui/button";
import { InquiryList } from "@/features/inquiries/components/inquiry-list";
import {
  markInquiryResolved,
  stampInquiryReplied,
  type InquiryRow,
} from "@/features/inquiries/inquiry-actions";
import {
  mailtoUrl,
  replyBody,
  replySubject,
  smsUrl,
} from "@/features/inquiries/reply-draft";

export function InquiriesClient({
  initialInquiries,
}: {
  initialInquiries: InquiryRow[];
}) {
  const toast = useToast();
  const [inquiries, setInquiries] = useState(initialInquiries);

  function patch(id: string, fields: Partial<InquiryRow>) {
    setInquiries((prev) =>
      prev.map((inquiry) =>
        inquiry.id === id ? { ...inquiry, ...fields } : inquiry,
      ),
    );
  }

  async function onResolve(id: string): Promise<boolean> {
    const result = await markInquiryResolved(id);
    if (result.kind === "success") {
      patch(id, { status: "resolved", resolved_at: new Date().toISOString() });
      toast.add({ title: "Marked resolved" });
      return true;
    }
    toast.add({ title: "Could not update the inquiry." });
    return false;
  }

  function onReply(inquiry: InquiryRow) {
    if (inquiry.replied_at) return;
    void stampInquiryReplied(inquiry.id).then((result) => {
      if (result.kind === "success") {
        patch(inquiry.id, { replied_at: new Date().toISOString() });
      }
    });
  }

  function renderIdentity(inquiry: InquiryRow) {
    return (
      <>
        <span className="text-foreground font-semibold">{inquiry.name}</span>
        {" · "}
        {inquiry.email}
      </>
    );
  }

  function renderExtraActions(inquiry: InquiryRow) {
    const subject = replySubject(inquiry);
    const body = replyBody(inquiry);
    return (
      <>
        <a
          href={mailtoUrl(inquiry.email, subject, body)}
          className={buttonVariants({ variant: "brand", size: "sm" })}
          onClick={() => onReply(inquiry)}
        >
          Email
        </a>
        {inquiry.phone ? (
          <a
            href={smsUrl(inquiry.phone, body)}
            className={buttonVariants({ variant: "outline", size: "sm" })}
            onClick={() => onReply(inquiry)}
          >
            Text
          </a>
        ) : null}
        {inquiry.client_id ? (
          <Link
            href={`/admin/clients/${inquiry.client_id}`}
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            View client
          </Link>
        ) : null}
      </>
    );
  }

  return (
    <InquiryList
      inquiries={inquiries}
      editable={false}
      newLabel="New"
      searchPlaceholder="Search by name, email, or text…"
      emptyTitle="No inquiries yet."
      renderIdentity={renderIdentity}
      renderExtraActions={renderExtraActions}
      onResolve={onResolve}
    />
  );
}
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm run lint`
Expected: no errors (the old `EmptyState`, `Badge`, `denver`, `useTransition` imports are gone with the rewrite — confirm no unused-import lint warnings remain).

- [ ] **Step 3: Manual smoke (dev server)**

Run: `npm run dev`, sign in as admin, visit `/admin/inquiries`. Expected: same list now with search/filter/pager + uniform tiles; tiles show client name/email; clicking opens the popup with Email/Text/View-client + Mark resolved (no Edit); resolve confirm works; Email/Text stamp "replied".

- [ ] **Step 4: Commit**

```bash
git add src/app/(admin)/admin/inquiries/_components/inquiries-client.tsx
git commit -m "refactor: admin inquiries view reuses shared inquiry components"
```

---

## Task 9: Docs (same-commit rule)

**Files:**

- Modify: `docs/DESIGN.md`

- [ ] **Step 1: Register the route**

In `docs/DESIGN.md`, find the routes/pages section (search for `/account/bookings` or the account routes list) and add an entry for the new page, matching the surrounding format, e.g.:

```
- `/account/inquiries` — client's own inquiries: searchable, paginated list; read/edit (while unanswered)/resolve in a popup. Shares components with `/admin/inquiries`.
```

If `DESIGN.md` documents the admin inquiries page, update that line to note it now shares the `src/features/inquiries/components/` set.

- [ ] **Step 2: Verify formatting**

Run: `npm run format:check`
Expected: passes (run `npm run format` if it flags `DESIGN.md`).

- [ ] **Step 3: Commit**

```bash
git add docs/DESIGN.md
git commit -m "docs: register account inquiries route"
```

---

## Task 10: Full verification pass

- [ ] **Step 1: Typecheck, lint, unit tests, build**

Run: `npm run typecheck && npm run lint && npx vitest run src/features/inquiries/inquiry-list.test.ts && npm run build`
Expected: all green; build succeeds.

- [ ] **Step 2: Integration tests (maintainer, local Supabase)**

Run (with local stack up + `.env.test`): `npx vitest run src/features/inquiries/inquiry-client-actions.test.ts`
Expected: all PASS.

- [ ] **Step 3: Visual fidelity check against the mockup**

Open [docs/mockups/inquiries.html](../../mockups/inquiries.html) beside the running app (`/account/inquiries` and `/admin/inquiries`, desktop + a mobile viewport). Confirm: uniform tiles, 1-line subject / 3-line body clamps, no text overflow, scrollable popup body, resolve-confirm flow, mobile tiles have no buttons + bottom-sheet popup carries all actions, admin Email/Text/View-client present and edit absent.

---

## Self-Review (completed by plan author)

**Spec coverage:** sidebar tab (T7) · list of account's inquiries (T7 page query) · text wrapping/clamp + overflow fix (T4 card, T5 dialog) · pagination (T1+T6) · search filter (T1+T6) · recency sort (T1+T6) · uniform fixed-size tiles (T4) · clickable tile → popup (T4+T5+T6) · resolve w/ confirm, irreversible (T3+T6, cores T2) · resolve from popup closes popup then confirm (T6 `requestResolve`) · resolve from list → confirm directly (T6) · edit mode + save (T2 core, T5 dialog, T6 wiring) · edit from popup toggles Edit→Save (T5) · edit from list opens popup in edit mode (T4 `onEditClick` → T6 `openForEdit`) · admin restructured, no client-edit (T8) · admin reply Email/Text (T8) · admin View client (T8) · modular shared components (T3–T6) · mobile parity + actions-in-popup (T4 `hidden sm:flex`, T5 bottom sheet) · edit lock once replied/resolved (T1 `canEditInquiry`, enforced T2).

**Placeholder scan:** none — every code step is complete.

**Type consistency:** `InquiryRow` reused throughout; `onResolve: (id) => Promise<boolean>` and `onSaveEdit: (id, {subject,message}) => Promise<boolean>` consistent across card/dialog/list/wrappers; `StatusFilter`, `canEditInquiry`, `formatInquiryDate`, `paginate` signatures match their Task-1 definitions; `editInquirySchema`/`EditInquiryInput` consistent between schema and actions.

---

_Last reviewed: 2026-06-09_
