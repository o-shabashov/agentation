// =============================================================================
// Shared Types
// =============================================================================

export type Annotation = {
  id: string;
  x: number; // % of viewport width
  y: number; // px from top of document (absolute) OR viewport (if isFixed)
  comment: string;
  element: string;
  elementPath: string;
  timestamp: number;
  selectedText?: string;
  boundingBox?: { x: number; y: number; width: number; height: number };
  nearbyText?: string;
  cssClasses?: string;
  nearbyElements?: string;
  computedStyles?: string;
  fullPath?: string;
  accessibility?: string;
  isMultiSelect?: boolean; // true if created via drag selection
  isFixed?: boolean; // true if element has fixed/sticky positioning (marker stays fixed)
  reactComponents?: string; // React component hierarchy (e.g. "<App> <Dashboard> <Button>")
  elementBoundingBoxes?: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>; // Individual bounding boxes for multi-select hover highlighting
  drawingIndex?: number; // Index of linked drawing stroke (click-to-annotate)
  strokeId?: string; // Unique ID of linked drawing stroke
  drawingContext?: DrawingContext; // Rich gesture + element data for drawings

  // Protocol fields (added when syncing to server)
  sessionId?: string;
  url?: string;
  intent?: AnnotationIntent;
  severity?: AnnotationSeverity;
  status?: AnnotationStatus;
  thread?: ThreadMessage[];
  createdAt?: string;
  updatedAt?: string;
  resolvedAt?: string;
  resolvedBy?: "human" | "agent";
  authorId?: string;

  // Local-only sync tracking (not sent to server)
  _syncedTo?: string; // Session ID this annotation was synced to
};

// -----------------------------------------------------------------------------
// Annotation Enums
// -----------------------------------------------------------------------------

export type AnnotationIntent = "fix" | "change" | "question" | "approve";
export type AnnotationSeverity = "blocking" | "important" | "suggestion";
export type AnnotationStatus = "pending" | "acknowledged" | "resolved" | "dismissed";

// -----------------------------------------------------------------------------
// Session
// -----------------------------------------------------------------------------

export type Session = {
  id: string;
  url: string;
  status: SessionStatus;
  createdAt: string;
  updatedAt?: string;
  projectId?: string;
  metadata?: Record<string, unknown>;
};

export type SessionStatus = "active" | "approved" | "closed";

export type SessionWithAnnotations = Session & {
  annotations: Annotation[];
};

// -----------------------------------------------------------------------------
// Thread Messages
// -----------------------------------------------------------------------------

export type ThreadMessage = {
  id: string;
  role: "human" | "agent";
  content: string;
  timestamp: number;
};

// -----------------------------------------------------------------------------
// Drawing Strokes
// -----------------------------------------------------------------------------

export type DrawStroke = {
  id: string;
  points: Array<{ x: number; y: number }>;
  color: string;
  fixed: boolean;
  timestamp?: number;
};

// -----------------------------------------------------------------------------
// Drawing Context (rich data for drawing-linked annotations)
// -----------------------------------------------------------------------------

export type DrawingElement = {
  name: string;
  path: string;
  reactComponents?: string;
  boundingBox?: { x: number; y: number; width: number; height: number };
  nearbyText?: string;
  /** Word or phrase at the exact point (arrow tip, underline position, etc.) */
  textAtPoint?: string;
  cssClasses?: string;
  computedStyles?: string;
  accessibility?: string;
};

export type DrawingContext = {
  gesture: string; // "Arrow" | "Box" | "Circle" | "Underline" | "Strikethrough" | "Drawing"
  /** The main target element (arrow tip, first contained, midpoint element) */
  primary?: DrawingElement;
  /** Arrow start element */
  secondary?: DrawingElement;
  /** All elements inside a Box/Circle gesture */
  contained?: DrawingElement[];
  /** Bounding box of the stroke itself (viewport coords) */
  strokeBBox?: { x: number; y: number; width: number; height: number };
  /** Start and end points of the stroke (viewport coords, useful for arrow direction) */
  strokeStart?: { x: number; y: number };
  strokeEnd?: { x: number; y: number };
  /** Exact text under the stroke (underline/strikethrough: full span, arrow: word at tip) */
  textContent?: string;
  /** JPEG data URL of the page region with drawing strokes composited on top */
  screenshot?: string;
};

