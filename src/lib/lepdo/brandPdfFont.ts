/* LEPDO brand font for PDF exports: Inter (subset TTFs in /public/fonts).
   Falls back to the built-in Helvetica if the font files cannot be loaded. */
let brandFontCache: { regular: string; bold: string } | null | undefined;
async function loadTtf(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`font ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
export async function applyBrandFont(doc: {
  addFileToVFS: (n: string, d: string) => unknown;
  addFont: (f: string, n: string, s: string) => unknown;
}): Promise<string> {
  try {
    if (brandFontCache === undefined) {
      const [regular, bold] = await Promise.all([
        loadTtf("/fonts/Inter-Regular.ttf"),
        loadTtf("/fonts/Inter-Bold.ttf"),
      ]);
      brandFontCache = { regular, bold };
    }
    if (!brandFontCache) return "helvetica";
    doc.addFileToVFS("Inter-Regular.ttf", brandFontCache.regular);
    doc.addFont("Inter-Regular.ttf", "Inter", "normal");
    doc.addFileToVFS("Inter-Bold.ttf", brandFontCache.bold);
    doc.addFont("Inter-Bold.ttf", "Inter", "bold");
    return "Inter";
  } catch {
    brandFontCache = null;
    return "helvetica";
  }
}
