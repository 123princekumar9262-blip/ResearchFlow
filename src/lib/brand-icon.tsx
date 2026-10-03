import { ImageResponse } from "next/og";

/**
 * The ResearchFlow mark as a PNG: an indigo tile with a rising check and a
 * dot. `bleed` fills the whole square for maskable home-screen icons.
 */
export function brandIcon(size: number, { bleed = false }: { bleed?: boolean } = {}) {
  const inset = bleed ? 0 : Math.round(size * 0.04);
  const radius = bleed ? 0 : Math.round(size * 0.24);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "transparent" }}>
        <div
          style={{
            width: size - inset * 2,
            height: size - inset * 2,
            borderRadius: radius,
            background: "#4F46E5",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg width={size * (bleed ? 0.5 : 0.62)} height={size * (bleed ? 0.5 : 0.62)} viewBox="0 0 24 24">
            <path d="M5 16.5 10 11l3.2 3.2L19 7.5" fill="none" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="19" cy="7.5" r="2" fill="white" />
          </svg>
        </div>
      </div>
    ),
    { width: size, height: size },
  );
}
