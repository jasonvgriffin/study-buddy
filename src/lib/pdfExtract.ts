import type { LayoutImage, LayoutLine, LayoutPage } from './figures';
import type { RegionJob } from './regions';
import { layoutLinesFromGlyphs, linesFromGlyphs, type Glyph, type PositionedLine } from './pdfLayout';
import { encodePng, fitRgba } from './png';
import type { TextPage } from './types';

type PdfItem = {
  str?: string;
  transform?: number[];
  width?: number;
};

type PdfObjStore = {
  get: (name: string, callback?: (value: unknown) => void) => unknown;
};

type PdfPage = {
  getTextContent: () => Promise<{ items: PdfItem[] }>;
  getOperatorList: () => Promise<{ fnArray: ArrayLike<number>; argsArray: ArrayLike<unknown> }>;
  getViewport: (params: { scale: number }) => {
    width: number;
    height: number;
    convertToViewportPoint: (x: number, y: number) => number[];
  };
  objs?: PdfObjStore;
  commonObjs?: PdfObjStore;
  render: (params: {
    canvasContext: CanvasRenderingContext2D;
    viewport: {
      width: number;
      height: number;
      convertToViewportPoint: (x: number, y: number) => number[];
    };
    canvas: HTMLCanvasElement;
  }) => { promise: Promise<void> };
};

type PdfDoc = {
  numPages: number;
  getPage: (n: number) => Promise<PdfPage>;
};

type Matrix = [number, number, number, number, number, number];

type PdfModule = {
  getDocument: (src: {
    data: Uint8Array;
    disableWorker?: boolean;
    useSystemFonts?: boolean;
  }) => { promise: Promise<PdfDoc> };
  GlobalWorkerOptions: { workerSrc: string };
  OPS: {
    save: number;
    restore: number;
    transform: number;
    paintFormXObjectBegin: number;
    paintFormXObjectEnd: number;
    paintImageXObject: number;
    paintInlineImageXObject: number;
  };
};

type RawImage = {
  width?: number;
  height?: number;
  kind?: number;
  data?: Uint8Array | Uint8ClampedArray;
};

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

async function loadPdfModule(): Promise<PdfModule> {
  if (typeof window === 'undefined') {
    return (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as PdfModule;
  }
  const pdfjs = (await import('pdfjs-dist')) as unknown as PdfModule;
  const { workerUrl } = await import('./pdfWorker');
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  return pdfjs;
}

async function openDocument(data: Uint8Array): Promise<{ doc: PdfDoc; ops: PdfModule['OPS'] }> {
  const pdfjs = await loadPdfModule();
  const doc = await pdfjs.getDocument(
    typeof window === 'undefined'
      ? { data, disableWorker: true, useSystemFonts: true }
      : { data },
  ).promise;
  return { doc, ops: pdfjs.OPS };
}

function dedupePieces(lines: PositionedLine[]): PositionedLine[] {
  const out: PositionedLine[] = [];
  for (const line of lines) {
    const prev = out[out.length - 1];
    if (prev && prev.text === line.text && Math.abs(prev.y - line.y) < 2.5 && Math.abs(prev.x - line.x) < 8) continue;
    out.push(line);
  }
  return out;
}

function glyphsOf(items: PdfItem[]): Glyph[] {
  const glyphs: Glyph[] = [];
  for (const item of items) {
    if (!item.str || !item.transform) continue;
    glyphs.push({
      str: item.str,
      x: item.transform[4] ?? 0,
      y: item.transform[5] ?? 0,
      w: item.width ?? 0,
    });
  }
  return glyphs;
}

function multiply(m1: Matrix, m2: Matrix): Matrix {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

function asMatrix(value: unknown): Matrix | null {
  if (!value || typeof value !== 'object') return null;
  const list = Array.from(value as ArrayLike<unknown>);
  if (list.length < 6) return null;
  const nums = list.slice(0, 6).map((item) => Number(item));
  if (nums.some((item) => !Number.isFinite(item))) return null;
  return nums as Matrix;
}

function unitBox(ctm: Matrix): { x: number; y: number; w: number; h: number } {
  const [a, b, c, d, e, f] = ctm;
  const xs = [e, a + e, c + e, a + c + e];
  const ys = [f, b + f, d + f, b + d + f];
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

function pixelsFromPdfImage(img: RawImage): Uint8ClampedArray | null {
  const width = img.width ?? 0;
  const height = img.height ?? 0;
  const data = img.data;
  if (!width || !height || !data) return null;
  const pixels = width * height;
  const out = new Uint8ClampedArray(pixels * 4);
  if (data.length === pixels * 4) {
    out.set(data);
    return out;
  }
  if (data.length === pixels * 3) {
    for (let i = 0, j = 0; i < pixels; i += 1, j += 3) {
      const offset = i * 4;
      out[offset] = data[j];
      out[offset + 1] = data[j + 1];
      out[offset + 2] = data[j + 2];
      out[offset + 3] = 255;
    }
    return out;
  }
  if (data.length === pixels) {
    for (let i = 0; i < pixels; i += 1) {
      const offset = i * 4;
      out[offset] = data[i];
      out[offset + 1] = data[i];
      out[offset + 2] = data[i];
      out[offset + 3] = 255;
    }
    return out;
  }
  return null;
}

async function pngFromRaw(img: RawImage): Promise<Blob | null> {
  const rgba = pixelsFromPdfImage(img);
  const width = img.width ?? 0;
  const height = img.height ?? 0;
  if (!rgba || !width || !height) return null;
  const fitted = fitRgba(rgba, width, height, 1400);
  return encodePng(fitted.width, fitted.height, fitted.rgba);
}

function isRawImage(value: unknown): value is RawImage {
  if (!value || typeof value !== 'object') return false;
  const record = value as RawImage;
  return typeof record.width === 'number' && typeof record.height === 'number' && !!record.data;
}

async function readStore(store: PdfObjStore | undefined, name: string): Promise<unknown> {
  if (!store?.get) return null;
  try {
    const value = store.get(name);
    if (value && typeof (value as Promise<unknown>).then === 'function') return await (value as Promise<unknown>);
    if (isRawImage(value)) return value;
  } catch {
    // Some builds only support the callback form.
  }
  return new Promise((resolve) => {
    try {
      store.get(name, resolve);
    } catch {
      resolve(null);
    }
  });
}

async function readNamedImage(page: PdfPage, name: string): Promise<RawImage | null> {
  const fromPage = await readStore(page.objs, name);
  if (isRawImage(fromPage)) return fromPage;
  const common = await readStore(page.commonObjs, name);
  return isRawImage(common) ? common : null;
}

type StoredImage = LayoutImage & { name: string | null; inline: RawImage | null };

function imagePlacements(
  opList: { fnArray: ArrayLike<number>; argsArray: ArrayLike<unknown> },
  ops: PdfModule['OPS'],
  page: number,
): { placed: StoredImage[] } {
  let ctm: Matrix = IDENTITY;
  const stack: Matrix[] = [];
  const placed: StoredImage[] = [];
  const fns = Array.from(opList.fnArray);
  const argsList = Array.from(opList.argsArray);
  for (let i = 0; i < fns.length; i += 1) {
    const fn = fns[i];
    const args = argsList[i];
    if (fn === ops.save) {
      stack.push(ctm);
      continue;
    }
    if (fn === ops.restore) {
      ctm = stack.pop() ?? IDENTITY;
      continue;
    }
    if (fn === ops.transform) {
      const matrix = asMatrix(args) ?? (Array.isArray(args) ? asMatrix(args[0]) : null);
      if (matrix) ctm = multiply(ctm, matrix);
      continue;
    }
    if (fn === ops.paintFormXObjectBegin) {
      stack.push(ctm);
      const matrix = Array.isArray(args) ? asMatrix(args[0]) : null;
      if (matrix) ctm = multiply(ctm, matrix);
      continue;
    }
    if (fn === ops.paintFormXObjectEnd) {
      ctm = stack.pop() ?? IDENTITY;
      continue;
    }
    if (fn !== ops.paintImageXObject && fn !== ops.paintInlineImageXObject) continue;
    const box = unitBox(ctm);
    if (box.w < 1 || box.h < 1) continue;
    const arg0 = Array.isArray(args) ? args[0] : args;
    const name = typeof arg0 === 'string' ? arg0 : null;
    const inline = !name && isRawImage(arg0) ? arg0 : null;
    placed.push({ page, ...box, name, inline });
  }
  return { placed };
}

export type PdfStudyExtract = {
  textPages: TextPage[];
  pageCount: number;
  pageSizes: LayoutPage[];
  lines: LayoutLine[];
  chrome: { page: number; text: string; y: number }[];
  images: LayoutImage[];
  rasterize: (imageIndexes: number[]) => Promise<Map<number, Blob>>;
  renderRegions: (jobs: RegionJob[]) => Promise<Map<string, Blob>>;
};

export async function extractPdfStudy(
  data: Uint8Array,
  onProgress?: (page: number, total: number) => void,
): Promise<PdfStudyExtract> {
  const { doc, ops } = await openDocument(data);
  const textPages: TextPage[] = [];
  const pageSizes: LayoutPage[] = [];
  const lines: LayoutLine[] = [];
  const chrome: { page: number; text: string; y: number }[] = [];
  const stored: StoredImage[] = [];

  for (let number = 1; number <= doc.numPages; number += 1) {
    onProgress?.(number, doc.numPages);
    const page = await doc.getPage(number);
    const viewport = page.getViewport({ scale: 1 });
    pageSizes.push({ page: number, width: viewport.width, height: viewport.height });
    const content = await page.getTextContent();
    const glyphs = glyphsOf(content.items);
    const layout = layoutLinesFromGlyphs(glyphs);
    const fine = layoutLinesFromGlyphs(glyphs, 8);
    for (const line of layout.lines) lines.push({ page: number, ...line });
    for (const item of layout.chrome) chrome.push({ page: number, text: item.text, y: item.y });
    textPages.push({ lines: linesFromGlyphs(glyphs), pieces: dedupePieces(fine.lines) });
    try {
      const opList = await page.getOperatorList();
      const { placed } = imagePlacements(opList, ops, number);
      stored.push(...placed);
    } catch {
      // A page with broken image operators still keeps its text.
    }
    if (number % 8 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
  }

  const images: LayoutImage[] = stored.map(({ page, x, y, w, h }) => ({ page, x, y, w, h }));

  return {
    textPages,
    pageCount: doc.numPages,
    pageSizes,
    lines,
    chrome,
    images,
    renderRegions: async (jobs: RegionJob[]) => {
      const out = new Map<string, Blob>();
      for (const job of jobs) {
        const blob = await renderJob(doc, job);
        if (blob) out.set(job.id, blob);
      }
      return out;
    },
    rasterize: async (imageIndexes: number[]) => {
      const want = new Set(imageIndexes);
      const out = new Map<number, Blob>();
      const pending = new Map<number, number[]>();
      for (const index of want) {
        const image = stored[index];
        if (!image) continue;
        if (image.inline) {
          const blob = await pngFromRaw(image.inline);
          if (blob) out.set(index, blob);
          continue;
        }
        const list = pending.get(image.page) ?? [];
        list.push(index);
        pending.set(image.page, list);
      }
      for (const [pageNo, indexes] of pending) {
        const page = await doc.getPage(pageNo);
        if (typeof document !== 'undefined') {
          try {
            const cropped = await cropFigures(page, indexes, stored);
            for (const [index, blob] of cropped) out.set(index, blob);
          } catch {
            // Keep the questions even when a page cannot be drawn.
          }
          continue;
        }
        await page.getOperatorList();
        for (const index of indexes) {
          const image = stored[index];
          if (!image?.name) continue;
          const raw = await readNamedImage(page, image.name);
          if (!raw) continue;
          const blob = await pngFromRaw(raw);
          if (blob) out.set(index, blob);
        }
      }
      return out;
    },
  };
}

async function cropFigures(
  page: PdfPage,
  indexes: number[],
  stored: StoredImage[],
): Promise<Map<number, Blob>> {
  const out = new Map<number, Blob>();
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(viewport.width));
  canvas.height = Math.max(1, Math.ceil(viewport.height));
  const context = canvas.getContext('2d');
  if (!context) return out;
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  const task = page.render({ canvasContext: context, viewport, canvas });
  await task.promise;
  for (const index of indexes) {
    const image = stored[index];
    if (!image) continue;
    const [x1, y1] = viewport.convertToViewportPoint(image.x, image.y);
    const [x2, y2] = viewport.convertToViewportPoint(image.x + image.w, image.y + image.h);
    const left = Math.max(0, Math.min(x1, x2));
    const top = Math.max(0, Math.min(y1, y2));
    const width = Math.min(canvas.width - left, Math.abs(x2 - x1));
    const height = Math.min(canvas.height - top, Math.abs(y2 - y1));
    if (width < 2 || height < 2) continue;
    const longest = Math.max(width, height);
    const fit = longest > 1400 ? 1400 / longest : 1;
    const target = document.createElement('canvas');
    target.width = Math.max(1, Math.round(width * fit));
    target.height = Math.max(1, Math.round(height * fit));
    const targetContext = target.getContext('2d');
    if (!targetContext) continue;
    targetContext.drawImage(canvas, left, top, width, height, 0, 0, target.width, target.height);
    const blob = await new Promise<Blob | null>((resolve) => target.toBlob((value) => resolve(value), 'image/png'));
    if (blob) out.set(index, blob);
  }
  return out;
}

type PaintCanvas = {
  width: number;
  height: number;
  getContext: (kind: '2d') => CanvasRenderingContext2D | null;
  toBlob?: (callback: (blob: Blob | null) => void, type?: string) => void;
  toBuffer?: (type: 'image/png') => Uint8Array;
};

async function paintCanvas(width: number, height: number): Promise<PaintCanvas | null> {
  const w = Math.max(1, Math.ceil(width));
  const h = Math.max(1, Math.ceil(height));
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    return canvas;
  }
  const napi = (await import(/* @vite-ignore */ '@napi-rs/canvas')) as unknown as {
    createCanvas: (width: number, height: number) => PaintCanvas;
  };
  return napi.createCanvas(w, h);
}

async function canvasToBlob(canvas: PaintCanvas): Promise<Blob | null> {
  if (canvas.toBlob) {
    return new Promise((resolve) => canvas.toBlob?.((value) => resolve(value), 'image/png'));
  }
  if (!canvas.toBuffer) return null;
  const buffer = canvas.toBuffer('image/png');
  const copy = new Uint8Array(buffer.byteLength);
  copy.set(buffer);
  return new Blob([copy]);
}

async function renderJob(doc: PdfDoc, job: RegionJob): Promise<Blob | null> {
  const scale = 2;
  const slices: PaintCanvas[] = [];
  for (const box of job.boxes) {
    const page = await doc.getPage(box.page);
    const viewport = page.getViewport({ scale });
    const [, yTop] = viewport.convertToViewportPoint(0, box.top);
    const [, yBottom] = viewport.convertToViewportPoint(0, box.bottom);
    const top = Math.max(0, Math.min(yTop, yBottom));
    const cropHeight = Math.min(viewport.height - top, Math.abs(yBottom - yTop));
    const cropWidth = viewport.width;
    if (cropWidth < 8 || cropHeight < 8) continue;
    const longest = Math.max(cropWidth, cropHeight);
    const fit = longest > 1800 ? 1800 / longest : 1;
    const full = await paintCanvas(viewport.width, viewport.height);
    const target = await paintCanvas(cropWidth * fit, cropHeight * fit);
    if (!full || !target) continue;
    const fullContext = full.getContext('2d');
    const targetContext = target.getContext('2d');
    if (!fullContext || !targetContext) continue;
    fullContext.fillStyle = '#ffffff';
    fullContext.fillRect(0, 0, viewport.width, viewport.height);
    await page.render({
      canvasContext: fullContext,
      viewport,
      canvas: full as unknown as HTMLCanvasElement,
    }).promise;
    targetContext.fillStyle = '#ffffff';
    targetContext.fillRect(0, 0, target.width, target.height);
    targetContext.drawImage(full as unknown as CanvasImageSource, 0, top, cropWidth, cropHeight, 0, 0, target.width, target.height);
    slices.push(target);
  }
  if (!slices.length) return null;
  if (slices.length === 1) return canvasToBlob(slices[0]);
  const width = Math.max(...slices.map((slice) => slice.width));
  const height = slices.reduce((sum, slice) => sum + slice.height, 0);
  const stacked = await paintCanvas(width, height);
  const context = stacked?.getContext('2d');
  if (!stacked || !context) return null;
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  let y = 0;
  for (const slice of slices) {
    context.drawImage(slice as unknown as CanvasImageSource, 0, y);
    y += slice.height;
  }
  return canvasToBlob(stacked);
}

export async function extractPdfPages(
  data: Uint8Array,
  onProgress?: (page: number, total: number) => void,
): Promise<TextPage[]> {
  const { doc } = await openDocument(data);
  const pages: TextPage[] = [];
  for (let number = 1; number <= doc.numPages; number += 1) {
    onProgress?.(number, doc.numPages);
    const page = await doc.getPage(number);
    const content = await page.getTextContent();
    pages.push({ lines: linesFromGlyphs(glyphsOf(content.items)) });
    if (number % 8 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return pages;
}
