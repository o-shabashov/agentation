/**
 * Screenshot capture utility for annotations.
 *
 * Captures a full-page screenshot using html-to-image (supports modern CSS
 * including oklch colors used by DaisyUI v4), then uploads to the server.
 *
 * html-to-image is statically imported so tsup bundles it into the dist —
 * no dynamic import resolution needed from the consumer's bundler.
 */

import { toCanvas } from "html-to-image";
import type { Annotation } from "../types";

const CAPTURE_TIMEOUT_MS = 10000;

/**
 * Capture a screenshot of the page with the annotated element highlighted,
 * then upload to the server endpoint.
 *
 * This is fire-and-forget: errors are logged but never thrown.
 */
export async function captureAndUploadScreenshot(
  annotation: Annotation,
  endpoint: string
): Promise<void> {
  try {
    // Capture page as canvas (html-to-image supports oklch / modern CSS)
    const capturePromise = toCanvas(document.body, {
      // Skip the agentation toolbar itself
      filter: (node: Node) => {
        const el = node as Element;
        if (typeof el.hasAttribute !== "function") return true;
        return (
          !el.hasAttribute("data-feedback-toolbar") &&
          !el.hasAttribute("data-agentation-root")
        );
      },
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("screenshot timeout")), CAPTURE_TIMEOUT_MS)
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
