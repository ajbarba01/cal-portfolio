// src/app/opengraph-image.tsx
import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "Cal Barba — Dog Walking & House Sitting";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Mirror of Trail palette tokens (ImageResponse can't read CSS vars).
const SAND_50 = "#faf6f0";
const SAND_900 = "#2b2520";
const CLAY = "#ae5a35";

export default function OgImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "80px",
        backgroundColor: SAND_50,
      }}
    >
      <div style={{ fontSize: 80, fontWeight: 700, color: SAND_900 }}>
        Cal Barba
      </div>
      <div style={{ fontSize: 36, color: CLAY, marginTop: 20 }}>
        Dog Walking · House Sitting · Front Range, Colorado
      </div>
    </div>,
    { ...size },
  );
}
