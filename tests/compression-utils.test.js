import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDownloadName,
  calculateAdaptiveScale,
  formatBytes,
  normalizeTargetKilobytes,
} from "../compression-utils.js";

test("normalizeTargetKilobytes accepts a positive target", () => {
  assert.equal(normalizeTargetKilobytes("10"), 10);
  assert.equal(normalizeTargetKilobytes("10.5"), 10.5);
});

test("normalizeTargetKilobytes rejects invalid targets", () => {
  assert.throws(() => normalizeTargetKilobytes("0"), /at least 1 KB/i);
  assert.throws(() => normalizeTargetKilobytes("abc"), /valid target size/i);
  assert.throws(() => normalizeTargetKilobytes("50001"), /50,000 KB or less/i);
});

test("calculateAdaptiveScale shrinks proportionally and stays within safe bounds", () => {
  assert.equal(calculateAdaptiveScale(20_000, 10_000), 0.68);
  assert.equal(calculateAdaptiveScale(10_100, 10_000), 0.92);
  assert.equal(calculateAdaptiveScale(1_000_000, 1_000), 0.5);
});

test("formatBytes displays bytes, KB, and MB", () => {
  assert.equal(formatBytes(800), "800 B");
  assert.equal(formatBytes(10 * 1024), "10.00 KB");
  assert.equal(formatBytes(2.5 * 1024 * 1024), "2.50 MB");
});

test("buildDownloadName keeps a safe base name and includes target size", () => {
  assert.equal(buildDownloadName("My Holiday Photo.PNG", 10), "my-holiday-photo-10kb.jpg");
  assert.equal(buildDownloadName("photo", 12.5), "photo-12-5kb.jpg");
});
