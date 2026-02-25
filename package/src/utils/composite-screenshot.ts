/**
 * Compose multiple annotation screenshots into a single vertical strip image.
 * Each screenshot gets a numbered badge matching its annotation number in the markdown.
 *
 * Visual style matches the annotation marker badges in the toolbar UI:
 * blue (#3c82f7) pill with white number, subtle shadow.
 */

const BADGE_SIZE = 24;
const BADGE_RADIUS = 12;
const SECTION_GAP = 20;
const CONTENT_PADDING = 16;
const BADGE_BLUE = "#3c82f7";
const DIVIDER_COLOR = "rgba(0, 0, 0, 0.06)";
const FONT_STACK = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

/**
 * Draw a circular badge with a number, matching the annotation marker style.
 */
function drawBadge(ctx: CanvasRenderingContext2D, x: number, y: number, num: number, color?: string): void {
  const cx = x + BADGE_SIZE / 2;
  const cy = y + BADGE_SIZE / 2;

  // Shadow
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.15)";
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 1;

  // Circle in annotation color
  ctx.fillStyle = color || BADGE_BLUE;
  ctx.beginPath();
  ctx.arc(cx, cy, BADGE_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // White number
  ctx.fillStyle = "#ffffff";
  ctx.font = `600 12px ${FONT_STACK}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`${num}`, cx, cy + 1);

  // Reset alignment
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

export async function compositeAnnotationScreenshots(
  entries: Array<{ annotationNumber: number; dataUrl: string; color?: string }>,
): Promise<string | null> {
  if (entries.length === 0) return null;

  // Load all images, skip any that fail
  const loaded: Array<{ num: number; img: HTMLImageElement; color?: string }> = [];
  for (const entry of entries) {
    try {
      const img = await loadImage(entry.dataUrl);
      loaded.push({ num: entry.annotationNumber, img, color: entry.color });
    } catch {
      // Skip failed images
    }
  }
  if (loaded.length === 0) return null;

  // Compute canvas dimensions
  const imgWidth = Math.max(...loaded.map((e) => e.img.width));
  const width = imgWidth + CONTENT_PADDING * 2;
  let height = CONTENT_PADDING;
  for (let i = 0; i < loaded.length; i++) {
    height += BADGE_SIZE + 8 + loaded[i].img.height; // badge + gap + image
    if (i < loaded.length - 1) height += SECTION_GAP;
  }
  height += CONTENT_PADDING;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // White background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  let y = CONTENT_PADDING;
  for (let i = 0; i < loaded.length; i++) {
    const { num, img, color } = loaded[i];

    // Divider line between sections
    if (i > 0) {
      ctx.fillStyle = DIVIDER_COLOR;
      ctx.fillRect(CONTENT_PADDING, y - SECTION_GAP / 2, imgWidth, 1);
    }

    // Badge
    drawBadge(ctx, CONTENT_PADDING, y, num, color);
    y += BADGE_SIZE + 8;

    // Screenshot with subtle border
    ctx.save();
    ctx.strokeStyle = "rgba(0, 0, 0, 0.08)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(CONTENT_PADDING - 0.5, y - 0.5, img.width + 1, img.height + 1, 4);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(CONTENT_PADDING, y, img.width, img.height, 4);
    ctx.clip();
    ctx.drawImage(img, CONTENT_PADDING, y);
    ctx.restore();

    y += img.height + SECTION_GAP;
  }

  return canvas.toDataURL("image/png");
}
