import { ImageResponse } from "next/og";

/**
 * Social/OpenGraph card for Abode Alerts (WS15). Generated at build/request time
 * so there is no static binary asset to keep in sync. Next.js also serves this as
 * the Twitter card image via the file-based metadata convention.
 */
export const alt = "Abode Alerts — property monitoring for the 44224 Stow/Akron area";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "80px",
        background: "linear-gradient(135deg, #0f766e 0%, #134e4a 100%)",
        color: "#ffffff",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
        <svg width="64" height="64" viewBox="0 0 32 32" fill="none">
          <path
            d="M9 24V11l7-4 7 4v13M9 24h14M13 24v-5h6v5"
            stroke="#ffffff"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span style={{ fontSize: 40, fontWeight: 700, letterSpacing: "-0.02em" }}>
          Abode Alerts
        </span>
      </div>
      <div
        style={{
          marginTop: "32px",
          fontSize: 60,
          fontWeight: 800,
          lineHeight: 1.1,
          letterSpacing: "-0.03em",
          maxWidth: "900px",
        }}
      >
        Real listing ingestion and alerts for the 44224 Stow/Akron area
      </div>
      <div style={{ marginTop: "28px", fontSize: 28, color: "#99f6e4" }}>
        abode-alerts.vercel.app
      </div>
    </div>,
    { ...size },
  );
}
