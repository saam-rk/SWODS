export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const IMAGE_LONG_EDGE = 2000;
export const THUMBNAIL_LONG_EDGE = 500;
const MAX_IMAGE_PIXELS = 50_000_000;

export type ProcessedImage = {
  image: Blob;
  thumbnail: Blob;
  width: number;
  height: number;
  thumbnailWidth: number;
  thumbnailHeight: number;
  mimeType: string;
  extension: "webp" | "jpg";
  originalBytes: number;
};

export function validateImageFile(file: File) {
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") throw new Error("Please choose a raster image file.");
  if (file.size === 0 || file.size > MAX_IMAGE_BYTES) throw new Error("Choose a non-empty image smaller than 20 MB.");
}

export async function processImage(file: File): Promise<ProcessedImage> {
  validateImageFile(file);
  // Modern ImageBitmap and HTMLImageElement decoders apply EXIF orientation.
  // Applying it again rotates phone photographs twice. Canvas re-encoding
  // keeps only decoded pixels, never the original EXIF/GPS data.
  const source = await loadImageSource(file);
  try {
    const width = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
    const height = source instanceof HTMLImageElement ? source.naturalHeight : source.height;
    if (width * height > MAX_IMAGE_PIXELS) throw new Error("This image has too many pixels.");
    const imageCanvas = renderCanvas(source, width, height, IMAGE_LONG_EDGE);
    const thumbnailCanvas = renderCanvas(source, width, height, THUMBNAIL_LONG_EDGE);
    const image = await canvasToBlob(imageCanvas);
    const thumbnail = await canvasToBlob(thumbnailCanvas, 0.78, image.type);
    return {
      image, thumbnail, width: imageCanvas.width, height: imageCanvas.height,
      thumbnailWidth: thumbnailCanvas.width, thumbnailHeight: thumbnailCanvas.height,
      mimeType: image.type, extension: image.type === "image/webp" ? "webp" : "jpg", originalBytes: file.size,
    };
  } finally {
    if ("close" in source) source.close();
  }
}

export async function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("The processed image could not be read."));
    });
    reader.addEventListener("error", () => reject(reader.error ?? new Error("The processed image could not be read.")));
    reader.readAsDataURL(blob);
  });
}

type ImageSource = ImageBitmap | HTMLImageElement;
async function loadImageSource(file: File): Promise<ImageSource> {
  if (typeof createImageBitmap === "function") {
    try { return await createImageBitmap(file, { imageOrientation: "from-image" }); }
    catch { /* Try the native image decoder for formats not supported by ImageBitmap. */ }
  }
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = "async";
  image.src = objectUrl;
  try { await image.decode(); return image; }
  finally { URL.revokeObjectURL(objectUrl); }
}

function renderCanvas(source: ImageSource, width: number, height: number, maxLongEdge: number) {
  const dimensions = getResizedDimensions(width, height, maxLongEdge);
  const canvas = document.createElement("canvas");
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser could not prepare the image.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export function getResizedDimensions(width: number, height: number, maxLongEdge: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new Error("The image has no usable dimensions.");
  if (!Number.isFinite(maxLongEdge) || maxLongEdge <= 0) throw new Error("The image size limit is invalid.");
  const scale = Math.min(1, maxLongEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), scale };
}

async function canvasToBlob(canvas: HTMLCanvasElement, quality = 0.84, preferredType = "image/webp"): Promise<Blob> {
  const preferred = await toBlob(canvas, preferredType, quality);
  // Unsupported encoders may silently return PNG, not null.
  if (preferred?.type === preferredType) return preferred;
  const jpeg = await toBlob(canvas, "image/jpeg", quality);
  if (jpeg?.type !== "image/jpeg") throw new Error("This browser could not encode the image.");
  return jpeg;
}
function toBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}
