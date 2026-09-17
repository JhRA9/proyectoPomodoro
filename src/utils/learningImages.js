import { createId } from "./id.js";

export const MAX_LEARNING_IMAGES = 4;
export const MAX_LEARNING_IMAGE_DATA_URL_LENGTH = 320_000;
export const MAX_SOURCE_IMAGE_BYTES = 12 * 1024 * 1024;

const DATA_URL_PATTERN = /^data:image\/(?:png|jpe?g|webp);base64,[A-Za-z0-9+/=\s]+$/;
const SOURCE_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export function isLearningImageDataUrl(value) {
  return typeof value === "string"
    && value.length <= MAX_LEARNING_IMAGE_DATA_URL_LENGTH
    && DATA_URL_PATTERN.test(value);
}

function safeImageId(value, index) {
  const id = String(value ?? "");
  return /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id) ? id : `note-image-${index + 1}`;
}

export function normalizeLearningImages(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.slice(0, MAX_LEARNING_IMAGES).flatMap((image, index) => {
    if (!image || !isLearningImageDataUrl(image.dataUrl)) return [];
    const id = safeImageId(image.id, index);
    if (seen.has(id)) return [];
    seen.add(id);
    const width = Number.parseInt(image.width, 10);
    const height = Number.parseInt(image.height, 10);
    return [{
      id,
      dataUrl: image.dataUrl.replace(/\s/g, ""),
      alt: String(image.alt || "Imagen de la reflexión").trim().slice(0, 160),
      width: Number.isSafeInteger(width) && width > 0 ? width : null,
      height: Number.isSafeInteger(height) && height > 0 ? height : null,
    }];
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () => reject(new Error("No fue posible leer la imagen.")));
    reader.readAsDataURL(blob);
  });
}

function loadBrowserImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.addEventListener("load", () => {
      URL.revokeObjectURL(url);
      resolve(image);
    }, { once: true });
    image.addEventListener("error", () => {
      URL.revokeObjectURL(url);
      reject(new Error("La imagen pegada no se pudo abrir."));
    }, { once: true });
    image.src = url;
  });
}

function canvasBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function imageAlt(file) {
  const name = String(file?.name || "").replace(/\.[^.]+$/, "").trim();
  return name && name !== "image" ? name.slice(0, 160) : "Imagen pegada en la reflexión";
}

export async function prepareLearningImage(file) {
  if (!file || !SOURCE_IMAGE_TYPES.has(String(file.type).toLowerCase())) throw new Error("Usa una imagen PNG, JPG o WebP.");
  if (file.size > MAX_SOURCE_IMAGE_BYTES) throw new Error("La imagen es demasiado grande. El máximo permitido es 12 MB.");
  if (!globalThis.document || !globalThis.Image || !globalThis.FileReader) throw new Error("Este navegador no puede procesar imágenes pegadas.");

  const source = await loadBrowserImage(file);
  const sourceWidth = source.naturalWidth || source.width;
  const sourceHeight = source.naturalHeight || source.height;
  if (!sourceWidth || !sourceHeight) throw new Error("La imagen no contiene dimensiones válidas.");

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Este navegador no puede preparar la imagen.");

  let scale = Math.min(1, 1280 / Math.max(sourceWidth, sourceHeight));
  let dataUrl = "";
  let outputWidth = 0;
  let outputHeight = 0;
  const qualities = [0.84, 0.74, 0.64, 0.54];

  for (let attempt = 0; attempt < 8; attempt += 1) {
    outputWidth = Math.max(1, Math.round(sourceWidth * scale));
    outputHeight = Math.max(1, Math.round(sourceHeight * scale));
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    context.clearRect(0, 0, outputWidth, outputHeight);
    context.drawImage(source, 0, 0, outputWidth, outputHeight);
    const quality = qualities[Math.min(attempt, qualities.length - 1)];
    const blob = await canvasBlob(canvas, "image/webp", quality)
      ?? await canvasBlob(canvas, "image/jpeg", quality);
    if (!blob) throw new Error("No fue posible comprimir la imagen.");
    dataUrl = await blobToDataUrl(blob);
    if (dataUrl.length <= MAX_LEARNING_IMAGE_DATA_URL_LENGTH) break;
    scale *= 0.78;
  }

  if (!isLearningImageDataUrl(dataUrl)) throw new Error("No fue posible reducir la imagen lo suficiente. Prueba con otra más pequeña.");
  return {
    id: createId("note-image"),
    dataUrl,
    alt: imageAlt(file),
    width: outputWidth,
    height: outputHeight,
  };
}
