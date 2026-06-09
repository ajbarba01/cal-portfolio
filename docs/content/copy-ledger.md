# Copy Ledger

> Per-ID tracking that bridges `docs/content/cal-source.md` (authority) and `src/content/marketing.ts` (render target). Drives the copy-sync diff. See `docs/CONTENT.md` for the protocol.

## How to read an entry

- `status`: `placeholder` | `placed` | `changed` | `drift` | `flagged`
- `provenance`: `cal-verbatim` | `cal-confirmed-edit` | `agent-resolved` | `public-fact` | `placeholder`
- `applied-from`: the exact `cal-source` text that produced the current live string (diff anchor).
- `live-text`: the string currently in `marketing.ts`. Differs from `applied-from` only by the listed `transforms`.
- `transforms`: confirmed adaptations (capitalization/punctuation, resolved action items, Cal-approved grammar).

## Entries

### example.id.slot

- status: placeholder
- provenance: placeholder
- consumed-by: -
- applied-from: |
  -
- live-text: |
  -
- transforms: none
- notes: example entry; remove when real entries exist
