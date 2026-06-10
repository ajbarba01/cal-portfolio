import { makeServiceClient } from "./client";
import { type Ctx, loadServices } from "./factories";
import { SCENARIOS } from "./scenarios";
import { printSummary } from "./summary";
import { wipe } from "./wipe";

async function main(): Promise<void> {
  const name = process.argv[2];
  if (!name || !(name in SCENARIOS)) {
    console.error(
      `Usage: npm run db:seed -- <scenario>\nScenarios: ${Object.keys(SCENARIOS).join(", ")}`,
    );
    process.exit(1);
  }
  const db = makeServiceClient();
  console.log(`Seeding "${name}" (wipe-first; services/settings untouched)…`);
  const adminId = await wipe(db);
  const ctx: Ctx = {
    db,
    now: new Date(),
    adminId,
    users: new Map(),
    pets: new Map(),
    bookings: new Map(),
    series: new Map(),
    services: new Map(),
  };
  await loadServices(ctx);
  for (const step of SCENARIOS[name]) {
    console.log(`  step: ${step.name}`);
    await step.run(ctx);
  }
  await printSummary(db);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
