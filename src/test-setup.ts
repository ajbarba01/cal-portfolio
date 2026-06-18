/**
 * Vitest global setup file.
 * Loads .env.test so integration tests can reach the local Supabase stack.
 * The cloud project keys in .env.local are intentionally NOT loaded here.
 */
import { config } from "dotenv";
import path from "path";
import "@testing-library/jest-dom/vitest";

config({ path: path.resolve(process.cwd(), ".env.test") });
