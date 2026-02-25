/**
 * Screenshot file saving utilities.
 *
 * Uses File System Access API (Chrome/Edge) for silent writes to a user-chosen
 * directory. Falls back to <a download> for other browsers (visible download bar).
 */

// ---------------------------------------------------------------------------
// IndexedDB persistence for the directory handle
// ---------------------------------------------------------------------------

const DB_NAME = "agentation-screenshots";
const STORE_NAME = "handles";
const HANDLE_KEY = "screenshotDir";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function storeHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(handle, HANDLE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(HANDLE_KEY);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// File System Access API support detection
// ---------------------------------------------------------------------------

export function isFileSystemAccessSupported(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

// ---------------------------------------------------------------------------
// Directory handle management
// ---------------------------------------------------------------------------

let _cachedHandle: FileSystemDirectoryHandle | null = null;
let _cachedPath: string | null = null;

/**
 * Prompt the user to pick a screenshot directory (one-time setup).
 * Returns the directory name or null if cancelled.
 */
export async function pickScreenshotDirectory(): Promise<string | null> {
  if (!isFileSystemAccessSupported()) return null;
  try {
    // @ts-expect-error -- showDirectoryPicker not in all TS lib versions
    const handle: FileSystemDirectoryHandle = await window.showDirectoryPicker({
      id: "agentation-screenshots",
      mode: "readwrite",
      startIn: "desktop",
    });
    _cachedHandle = handle;
    _cachedPath = handle.name;
    await storeHandle(handle);
    return handle.name;
  } catch {
    return null; // User cancelled
  }
}

/**
 * Try to get a previously granted directory handle.
 * Returns the handle if permission is still granted, null otherwise.
 */
async function getGrantedHandle(): Promise<FileSystemDirectoryHandle | null> {
  if (_cachedHandle) {
    try {
      // @ts-expect-error -- queryPermission not in all TS lib versions
      const perm = await _cachedHandle.queryPermission({ mode: "readwrite" });
      if (perm === "granted") return _cachedHandle;
      // @ts-expect-error
      const req = await _cachedHandle.requestPermission({ mode: "readwrite" });
      if (req === "granted") return _cachedHandle;
    } catch {
      // Fall through
    }
  }

  const stored = await loadHandle();
  if (!stored) return null;

  try {
    // @ts-expect-error
    const perm = await stored.queryPermission({ mode: "readwrite" });
    if (perm === "granted") {
      _cachedHandle = stored;
      _cachedPath = stored.name;
      return stored;
    }
    // @ts-expect-error
    const req = await stored.requestPermission({ mode: "readwrite" });
    if (req === "granted") {
      _cachedHandle = stored;
      _cachedPath = stored.name;
      return stored;
    }
  } catch {
    // Permission denied or handle stale
  }
  return null;
}

// ---------------------------------------------------------------------------
// Save screenshot — File System Access API (silent)
// ---------------------------------------------------------------------------

async function saveToDirectory(
  handle: FileSystemDirectoryHandle,
  dataUrl: string,
  filename: string,
): Promise<boolean> {
  try {
    const fileHandle = await handle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();

    // Convert data URL to blob
    const resp = await fetch(dataUrl);
    const blob = await resp.blob();

    await writable.write(blob);
    await writable.close();
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Save screenshot — <a download> fallback
// ---------------------------------------------------------------------------

function downloadViaAnchor(dataUrl: string, filename: string): boolean {
  try {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = filename;
    a.style.display = "none";
    // Mark as toolbar element so the annotation click handler ignores
    // the synthetic click event dispatched by a.click()
    a.setAttribute("data-feedback-toolbar", "");
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type SaveResult = {
  saved: boolean;
  /** The path to reference in markdown */
  path: string | null;
  /** Whether File System Access API was used (vs download fallback) */
  usedFSAccess: boolean;
};

/**
 * Save a screenshot data URL to a file. Uses File System Access API if available
 * and previously granted, otherwise falls back to <a download>.
 *
 * Returns the file path to reference in the markdown output.
 */
export async function saveScreenshot(
  dataUrl: string,
  filename: string,
): Promise<SaveResult> {
  // Try File System Access API first
  if (isFileSystemAccessSupported()) {
    const handle = await getGrantedHandle();
    if (handle) {
      const saved = await saveToDirectory(handle, dataUrl, filename);
      if (saved) {
        return {
          saved: true,
          path: `${handle.name}/${filename}`,
          usedFSAccess: true,
        };
      }
    }
  }

  // Fallback: <a download>
  const downloaded = downloadViaAnchor(dataUrl, filename);
  return {
    saved: downloaded,
    path: downloaded ? `~/Downloads/${filename}` : null,
    usedFSAccess: false,
  };
}

/**
 * Check if a screenshot directory has been configured.
 */
export async function hasScreenshotDirectory(): Promise<boolean> {
  if (!isFileSystemAccessSupported()) return false;
  const handle = await getGrantedHandle();
  return handle !== null;
}
