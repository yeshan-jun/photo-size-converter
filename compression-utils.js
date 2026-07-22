const MIN_TARGET_KB = 1;
const MAX_TARGET_KB = 50_000;

export function normalizeTargetKilobytes(value) {
  const target = Number(value);

  if (!Number.isFinite(target)) {
    throw new Error("Enter a valid target size.");
  }

  if (target < MIN_TARGET_KB) {
    throw new Error("Target size must be at least 1 KB.");
  }

  if (target > MAX_TARGET_KB) {
    throw new Error("Target size must be 50,000 KB or less.");
  }

  return target;
}

export function calculateAdaptiveScale(currentBytes, targetBytes) {
  if (currentBytes <= 0 || targetBytes <= 0) {
    throw new Error("File sizes must be positive numbers.");
  }

  const proportionalScale = Math.sqrt(targetBytes / currentBytes) * 0.96;
  const safeScale = Math.min(0.92, Math.max(0.5, proportionalScale));
  return Math.round(safeScale * 100) / 100;
}

export function formatBytes(bytes) {
  if (bytes < 1024) {
    return `${Math.round(bytes)} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function buildDownloadName(originalName, targetKilobytes) {
  const withoutExtension = String(originalName || "photo").replace(/\.[^.]+$/, "");
  const safeBase = withoutExtension
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "photo";
  const safeTarget = String(targetKilobytes).replace(".", "-");

  return `${safeBase}-${safeTarget}kb.jpg`;
}
