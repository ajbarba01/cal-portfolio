/**
 * Scenario buckets group the Health resources by *when* they matter, driving the
 * filter on /resources. Editorial classification (Cal's call to refine):
 * Emergency = act now; Seasonal = warm-weather / Colorado-specific; Everyday =
 * always worth knowing. Tag + label are structural metadata, not copy — they
 * live here, not in marketing.ts (which owns Cal's prose only).
 *
 * Shared by the server page (which renders the tags) and the client filter
 * island, so neither imports the other.
 */
export type Scenario = "emergency" | "seasonal" | "everyday";

export const SCENARIO_LABEL: Record<Scenario, string> = {
  emergency: "Emergency",
  seasonal: "Seasonal",
  everyday: "Everyday",
};
