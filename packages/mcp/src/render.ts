import type { Element, WireSchema } from "@wboard/core";

/**
 * The pluggable screenshot seam. The protocol carries no presentation, so no
 * generic renderer can draw a host's true visual — a host with real presentation
 * semantics (Rennet) injects its own. A renderer needs only the schema and the
 * projected elements, exactly what the service exposes. Returns the image bytes
 * base64-encoded with their mime type (the wire `ScreenshotResponse` shape).
 */
export type BoardRenderer = (
  schema: WireSchema,
  elements: ReadonlyMap<string, Element>,
) => Promise<{ mime_type: string; base64: string }>;

/** XML text/attribute escaping — the five predefined entities. */
function esc(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/** A data value as a single-line string: objects/arrays as compact JSON,
 * primitives as their string form. */
function formatValue(value: unknown): string {
  return value !== null && typeof value === "object" ? JSON.stringify(value) : String(value);
}

const CARD_WIDTH = 260;
const LINE_HEIGHT = 16;
const CARD_PAD = 8;
const GAP = 12;
const MARGIN = 16;
const KIND_HEADER = 22;

/**
 * The shipped default renderer: a deterministic, dependency-free schematic SVG.
 * Elements are grouped by kind (kinds and, within a kind, element ids both
 * sorted) so the same projection always yields byte-identical output regardless
 * of log/iteration order. Each element is one card listing its id, kind, and
 * `data` key/values — everything XML-escaped. It always answers, so the
 * `screenshot` tool never fails for lack of a host renderer.
 */
export const schematicRenderer: BoardRenderer = async (_schema, elements) => {
  const byKind = new Map<string, Element[]>();
  for (const el of elements.values()) {
    const bucket = byKind.get(el.kind);
    if (bucket) bucket.push(el);
    else byKind.set(el.kind, [el]);
  }
  const kinds = [...byKind.keys()].sort();

  const blocks: string[] = [];
  let y = MARGIN;

  for (const kind of kinds) {
    const group = byKind.get(kind);
    if (!group) continue;
    const items = [...group].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

    blocks.push(
      `<text x="${MARGIN}" y="${y + 14}" font-family="monospace" font-size="14" font-weight="bold" fill="#222">${esc(kind)} (${items.length})</text>`,
    );
    y += KIND_HEADER;

    for (const el of items) {
      const entries = Object.entries(el.data);
      const cardHeight = CARD_PAD * 2 + LINE_HEIGHT * (1 + entries.length);
      blocks.push(
        `<rect x="${MARGIN}" y="${y}" width="${CARD_WIDTH}" height="${cardHeight}" rx="6" fill="#fff" stroke="#bbb"/>`,
      );
      let ty = y + CARD_PAD + 12;
      blocks.push(
        `<text x="${MARGIN + CARD_PAD}" y="${ty}" font-family="monospace" font-size="12" font-weight="bold" fill="#111">${esc(el.id)} · ${esc(el.kind)}</text>`,
      );
      for (const [key, value] of entries) {
        ty += LINE_HEIGHT;
        blocks.push(
          `<text x="${MARGIN + CARD_PAD}" y="${ty}" font-family="monospace" font-size="11" fill="#444">${esc(key)}: ${esc(formatValue(value))}</text>`,
        );
      }
      y += cardHeight + GAP;
    }
  }

  const width = CARD_WIDTH + MARGIN * 2;
  const height = Math.max(y + MARGIN, MARGIN * 2 + KIND_HEADER);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#f5f4f0"/>${blocks.join("")}</svg>`;

  return { mime_type: "image/svg+xml", base64: Buffer.from(svg, "utf8").toString("base64") };
};
