/** Client-side search predicate for the admin clients index. Pure. */

export interface ClientSearchable {
  full_name: string | null;
  email: string | null;
  phone: string | null;
}

/** True if query (trimmed, case-insensitive) is a substring of any field. */
export function matchesClientQuery(
  client: ClientSearchable,
  query: string,
): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery === "") return true;

  return [client.full_name, client.email, client.phone].some(
    (field) =>
      typeof field === "string" &&
      field.toLowerCase().includes(normalizedQuery),
  );
}
