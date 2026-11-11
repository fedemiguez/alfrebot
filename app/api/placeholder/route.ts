
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const name = searchParams.get("name") ?? "pieza";
  const label = name.slice(0, 28);
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#F2E6E2"/>
      <stop offset="100%" stop-color="#E7D5CE"/>
    </linearGradient>
  </defs>
  <rect width="800" height="800" fill="url(#g)"/>
  <circle cx="400" cy="340" r="140" fill="#9A3412" opacity="0.18"/>
  <text x="400" y="560" text-anchor="middle" font-family="Georgia, serif" font-size="36" fill="#9A3412">${escapeXml(label)}</text>
  <text x="400" y="610" text-anchor="middle" font-family="sans-serif" font-size="22" fill="#475569">alfrebot · foto de prueba</text>
</svg>`;

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
