export type MosaicTile = {
  id: string;
  src?: string;
  tone?: "clay" | "river" | "moss" | "sun" | "ink";
};

export type MosaicProgress = {
  completed: number;
  total: number;
};

export type MosaicResult = {
  dataUrl: string;
  blob: Blob;
  width: number;
  height: number;
  columns: number;
  rows: number;
  algorithmVersion: "tone-opacity-v1";
};

export type MosaicGrid = {
  width: number;
  height: number;
  columns: number;
  rows: number;
};

const fallbackColors: Record<NonNullable<MosaicTile["tone"]>, string> = {
  clay: "#a35a43",
  river: "#6f8988",
  moss: "#617653",
  sun: "#be7c4e",
  ink: "#344646",
};

/**
 * Tone/opacity v1 deliberately keeps tile selection simple and deterministic.
 * The target cell supplies the colour and luminance; the participant thumbnail
 * supplies the texture. Average-colour matching can replace chooseTile in v2
 * without changing the UI or storage contract.
 */
export async function generateToneOpacityMosaic(
  targetSource: string,
  tiles: MosaicTile[],
  options: {
    maxWidth?: number;
    columns?: number;
    seed?: number;
    signal?: AbortSignal;
    onProgress?: (progress: MosaicProgress) => void;
  } = {},
): Promise<MosaicResult> {
  if (tiles.length === 0) throw new Error("At least one photograph is needed to make the mosaic.");

  const target = await loadImage(targetSource, options.signal);
  const sourceWidth = target.naturalWidth || target.width;
  const sourceHeight = target.naturalHeight || target.height;
  if (!sourceWidth || !sourceHeight) throw new Error("The target image has no usable dimensions.");

  const grid = getMosaicGrid(sourceWidth, sourceHeight, tiles.length, options);
  const { width, height, columns, rows } = grid;
  const cellWidth = width / columns;
  const cellHeight = height / rows;

  const targetCanvas = document.createElement("canvas");
  targetCanvas.width = width;
  targetCanvas.height = height;
  const targetContext = targetCanvas.getContext("2d");
  if (!targetContext) throw new Error("Canvas is not available in this browser.");
  targetContext.drawImage(target, 0, 0, width, height);
  const targetPixels = targetContext.getImageData(0, 0, width, height).data;

  const loadedTiles = await Promise.all(tiles.map(async (tile) => ({ tile, image: tile.src ? await loadImage(tile.src, options.signal) : null })));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is not available in this browser.");

  context.fillStyle = "#1b2823";
  context.fillRect(0, 0, width, height);
  const total = columns * rows;
  options.onProgress?.({ completed: 0, total });

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      throwIfAborted(options.signal);
      const cellX = Math.floor(column * cellWidth);
      const cellY = Math.floor(row * cellHeight);
      const nextX = Math.min(width, Math.ceil((column + 1) * cellWidth));
      const nextY = Math.min(height, Math.ceil((row + 1) * cellHeight));
      const sample = sampleCell(targetPixels, width, height, cellX, cellY, nextX, nextY);
      const tile = loadedTiles[selectMosaicTileIndex(row, column, loadedTiles.length, options.seed ?? 1)];

      context.save();
      context.globalAlpha = 0.6 + sample.luminance * 0.2;
      if (tile.image) drawCover(context, tile.image, cellX, cellY, nextX - cellX, nextY - cellY);
      else {
        context.fillStyle = fallbackColors[tile.tile.tone ?? "ink"];
        context.fillRect(cellX, cellY, nextX - cellX, nextY - cellY);
      }
      context.globalAlpha = 0.58;
      context.globalCompositeOperation = "multiply";
      context.fillStyle = `rgb(${sample.red} ${sample.green} ${sample.blue})`;
      context.fillRect(cellX, cellY, nextX - cellX, nextY - cellY);
      context.globalCompositeOperation = "source-over";
      context.globalAlpha = 0.12;
      context.fillStyle = sample.luminance > 0.62 ? "#fff8e8" : "#17241f";
      context.fillRect(cellX, cellY, nextX - cellX, nextY - cellY);
      context.restore();

      const completed = row * columns + column + 1;
      if (completed % 24 === 0 || completed === total) {
        options.onProgress?.({ completed, total });
        await yieldToBrowser();
      }
    }
  }

  const blob = await canvasToBlob(canvas);
  return {
    dataUrl: canvas.toDataURL("image/jpeg", 0.88),
    blob,
    width,
    height,
    columns,
    rows,
    algorithmVersion: "tone-opacity-v1",
  };
}

export async function downloadMosaic(source: string, fileName = "our-perspective-mosaic.jpg") {
  if (typeof document === "undefined") return;
  const response = await fetch(source);
  if (!response.ok) throw new Error("The mosaic could not be downloaded.");
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function getMosaicGrid(sourceWidth: number, sourceHeight: number, tileCount: number, options: { maxWidth?: number; columns?: number } = {}): MosaicGrid {
  if (!Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight) || sourceWidth <= 0 || sourceHeight <= 0) {
    throw new Error("The target image has no usable dimensions.");
  }
  if (!Number.isFinite(tileCount) || tileCount <= 0) throw new Error("At least one photograph is needed to make the mosaic.");

  const maxWidth = options.maxWidth ?? 1600;
  if (!Number.isFinite(maxWidth) || maxWidth < 1 || maxWidth > 4096 || (options.columns !== undefined && (!Number.isInteger(options.columns) || options.columns < 1))) throw new Error("Invalid mosaic dimensions.");
  const scale = Math.min(1, maxWidth / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const columns = Math.max(5, Math.min(options.columns ?? Math.round(Math.sqrt(tileCount * 2.2)), 32));
  const rows = Math.max(4, Math.min(64, Math.ceil(columns * (height / width))));
  return { width, height, columns, rows };
}

export function selectMosaicTileIndex(row: number, column: number, count: number, seed: number) {
  if (!Number.isInteger(count) || count <= 0) throw new Error("At least one photograph is needed to make the mosaic.");
  const hash = Math.abs((row * 73856093) ^ (column * 19349663) ^ (seed * 83492791));
  return hash % count;
}

function sampleCell(pixels: Uint8ClampedArray, width: number, height: number, startX: number, startY: number, endX: number, endY: number) {
  const x = Math.min(width - 1, Math.max(0, Math.floor((startX + endX) / 2)));
  const y = Math.min(height - 1, Math.max(0, Math.floor((startY + endY) / 2)));
  const offset = (y * width + x) * 4;
  const red = pixels[offset] ?? 0;
  const green = pixels[offset + 1] ?? 0;
  const blue = pixels[offset + 2] ?? 0;
  return { red, green, blue, luminance: (red * 0.299 + green * 0.587 + blue * 0.114) / 255 };
}

function drawCover(context: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height: number) {
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = width / height;
  let sourceX = 0;
  let sourceY = 0;
  let cropWidth = sourceWidth;
  let cropHeight = sourceHeight;
  if (sourceRatio > targetRatio) {
    cropWidth = sourceHeight * targetRatio;
    sourceX = (sourceWidth - cropWidth) / 2;
  } else {
    cropHeight = sourceWidth / targetRatio;
    sourceY = (sourceHeight - cropHeight) / 2;
  }
  context.drawImage(image, sourceX, sourceY, cropWidth, cropHeight, x, y, width, height);
}

function loadImage(source: string, signal?: AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    throwIfAborted(signal);
    const image = new Image();
    if (!source.startsWith("data:") && !source.startsWith("blob:")) image.crossOrigin = "anonymous";
    const cleanup = () => {
      image.onload = null;
      image.onerror = null;
      signal?.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      cleanup();
      reject(new DOMException("Mosaic generation was cancelled.", "AbortError"));
    };
    image.onload = () => {
      cleanup();
      resolve(image);
    };
    image.onerror = () => {
      cleanup();
      reject(new Error("An image could not be loaded for the mosaic."));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    image.src = source;
  });
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Mosaic generation was cancelled.", "AbortError");
}

function yieldToBrowser() {
  return new Promise<void>((resolve) => window.setTimeout(resolve, 0));
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("The mosaic could not be exported.")), "image/jpeg", 0.88);
  });
}
