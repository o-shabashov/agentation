/**
 * Screenshot capture utility for annotations.
 *
 * Captures a full-page screenshot with the annotated element highlighted,
 * then uploads it to the server.
 */

import type { Annotation } from "../types";

const CAPTURE_TIMEOUT_MS = 8000;

/**
 * Capture a screenshot of the page with highlighted annotation element(s),
 * then upload to the server endpoint.
 *
 * This is fire-and-forget: errors are logged but never thrown.
 */
export async function captureAndUploadScreenshot(
  annotation: Annotation,
  endpoint: string
): Promise<void> {
  try {
    const html2canvas = await loadHtml2Canvas();
    if (!html2canvas) return;

    // Capture first (clean, no overlays) — then draw highlight on canvas
    // This avoids stale red divs if html2canvas hangs or throws.
    const capturePromise = html2canvas(document.body, {
      scale: 1,
      useCORS: true,
      logging: false,
      allowTaint: true,
      // Ignore the agentation toolbar itself
      ignoreElements: (el: Element) =>
        el.hasAttribute("data-feedback-toolbar") ||
        el.hasAttribute("data-agentation-root"),
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("html2canvas timeout")), CAPTURE_TIMEOUT_MS)
    );

    const canvas = await Promise.race([capturePromise, timeoutPromise]);

    // Draw highlight rect(s) directly on the captured canvas
    drawHighlightOnCanvas(canvas, annotation);

    // Convert to JPEG blob
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.75)
    );

    if (!blob || blob.size === 0) return;

    // Upload
    await fetch(`${endpoint}/annotations/${annotation.id}/screenshot`, {
      method: "POST",
      headers: { "Content-Type": "image/jpeg" },
      body: blob,
    });
  } catch (err) {
    console.warn("[Agentation] Screenshot capture failed:", err);
  }
}

/**
 * Lazy-load html2canvas to avoid bundling it when screenshots aren't used.
 */
let _html2canvas: typeof import("html2canvas").default | null = null;

async function loadHtml2Canvas(): Promise<typeof import("html2canvas").default | null> {
  if (_html2canvas) return _html2canvas;
  try {
    const mod = await import("html2canvas");
    _html2canvas = mod.default || mod;
    return _html2canvas;
  } catch {
    console.warn("[Agentation] html2canvas not available, screenshots disabled");
    return null;
  }
}

/**
 * Draw red highlight rect(s) directly on the canvas (no DOM overlay needed).
 */
function drawHighlightOnCanvas(canvas: HTMLCanvasElement, annotation: Annotation): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const scrollY = window.scrollY;

  const boxes = annotation.elementBoundingBoxes?.length
    ? annotation.elementBoundingBoxes
    : annotation.boundingBox
      ? [annotation.boundingBox]
      : [];

  ctx.save();
  ctx.strokeStyle = "#FF383C";
  ctx.lineWidth = 3;
  ctx.fillStyle = "rgba(255, 56, 60, 0.08)";

  for (const box of boxes) {
    const y = annotation.isFixed ? box.y : box.y - scrollY;
    ctx.fillRect(box.x, y, box.width, box.height);
    ctx.strokeRect(box.x, y, box.width, box.height);
  }

  ctx.restore();
}
