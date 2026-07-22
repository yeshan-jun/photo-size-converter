import {
  buildDownloadName,
  calculateAdaptiveScale,
  formatBytes,
  normalizeTargetKilobytes,
} from "./compression-utils.js";

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MAX_WORKING_EDGE = 4096;
const MAX_WORKING_PIXELS = 16_000_000;
const MIN_OUTPUT_EDGE = 32;
const QUALITY_FLOOR = 0.52;
const MIN_FALLBACK_QUALITY = 0.08;
const MAX_QUALITY = 0.96;
const QUALITY_ITERATIONS = 13;
const DIMENSION_ITERATIONS = 7;
const SUPPORTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const elements = {
  dropZone: document.querySelector("#dropZone"),
  fileInput: document.querySelector("#fileInput"),
  selectedFile: document.querySelector("#selectedFile"),
  selectedThumbnail: document.querySelector("#selectedThumbnail"),
  selectedFileName: document.querySelector("#selectedFileName"),
  selectedFileMeta: document.querySelector("#selectedFileMeta"),
  changeFileButton: document.querySelector("#changeFileButton"),
  targetSize: document.querySelector("#targetSize"),
  convertButton: document.querySelector("#convertButton"),
  convertButtonLabel: document.querySelector("#convertButtonLabel"),
  message: document.querySelector("#message"),
  resultPanel: document.querySelector("#resultPanel"),
  targetBadge: document.querySelector("#targetBadge"),
  originalPreview: document.querySelector("#originalPreview"),
  originalSize: document.querySelector("#originalSize"),
  originalDimensions: document.querySelector("#originalDimensions"),
  originalFormat: document.querySelector("#originalFormat"),
  resultPreview: document.querySelector("#resultPreview"),
  resultSize: document.querySelector("#resultSize"),
  resultDimensions: document.querySelector("#resultDimensions"),
  resultQuality: document.querySelector("#resultQuality"),
  reductionValue: document.querySelector("#reductionValue"),
  startOverButton: document.querySelector("#startOverButton"),
  downloadButton: document.querySelector("#downloadButton"),
};

const state = {
  file: null,
  decoded: null,
  originalUrl: null,
  resultUrl: null,
  conversionId: 0,
  processing: false,
};

function bindEvents() {
  elements.dropZone.addEventListener("click", () => elements.fileInput.click());
  elements.dropZone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      elements.fileInput.click();
    }
  });

  for (const eventName of ["dragenter", "dragover"]) {
    elements.dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      elements.dropZone.classList.add("is-dragging");
    });
  }

  for (const eventName of ["dragleave", "drop"]) {
    elements.dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      elements.dropZone.classList.remove("is-dragging");
    });
  }

  elements.dropZone.addEventListener("drop", (event) => {
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      void selectFile(file);
    }
  });

  elements.fileInput.addEventListener("change", () => {
    const file = elements.fileInput.files?.[0];
    if (file) {
      void selectFile(file);
    }
  });

  elements.changeFileButton.addEventListener("click", () => elements.fileInput.click());
  elements.startOverButton.addEventListener("click", resetTool);
  elements.convertButton.addEventListener("click", () => void convertCurrentPhoto());

  elements.targetSize.addEventListener("input", () => {
    updateConvertLabel();
    clearResult();
    validateTargetQuietly();
  });

  window.addEventListener("beforeunload", releaseResources);
}

async function selectFile(file) {
  hideMessage();
  clearResult();

  try {
    validateFile(file);
    setProcessing(true, "Reading photo…");
    const decoded = await decodePhoto(file);

    releaseDecoded();
    revokeUrl("originalUrl");

    state.file = file;
    state.decoded = decoded;
    state.originalUrl = URL.createObjectURL(file);
    state.conversionId += 1;

    elements.selectedThumbnail.src = state.originalUrl;
    elements.selectedFileName.textContent = file.name;
    elements.selectedFileMeta.textContent = `${formatBytes(file.size)} · ${decoded.width} × ${decoded.height} px`;
    elements.selectedFile.hidden = false;
    elements.dropZone.hidden = true;
    elements.convertButton.disabled = false;
    updateConvertLabel();
    hideMessage();
  } catch (error) {
    state.file = null;
    showMessage(readableError(error), "error");
    elements.fileInput.value = "";
  } finally {
    setProcessing(false);
  }
}

function validateFile(file) {
  if (!SUPPORTED_TYPES.has(file.type)) {
    throw new Error("Choose a JPG, PNG or WebP photo.");
  }

  if (file.size > MAX_FILE_BYTES) {
    throw new Error("Choose a photo smaller than 50 MB.");
  }
}

async function decodePhoto(file) {
  if ("createImageBitmap" in window) {
    try {
      const bitmap = await createImageBitmap(file, {
        imageOrientation: "from-image",
        premultiplyAlpha: "default",
        colorSpaceConversion: "default",
      });

      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close(),
      };
    } catch {
      // Fall through to the image element decoder for older implementations.
    }
  }

  const url = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = "async";
  image.src = url;

  try {
    await image.decode();
  } catch {
    URL.revokeObjectURL(url);
    throw new Error("This photo could not be decoded by your browser.");
  }

  return {
    source: image,
    width: image.naturalWidth,
    height: image.naturalHeight,
    close: () => URL.revokeObjectURL(url),
  };
}

async function convertCurrentPhoto() {
  if (!state.file || !state.decoded || state.processing) {
    return;
  }

  let targetKilobytes;
  try {
    targetKilobytes = normalizeTargetKilobytes(elements.targetSize.value);
  } catch (error) {
    showMessage(readableError(error), "error");
    elements.targetSize.focus();
    return;
  }

  const conversionId = ++state.conversionId;
  clearResult();
  setProcessing(true, "Finding the clearest result below your target…");
  await nextPaint();

  try {
    const targetBytes = Math.floor(targetKilobytes * 1024);
    const result = await compressToTarget(state.decoded, targetBytes);

    if (conversionId !== state.conversionId) {
      return;
    }

    showResult(result, targetKilobytes);
    showMessage(`Ready at ${formatBytes(result.blob.size)}.`, "success");
  } catch (error) {
    if (conversionId === state.conversionId) {
      showMessage(readableError(error), "error");
    }
  } finally {
    if (conversionId === state.conversionId) {
      setProcessing(false);
    }
  }
}

async function compressToTarget(decoded, targetBytes) {
  const initialScale = calculateInitialScale(decoded.width, decoded.height);
  let highScale = initialScale;
  let highCanvas = renderAtScale(decoded, highScale);

  const maximumQualityBlob = await encodeCanvas(highCanvas, MAX_QUALITY);
  if (maximumQualityBlob.size <= targetBytes) {
    return createResult(maximumQualityBlob, highCanvas, MAX_QUALITY);
  }

  let floorBlob = await encodeCanvas(highCanvas, QUALITY_FLOOR);
  if (floorBlob.size <= targetBytes) {
    return searchBestQuality(highCanvas, targetBytes, QUALITY_FLOOR, MAX_QUALITY, floorBlob);
  }

  const minimumScale = calculateMinimumScale(decoded.width, decoded.height, initialScale);
  let lowScale = null;
  let lowBlob = null;
  let currentScale = highScale;
  let currentBlob = floorBlob;

  for (let attempt = 0; attempt < 12; attempt += 1) {
    let nextScale = currentScale * calculateAdaptiveScale(currentBlob.size, targetBytes);
    nextScale = Math.max(minimumScale, Math.min(nextScale, currentScale * 0.92));

    if (Math.abs(nextScale - currentScale) < 0.0005 && currentScale > minimumScale) {
      nextScale = Math.max(minimumScale, currentScale * 0.85);
    }

    const canvas = renderAtScale(decoded, nextScale);
    const blob = await encodeCanvas(canvas, QUALITY_FLOOR);

    if (blob.size <= targetBytes) {
      lowScale = nextScale;
      lowBlob = blob;
      break;
    }

    highScale = nextScale;
    currentScale = nextScale;
    currentBlob = blob;

    if (nextScale <= minimumScale + 0.0001) {
      break;
    }
  }

  if (lowScale === null) {
    const minimumCanvas = renderAtScale(decoded, minimumScale);
    const minimumFloorBlob = await encodeCanvas(minimumCanvas, QUALITY_FLOOR);

    if (minimumFloorBlob.size <= targetBytes) {
      lowScale = minimumScale;
      lowBlob = minimumFloorBlob;
    } else {
      const fallbackBlob = await encodeCanvas(minimumCanvas, MIN_FALLBACK_QUALITY);
      if (fallbackBlob.size > targetBytes) {
        throw new Error("The selected target is too small for this photo. Increase the target size and try again.");
      }
      return searchBestQuality(
        minimumCanvas,
        targetBytes,
        MIN_FALLBACK_QUALITY,
        QUALITY_FLOOR,
        fallbackBlob,
      );
    }
  }

  let bestScale = lowScale;
  let bestFloorBlob = lowBlob;

  for (let iteration = 0; iteration < DIMENSION_ITERATIONS; iteration += 1) {
    const midScale = (lowScale + highScale) / 2;
    const canvas = renderAtScale(decoded, midScale);
    const blob = await encodeCanvas(canvas, QUALITY_FLOOR);

    if (blob.size <= targetBytes) {
      bestScale = midScale;
      bestFloorBlob = blob;
      lowScale = midScale;
    } else {
      highScale = midScale;
    }
  }

  const bestCanvas = renderAtScale(decoded, bestScale);
  return searchBestQuality(bestCanvas, targetBytes, QUALITY_FLOOR, MAX_QUALITY, bestFloorBlob);
}

function calculateInitialScale(width, height) {
  const edgeScale = Math.min(1, MAX_WORKING_EDGE / Math.max(width, height));
  const pixelScale = Math.min(1, Math.sqrt(MAX_WORKING_PIXELS / (width * height)));
  return Math.min(edgeScale, pixelScale);
}

function calculateMinimumScale(width, height, initialScale) {
  const minimumForEdge = Math.max(MIN_OUTPUT_EDGE / width, MIN_OUTPUT_EDGE / height);
  return Math.min(initialScale, Math.max(0.001, minimumForEdge));
}

function renderAtScale(decoded, scale) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(decoded.width * scale));
  canvas.height = Math.max(1, Math.round(decoded.height * scale));

  const context = canvas.getContext("2d", { alpha: false });
  if (!context) {
    throw new Error("Your browser could not create an image canvas.");
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function searchBestQuality(canvas, targetBytes, lowQuality, highQuality, initialBlob) {
  let low = lowQuality;
  let high = highQuality;
  let bestBlob = initialBlob;
  let bestQuality = lowQuality;

  for (let iteration = 0; iteration < QUALITY_ITERATIONS; iteration += 1) {
    const quality = (low + high) / 2;
    const blob = await encodeCanvas(canvas, quality);

    if (blob.size <= targetBytes) {
      if (!bestBlob || blob.size >= bestBlob.size) {
        bestBlob = blob;
        bestQuality = quality;
      }
      low = quality;
    } else {
      high = quality;
    }
  }

  if (!bestBlob) {
    throw new Error("The browser could not create a result below the selected target.");
  }

  return createResult(bestBlob, canvas, bestQuality);
}

function encodeCanvas(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("The browser could not create the converted photo."));
          return;
        }
        resolve(blob);
      },
      "image/jpeg",
      quality,
    );
  });
}

function createResult(blob, canvas, quality) {
  return {
    blob,
    width: canvas.width,
    height: canvas.height,
    quality,
  };
}

function showResult(result, targetKilobytes) {
  revokeUrl("resultUrl");
  state.resultUrl = URL.createObjectURL(result.blob);

  elements.originalPreview.src = state.originalUrl;
  elements.originalSize.textContent = formatBytes(state.file.size);
  elements.originalDimensions.textContent = `${state.decoded.width} × ${state.decoded.height} px`;
  elements.originalFormat.textContent = formatType(state.file.type);

  elements.resultPreview.src = state.resultUrl;
  elements.resultSize.textContent = formatBytes(result.blob.size);
  elements.resultDimensions.textContent = `${result.width} × ${result.height} px`;
  elements.resultQuality.textContent = `${Math.round(result.quality * 100)}%`;
  elements.targetBadge.textContent = `Below ${targetKilobytes} KB target`;
  elements.reductionValue.textContent = calculateReduction(state.file.size, result.blob.size);

  elements.downloadButton.href = state.resultUrl;
  elements.downloadButton.download = buildDownloadName(state.file.name, targetKilobytes);
  elements.resultPanel.dataset.resultBytes = String(result.blob.size);
  elements.resultPanel.hidden = false;
  elements.resultPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function calculateReduction(originalBytes, resultBytes) {
  if (originalBytes <= 0 || resultBytes >= originalBytes) {
    return "Ready for your limit";
  }

  const percent = ((originalBytes - resultBytes) / originalBytes) * 100;
  return `${percent >= 99.95 ? percent.toFixed(2) : percent.toFixed(1)}%`;
}

function formatType(type) {
  const names = {
    "image/jpeg": "JPEG",
    "image/png": "PNG",
    "image/webp": "WebP",
  };
  return names[type] || "Image";
}

function updateConvertLabel() {
  const rawValue = elements.targetSize.value.trim();
  elements.convertButtonLabel.textContent = rawValue
    ? `Convert to ${rawValue} KB`
    : "Convert photo";
}

function validateTargetQuietly() {
  try {
    normalizeTargetKilobytes(elements.targetSize.value);
    if (elements.message.classList.contains("is-error")) {
      hideMessage();
    }
    elements.convertButton.disabled = !state.file || state.processing;
  } catch (error) {
    showMessage(readableError(error), "error");
    elements.convertButton.disabled = true;
  }
}

function setProcessing(processing, message = "") {
  state.processing = processing;
  elements.convertButton.classList.toggle("is-processing", processing);
  elements.convertButton.disabled = processing || !state.file;
  elements.fileInput.disabled = processing;
  elements.changeFileButton.disabled = processing;
  elements.targetSize.disabled = processing;

  if (processing && message) {
    showMessage(message, "progress");
  }
}

function showMessage(text, type) {
  elements.message.textContent = text;
  elements.message.className = `message is-${type}`;
  elements.message.hidden = false;
}

function hideMessage() {
  elements.message.hidden = true;
  elements.message.textContent = "";
  elements.message.className = "message";
}

function clearResult() {
  revokeUrl("resultUrl");
  elements.resultPanel.hidden = true;
  elements.resultPanel.removeAttribute("data-result-bytes");
  elements.downloadButton.removeAttribute("href");
}

function resetTool() {
  state.conversionId += 1;
  clearResult();
  releaseDecoded();
  revokeUrl("originalUrl");
  state.file = null;
  elements.fileInput.value = "";
  elements.selectedFile.hidden = true;
  elements.dropZone.hidden = false;
  elements.convertButton.disabled = true;
  hideMessage();
  elements.dropZone.focus();
}

function releaseDecoded() {
  if (state.decoded) {
    state.decoded.close();
    state.decoded = null;
  }
}

function revokeUrl(key) {
  if (state[key]) {
    URL.revokeObjectURL(state[key]);
    state[key] = null;
  }
}

function releaseResources() {
  releaseDecoded();
  revokeUrl("originalUrl");
  revokeUrl("resultUrl");
}

function readableError(error) {
  return error instanceof Error ? error.message : "Something went wrong. Try another photo.";
}

function nextPaint() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

bindEvents();
updateConvertLabel();
