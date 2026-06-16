// src/app/manifest.ts
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cal Barba — Pet Care",
    short_name: "Cal Barba",
    description: "Dog walking and house sitting across Colorado's Front Range.",
    start_url: "/",
    display: "browser",
    background_color: "#faf6f0", // sand-50
    theme_color: "#ae5a35", // clay-fill
    // Icons intentionally omitted until the brand mark is finalized.
    icons: [],
  };
}
