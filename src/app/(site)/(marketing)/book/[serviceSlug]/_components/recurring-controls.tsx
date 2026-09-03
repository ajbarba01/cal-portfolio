/**
 * TEMPORARY re-export. `RecurringControls` now lives in the booking feature;
 * this file keeps the old route-local path resolving so the tree stays
 * buildable until service-booking-client.tsx is repointed at
 * `@/features/booking/index.client`. Delete it with that repoint — it is the
 * last importer.
 */
export { RecurringControls } from "@/features/booking/index.client";
