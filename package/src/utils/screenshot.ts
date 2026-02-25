// =============================================================================
// Drawing Screenshots — zero-dependency DOM capture
// =============================================================================
//
// Renders the visible page region to canvas by walking the DOM:
// 1. Element backgrounds + borders (in DOM order = correct z-layering)
// 2. Images at full resolution
// 3. Text at exact browser-computed line positions (via Range.getClientRects)
// 4. Drawing strokes composited on top
//

type StrokeInput = Array<{
  points: Array<{ x: number; y: number }>;
  color: string;
  fixed: boolean;
}>;

/**
 * Capture a viewport region by rendering visible DOM elements to canvas.
 * Uses Range.getClientRects() for pixel-accurate text line positions.
 */
export function captureRegion(
  regionX: number,
  regionY: number,
  regionW: number,
  regionH: number,
  strokes: StrokeInput,
  padding = 32,
  maxDim = 600,
): string | null {
  try {
    const cx = Math.max(0, regionX - padding);
    const cy = Math.max(0, regionY - padding);
    const cw = regionW + padding * 2;
    const ch = regionH + padding * 2;
    const scale = Math.min(1, maxDim / Math.max(cw, ch));
    const outW = Math.round(cw * scale);
    const outH = Math.round(ch * scale);
    if (outW < 1 || outH < 1) return null;

    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // Hide agentation UI
    const root = document.querySelector("[data-agentation-root]") as HTMLElement | null;
    const prevVis = root?.style.visibility;
    if (root) root.style.visibility = "hidden";

    try {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, outW, outH);

      // Collect visible elements whose bounding rect overlaps the capture region
      // TreeWalker gives us DOM order (depth-first) = parents before children = correct paint order
      const els: HTMLElement[] = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
      let n: Node | null;
      while ((n = walker.nextNode())) {
        const el = n as HTMLElement;
        const r = el.getBoundingClientRect();
        if (r.right <= cx || r.left >= cx + cw || r.bottom <= cy || r.top >= cy + ch) continue;
        if (r.width === 0 && r.height === 0) continue;
        const s = getComputedStyle(el);
        if (s.display === "none" || s.visibility === "hidden") continue;
        els.push(el);
      }

      // --- Phase 1: Backgrounds + borders ---
      for (const el of els) {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        const rx = (r.left - cx) * scale;
        const ry = (r.top - cy) * scale;
        const rw = r.width * scale;
        const rh = r.height * scale;

        ctx.save();

        // Border radius
        const br = parseFloat(s.borderRadius) * scale || 0;
        if (br > 1) {
          ctx.beginPath();
          ctx.roundRect(rx, ry, rw, rh, Math.min(br, rw / 2, rh / 2));
          ctx.clip();
        }

        // Background
        const bg = s.backgroundColor;
        if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") {
          ctx.fillStyle = bg;
          ctx.fillRect(rx, ry, rw, rh);
        }

        // Border (simplified: uniform border)
        const bw = parseFloat(s.borderTopWidth) * scale || 0;
        if (bw >= 0.5) {
          const bc = s.borderTopColor;
          if (bc && bc !== "rgba(0, 0, 0, 0)" && bc !== "transparent") {
            ctx.strokeStyle = bc;
            ctx.lineWidth = bw;
            ctx.strokeRect(rx + bw / 2, ry + bw / 2, rw - bw, rh - bw);
          }
        }

        // Box shadow (basic single shadow)
        const shadow = s.boxShadow;
        if (shadow && shadow !== "none") {
          const m = shadow.match(/rgba?\([^)]+\)\s+([-\d.]+)px\s+([-\d.]+)px\s+([-\d.]+)px/);
          if (m) {
            ctx.shadowColor = m[0].split(")")[0] + ")";
            ctx.shadowOffsetX = parseFloat(m[1]) * scale;
            ctx.shadowOffsetY = parseFloat(m[2]) * scale;
            ctx.shadowBlur = parseFloat(m[3]) * scale;
            ctx.fillStyle = bg || "rgba(0,0,0,0)";
            ctx.fillRect(rx, ry, rw, rh);
            ctx.shadowColor = "transparent";
          }
        }

        ctx.restore();
      }

      // --- Phase 2: Images ---
      for (const el of els) {
        if (!(el instanceof HTMLImageElement)) continue;
        if (!el.complete || el.naturalWidth === 0) continue;
        const r = el.getBoundingClientRect();
        const rx = (r.left - cx) * scale;
        const ry = (r.top - cy) * scale;
        const rw = r.width * scale;
        const rh = r.height * scale;
        try {
          ctx.save();
          const br = parseFloat(getComputedStyle(el).borderRadius) * scale || 0;
          if (br > 1) {
            ctx.beginPath();
            ctx.roundRect(rx, ry, rw, rh, Math.min(br, rw / 2, rh / 2));
            ctx.clip();
          }
          ctx.drawImage(el, rx, ry, rw, rh);
          ctx.restore();
        } catch { /* CORS */ }
      }

      // --- Phase 2b: SVG icons (via Path2D) ---
      for (const el of els) {
        if (!(el instanceof SVGSVGElement)) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;

        // SVG viewBox → screen transform
        const vb = el.viewBox?.baseVal;
        const vbW = vb && vb.width ? vb.width : r.width;
        const vbH = vb && vb.height ? vb.height : r.height;
        const sx = (r.width / vbW) * scale;
        const sy = (r.height / vbH) * scale;
        const tx = (r.left - cx) * scale;
        const ty = (r.top - cy) * scale;

        // Walk SVG children for renderable shapes
        const svgEls = el.querySelectorAll("path, circle, rect, line, polyline, polygon, ellipse");
        for (const shape of svgEls) {
          const ss = getComputedStyle(shape);
          if (ss.display === "none" || ss.visibility === "hidden") continue;
          const fillColor = ss.fill;
          const strokeColor = ss.stroke;
          const hasFill = fillColor && fillColor !== "none" && fillColor !== "transparent";
          const hasStroke = strokeColor && strokeColor !== "none" && strokeColor !== "transparent";
          if (!hasFill && !hasStroke) continue;

          ctx.save();
          ctx.setTransform(sx, 0, 0, sy, tx, ty);

          const tag = shape.tagName.toLowerCase();
          if (tag === "path") {
            const d = shape.getAttribute("d");
            if (d) {
              try {
                const p2d = new Path2D(d);
                if (hasFill) { ctx.fillStyle = fillColor; ctx.fill(p2d); }
                if (hasStroke) {
                  ctx.strokeStyle = strokeColor;
                  ctx.lineWidth = (parseFloat(ss.strokeWidth) || 1);
                  ctx.lineCap = (ss.strokeLinecap as CanvasLineCap) || "round";
                  ctx.lineJoin = (ss.strokeLinejoin as CanvasLineJoin) || "round";
                  ctx.stroke(p2d);
                }
              } catch { /* invalid path */ }
            }
          } else if (tag === "circle") {
            const ccx = parseFloat(shape.getAttribute("cx") || "0");
            const ccy = parseFloat(shape.getAttribute("cy") || "0");
            const cr = parseFloat(shape.getAttribute("r") || "0");
            if (cr > 0) {
              ctx.beginPath();
              ctx.arc(ccx, ccy, cr, 0, Math.PI * 2);
              if (hasFill) { ctx.fillStyle = fillColor; ctx.fill(); }
              if (hasStroke) { ctx.strokeStyle = strokeColor; ctx.lineWidth = parseFloat(ss.strokeWidth) || 1; ctx.stroke(); }
            }
          } else if (tag === "ellipse") {
            const ecx = parseFloat(shape.getAttribute("cx") || "0");
            const ecy = parseFloat(shape.getAttribute("cy") || "0");
            const erx = parseFloat(shape.getAttribute("rx") || "0");
            const ery = parseFloat(shape.getAttribute("ry") || "0");
            if (erx > 0 && ery > 0) {
              ctx.beginPath();
              ctx.ellipse(ecx, ecy, erx, ery, 0, 0, Math.PI * 2);
              if (hasFill) { ctx.fillStyle = fillColor; ctx.fill(); }
              if (hasStroke) { ctx.strokeStyle = strokeColor; ctx.lineWidth = parseFloat(ss.strokeWidth) || 1; ctx.stroke(); }
            }
          } else if (tag === "rect") {
            const rx = parseFloat(shape.getAttribute("x") || "0");
            const ry = parseFloat(shape.getAttribute("y") || "0");
            const rw = parseFloat(shape.getAttribute("width") || "0");
            const rh = parseFloat(shape.getAttribute("height") || "0");
            if (rw > 0 && rh > 0) {
              if (hasFill) { ctx.fillStyle = fillColor; ctx.fillRect(rx, ry, rw, rh); }
              if (hasStroke) { ctx.strokeStyle = strokeColor; ctx.lineWidth = parseFloat(ss.strokeWidth) || 1; ctx.strokeRect(rx, ry, rw, rh); }
            }
          } else if (tag === "line") {
            const x1 = parseFloat(shape.getAttribute("x1") || "0");
            const y1 = parseFloat(shape.getAttribute("y1") || "0");
            const x2 = parseFloat(shape.getAttribute("x2") || "0");
            const y2 = parseFloat(shape.getAttribute("y2") || "0");
            if (hasStroke) {
              ctx.beginPath();
              ctx.moveTo(x1, y1);
              ctx.lineTo(x2, y2);
              ctx.strokeStyle = strokeColor;
              ctx.lineWidth = parseFloat(ss.strokeWidth) || 1;
              ctx.stroke();
            }
          } else if (tag === "polyline" || tag === "polygon") {
            const pts = shape.getAttribute("points");
            if (pts) {
              const coords = pts.trim().split(/[\s,]+/).map(Number);
              if (coords.length >= 4) {
                ctx.beginPath();
                ctx.moveTo(coords[0], coords[1]);
                for (let i = 2; i < coords.length; i += 2) ctx.lineTo(coords[i], coords[i + 1]);
                if (tag === "polygon") ctx.closePath();
                if (hasFill && tag === "polygon") { ctx.fillStyle = fillColor; ctx.fill(); }
                if (hasStroke) { ctx.strokeStyle = strokeColor; ctx.lineWidth = parseFloat(ss.strokeWidth) || 1; ctx.stroke(); }
              }
            }
          }

          ctx.restore();
        }
      }

      // --- Phase 3: Text (using Range.getClientRects for exact line positions) ---
      const renderedParents = new Set<Element>();
      const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while ((n = tw.nextNode())) {
        const textNode = n as Text;
        const raw = textNode.textContent;
        if (!raw || !raw.trim()) continue;
        const parent = textNode.parentElement;
        if (!parent || renderedParents.has(parent)) continue;

        const ps = getComputedStyle(parent);
        if (ps.display === "none" || ps.visibility === "hidden") continue;

        const fontSize = parseFloat(ps.fontSize) * scale;
        if (fontSize < 3) continue;

        // Get exact line rects from the browser
        const range = document.createRange();
        range.selectNodeContents(textNode);
        const lineRects = range.getClientRects();
        if (lineRects.length === 0) continue;

        // Check if any line is in the capture region
        let anyVisible = false;
        for (const lr of lineRects) {
          if (lr.right > cx && lr.left < cx + cw && lr.bottom > cy && lr.top < cy + ch) {
            anyVisible = true;
            break;
          }
        }
        if (!anyVisible) continue;
        renderedParents.add(parent);

        ctx.save();
        ctx.fillStyle = ps.color;
        ctx.font = `${ps.fontStyle} ${ps.fontWeight} ${fontSize}px ${ps.fontFamily}`;
        ctx.textBaseline = "top";

        if (lineRects.length === 1) {
          // Single line — render directly
          const lr = lineRects[0];
          ctx.fillText(raw, (lr.left - cx) * scale, (lr.top - cy) * scale);
        } else {
          // Multi-line — find text per line using word-boundary Range checks
          const lineRectsArr = Array.from(lineRects);
          const lines = splitTextByLines(textNode, raw, lineRectsArr);
          for (let i = 0; i < lines.length; i++) {
            const { text, rect } = lines[i];
            if (!text.trim()) continue;
            if (rect.right <= cx || rect.left >= cx + cw) continue;
            if (rect.bottom <= cy || rect.top >= cy + ch) continue;
            ctx.fillText(text, (rect.left - cx) * scale, (rect.top - cy) * scale);
          }
        }

        ctx.restore();
      }

      // --- Phase 4: Drawing strokes ---
      drawStrokesOnCanvas(ctx, strokes, cx, cy, scale);

      return canvas.toDataURL("image/jpeg", 0.92);
    } finally {
      if (root) root.style.visibility = prevVis ?? "";
    }
  } catch (err) {
    console.warn("[Agentation] Region capture failed:", err);
    return null;
  }
}

/**
 * Split a text node's content into per-line substrings using word-boundary
 * Range checks. Each word's first character is checked against the line rects
 * to determine which line it belongs to. O(words) Range operations.
 */
function splitTextByLines(
  textNode: Text,
  text: string,
  lineRects: DOMRect[],
): Array<{ text: string; rect: DOMRect }> {
  if (lineRects.length <= 1) {
    return lineRects.length === 1 ? [{ text, rect: lineRects[0] }] : [];
  }

  const range = document.createRange();
  const result: Array<{ text: string; rect: DOMRect }> = [];

  // Split into word tokens (preserving whitespace position info)
  const wordPattern = /\S+/g;
  let match: RegExpExecArray | null;
  let currentLineIdx = 0;
  let currentLineText = "";

  while ((match = wordPattern.exec(text)) !== null) {
    const wordStart = match.index;

    // Check which line this word's first character is on
    range.setStart(textNode, wordStart);
    range.setEnd(textNode, Math.min(wordStart + 1, text.length));
    const charRect = range.getBoundingClientRect();

    // Find the matching line rect (by vertical position)
    let lineIdx = currentLineIdx;
    for (let i = currentLineIdx; i < lineRects.length; i++) {
      if (charRect.top >= lineRects[i].top - 1 && charRect.top < lineRects[i].bottom + 1) {
        lineIdx = i;
        break;
      }
    }

    if (lineIdx > currentLineIdx && currentLineText) {
      result.push({ text: currentLineText.trim(), rect: lineRects[currentLineIdx] });
      currentLineText = match[0];
      currentLineIdx = lineIdx;
    } else {
      currentLineText += (currentLineText ? " " : "") + match[0];
    }
  }

  if (currentLineText) {
    result.push({ text: currentLineText.trim(), rect: lineRects[currentLineIdx] });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Stroke-only fallback
// ---------------------------------------------------------------------------

export function captureDrawingStrokes(
  regionX: number,
  regionY: number,
  regionW: number,
  regionH: number,
  strokes: StrokeInput,
  padding = 32,
): string | null {
  try {
    const cx = Math.max(0, regionX - padding);
    const cy = Math.max(0, regionY - padding);
    const cw = regionW + padding * 2;
    const ch = regionH + padding * 2;

    const maxDim = 400;
    const scale = Math.min(1, maxDim / Math.max(cw, ch));
    const outW = Math.round(cw * scale);
    const outH = Math.round(ch * scale);
    if (outW < 1 || outH < 1) return null;

    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    ctx.fillRect(0, 0, outW, outH);
    drawStrokesOnCanvas(ctx, strokes, cx, cy, scale);

    return canvas.toDataURL("image/png");
  } catch (err) {
    console.warn("[Agentation] Stroke capture failed:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Shared: draw strokes onto a canvas
// ---------------------------------------------------------------------------

function drawStrokesOnCanvas(
  ctx: CanvasRenderingContext2D,
  strokes: StrokeInput,
  originX: number,
  originY: number,
  scale: number,
) {
  const scrollY = window.scrollY;
  for (const stroke of strokes) {
    if (stroke.points.length < 2) continue;
    ctx.save();
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = Math.max(2, 2.5 * scale);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    for (let i = 0; i < stroke.points.length; i++) {
      const p = stroke.points[i];
      const vx = p.x;
      const vy = stroke.fixed ? p.y : p.y - scrollY;
      const px = (vx - originX) * scale;
      const py = (vy - originY) * scale;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.restore();
  }
}
