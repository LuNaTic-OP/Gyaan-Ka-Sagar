import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export { pdfjsLib };

export interface InspectedPdfMetadata {
  pageCount: number;
  extractedPreviewText: string;
  coverBlob: Blob | null;
}

/**
 * Uses PDF.js in the browser to read page count, render page 1 as a crisp JPEG thumbnail,
 * and extract text from the opening 5 pages for scholarly AI summary generation.
 */
export async function inspectPdfFile(file: File): Promise<InspectedPdfMetadata> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;

  const pageCount = pdf.numPages;

  // Render first page as cover thumbnail (~420px wide)
  let coverBlob: Blob | null = null;
  try {
    const firstPage = await pdf.getPage(1);
    const baseViewport = firstPage.getViewport({ scale: 1 });
    const targetWidth = 420;
    const scale = Math.min(2, Math.max(0.5, targetWidth / baseViewport.width));
    const viewport = firstPage.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d');

    if (ctx) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await firstPage.render({ canvasContext: ctx, viewport, canvas }).promise;
      coverBlob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.84)
      );
    }
  } catch (err) {
    console.warn('Could not render PDF cover thumbnail:', err);
  }

  // Extract opening text from up to first 5 pages (capped at 6000 chars)
  const textChunks: string[] = [];
  const pagesToScan = Math.min(pageCount, 5);
  for (let p = 1; p <= pagesToScan; p++) {
    try {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (pageText) {
        textChunks.push(pageText);
      }
      if (textChunks.join('\n').length >= 6000) break;
    } catch {
      // Skip unreadable page
    }
  }

  await loadingTask.destroy();

  return {
    pageCount,
    extractedPreviewText: textChunks.join('\n\n').slice(0, 6000),
    coverBlob,
  };
}
