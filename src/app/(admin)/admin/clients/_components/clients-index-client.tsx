"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/feedback/empty-state";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { ClientListRow } from "@/features/admin/clients-actions";
import { matchesClientQuery } from "@/features/admin/client-search";

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function ClientsIndexClient({ clients }: { clients: ClientListRow[] }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(
    () => clients.filter((client) => matchesClientQuery(client, query)),
    [clients, query],
  );

  return (
    <div className="flex flex-col gap-4">
      <Input
        type="search"
        placeholder="Search name, email, or phone..."
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className="max-w-sm"
        aria-label="Search clients"
      />
      {filtered.length === 0 ? (
        <EmptyState title="No clients match your search." />
      ) : (
        <>
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-sm">
              <thead className="text-muted-foreground border-border border-b text-left">
                <tr>
                  <th className="py-2 pr-4 font-medium">Name</th>
                  <th className="py-2 pr-4 font-medium">Contact</th>
                  <th className="py-2 pr-4 font-medium">Pets</th>
                  <th className="py-2 pr-4 font-medium">Bookings</th>
                  <th className="py-2 pr-4 font-medium">Balance</th>
                  <th className="py-2 font-medium">Onboarded</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((client) => (
                  <tr key={client.id} className="border-border/60 border-b">
                    <td className="py-2 pr-4">
                      <Link
                        href={`/admin/clients/${client.id}`}
                        className="text-brand-strong font-medium underline-offset-2 hover:underline"
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
                    <td className="py-2">
                      {client.onboardingComplete ? "Yes" : "No"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="flex flex-col gap-2 sm:hidden">
            {filtered.map((client) => (
              <li
                key={client.id}
                className="bg-card border-border rounded-xl border p-3"
              >
                <Link
                  href={`/admin/clients/${client.id}`}
                  className="text-brand-strong font-medium"
                >
                  {client.full_name ?? client.email ?? "(no name)"}
                </Link>
                <p className="text-muted-foreground text-xs">
                  {client.email ?? "-"}
                  {client.phone ? ` · ${client.phone}` : ""}
                </p>
                <div className="mt-1 flex flex-wrap gap-2 text-xs">
                  <Badge>{client.petCount} pets</Badge>
                  <Badge>{client.bookingCount} bookings</Badge>
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
