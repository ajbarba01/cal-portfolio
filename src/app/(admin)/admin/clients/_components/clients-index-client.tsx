"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, ChevronUp } from "lucide-react";

import { EmptyState } from "@/components/feedback/empty-state";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  applyClientFilter,
  matchesClientQuery,
  OnboardingStatusSelect,
  sortClients,
  type ClientFilter,
  type ClientListRow,
  type ClientSortKey,
  type SortDir,
} from "@/features/admin";
import { cn } from "@/lib/utils";

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

const FILTER_CHIPS: { label: string; value: ClientFilter; warn?: boolean }[] = [
  { label: "All", value: "all" },
  { label: "Owing", value: "owing", warn: true },
  { label: "Needs onboarding", value: "needs_onboarding" },
  { label: "Active", value: "active" },
];

type SortState = { key: ClientSortKey; dir: SortDir } | null;

function SortIcon({ dir }: { dir: SortDir }) {
  return dir === "asc" ? (
    <ChevronUp className="text-brand-strong ml-0.5 inline h-3 w-3" />
  ) : (
    <ChevronDown className="text-brand-strong ml-0.5 inline h-3 w-3" />
  );
}

function SortableHeader({
  label,
  sortKey,
  current,
  onSort,
}: {
  label: string;
  sortKey: ClientSortKey;
  current: SortState;
  onSort: (key: ClientSortKey) => void;
}) {
  const isActive = current?.key === sortKey;
  return (
    <th
      className="cursor-pointer py-2 pr-4 text-left font-medium select-none"
      onClick={() => onSort(sortKey)}
      aria-sort={
        isActive ? (current.dir === "asc" ? "ascending" : "descending") : "none"
      }
    >
      {label}
      {isActive && <SortIcon dir={current.dir} />}
    </th>
  );
}

export function ClientsIndexClient({ clients }: { clients: ClientListRow[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<ClientFilter>("all");
  const [sort, setSort] = useState<SortState>(null);

  function handleSort(key: ClientSortKey) {
    setSort((prev) => {
      if (prev?.key === key) {
        return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
      }
      return { key, dir: "asc" };
    });
  }

  const displayed = useMemo(() => {
    const filtered = applyClientFilter(clients, activeFilter);
    const searched = filtered.filter((c) => matchesClientQuery(c, query));
    return sort ? sortClients(searched, sort.key, sort.dir) : searched;
  }, [clients, activeFilter, query, sort]);

  function navigateToClient(id: string) {
    router.push(`/admin/clients/${id}`);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar: search + filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="search"
          placeholder="Search name, email, or phone..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="max-w-sm"
          aria-label="Search clients"
        />
        <div
          className="ml-auto flex flex-wrap gap-1.5"
          role="group"
          aria-label="Filter clients"
        >
          {FILTER_CHIPS.map((chip) => {
            const isActive = activeFilter === chip.value;
            return (
              <button
                key={chip.value}
                type="button"
                onClick={() => setActiveFilter(chip.value)}
                aria-pressed={isActive}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                  isActive && chip.warn
                    ? "border-destructive bg-destructive text-white"
                    : isActive
                      ? "border-brand bg-brand text-brand-foreground"
                      : "border-input bg-card text-muted-foreground hover:border-brand/40 hover:text-foreground",
                )}
              >
                {chip.label}
              </button>
            );
          })}
        </div>
      </div>

      {displayed.length === 0 ? (
        <EmptyState title="No clients match your search." />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-sm">
              <thead className="text-muted-foreground border-border border-b text-left">
                <tr>
                  <SortableHeader
                    label="Name"
                    sortKey="name"
                    current={sort}
                    onSort={handleSort}
                  />
                  <th className="py-2 pr-4 font-medium">Contact</th>
                  <th className="py-2 pr-4 font-medium">Pets</th>
                  <SortableHeader
                    label="Bookings"
                    sortKey="bookings"
                    current={sort}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="Balance"
                    sortKey="balance"
                    current={sort}
                    onSort={handleSort}
                  />
                  <th className="py-2 pr-4 font-medium">Onboarding</th>
                  {/* chevron column */}
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {displayed.map((client) => (
                  <tr
                    key={client.id}
                    className="border-border/60 hover:bg-muted cursor-pointer border-b transition-colors"
                    onClick={() => navigateToClient(client.id)}
                    // Keyboard: Enter navigates (the inner name <Link> handles Tab focus)
                    onKeyDown={(e) => {
                      if (e.key === "Enter") navigateToClient(client.id);
                    }}
                    tabIndex={0}
                    role="link"
                    aria-label={`View ${client.full_name ?? client.email ?? "client"}`}
                  >
                    <td className="py-2 pr-4">
                      {/* Real <Link> for a11y + middle-click; stops propagation so click doesn't double-navigate */}
                      <Link
                        href={`/admin/clients/${client.id}`}
                        className="text-brand-strong font-medium underline-offset-2 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {client.full_name ?? client.email ?? "(no name)"}
                      </Link>
                    </td>
                    <td className="text-muted-foreground py-2 pr-4">
                      {client.email ?? "-"}
                      {client.phone ? (
                        <span className="block">{client.phone}</span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-4">{client.petCount}</td>
                    <td className="py-2 pr-4">{client.bookingCount}</td>
                    <td className="py-2 pr-4">
                      {client.outstandingCents > 0 ? (
                        <span className="text-destructive font-medium">
                          {dollars(client.outstandingCents)}
                        </span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td
                      className="py-2 pr-4"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* stopPropagation: changing onboarding status must not trigger row navigation */}
                      <OnboardingStatusSelect
                        clientId={client.id}
                        status={client.onboardingStatus}
                        meetGreetUpcoming={client.meetGreetUpcoming}
                      />
                    </td>
                    <td className="text-muted-foreground py-2">
                      <ChevronRight className="h-4 w-4" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <ul className="flex flex-col gap-2 sm:hidden">
            {displayed.map((client) => (
              <li
                key={client.id}
                className="bg-card border-border hover:bg-muted cursor-pointer rounded-xl border p-3 transition-colors"
                onClick={() => navigateToClient(client.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") navigateToClient(client.id);
                }}
                tabIndex={0}
                role="link"
                aria-label={`View ${client.full_name ?? client.email ?? "client"}`}
              >
                <div className="flex items-center justify-between">
                  <Link
                    href={`/admin/clients/${client.id}`}
                    className="text-brand-strong font-medium"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {client.full_name ?? client.email ?? "(no name)"}
                  </Link>
                  <ChevronRight className="text-muted-foreground h-4 w-4 shrink-0" />
                </div>
                <p className="text-muted-foreground text-xs">
                  {client.email ?? "-"}
                  {client.phone ? ` · ${client.phone}` : ""}
                </p>
                <div
                  className="mt-1 flex flex-wrap gap-2 text-xs"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Badge>{client.petCount} pets</Badge>
                  <Badge>{client.bookingCount} bookings</Badge>
                  <OnboardingStatusSelect
                    clientId={client.id}
                    status={client.onboardingStatus}
                    meetGreetUpcoming={client.meetGreetUpcoming}
                  />
                  {client.outstandingCents > 0 ? (
                    <Badge variant="destructive">
                      {dollars(client.outstandingCents)} owed
                    </Badge>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
