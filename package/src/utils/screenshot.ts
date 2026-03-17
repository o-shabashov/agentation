/**
 * Screenshot capture utility for annotations.
 *
 * Captures a full-page screenshot with the annotated element highlighted,
 * then uploads it to the server.
 */

import type { Annotation } from "../types";

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

    // Create highlight overlay(s) on annotated elements
    const overlays = createHighlightOverlays(annotation);

    // Small delay for overlay to render
    await new Promise((r) => setTimeout(r, 50));

    // Capture full page
    const canvas = await html2canvas(document.body, {
      scale: 1,
      useCORS: true,
      logging: false,
      allowTaint: true,
      // Ignore the agentation toolbar itself
      ignoreElements: (el: Element) =>
        el.hasAttribute("data-feedback-toolbar") ||
        el.hasAttribute("data-agentation-root"),
    });

    // Remove overlays
    overlays.forEach((el) => el.remove());

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
 * Create red highlight overlay divs on the annotation's bounding box(es).
 * Returns the overlay elements (caller must remove them after capture).
 */
function createHighlightOverlays(annotation: Annotation): HTMLElement[] {
  const overlays: HTMLElement[] = [];
  const scrollY = window.scrollY;

  const boxes = annotation.elementBoundingBoxes?.length
    ? annotation.elementBoundingBoxes
    : annotation.boundingBox
      ? [annotation.boundingBox]
      : [];

  for (const box of boxes) {
    const overlay = document.createElement("div");
    overlay.style.cssText = `
      position: absolute;
      left: ${box.x}px;
      top: ${annotation.isFixed ? box.y + scrollY : box.y}px;
      width: ${box.width}px;
      height: ${box.height}px;
      border: 3px solid #FF383C;
      background: rgba(255, 56, 60, 0.08);
      border-radius: 4px;
      z-index: 999998;
      pointer-events: none;
      box-sizing: border-box;
    `;
    document.body.appendChild(overlay);
    overlays.push(overlay);
  }

  return overlays;
}
