import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Minus,
  Plus,
  RotateCcw,
  X,
} from 'lucide-react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { Book } from '../types/library';
import { pdfjsLib } from '../utils/pdfUtils';
import {
  downloadBookPdfFile,
  fetchPdfBytesForViewer,
} from '../services/libraryService';

interface PdfViewerProps {
  book: Book | null;
  canDownload: boolean;
  onClose: () => void;
}

export function PdfViewer({ book, canDownload, onClose }: PdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageInput, setPageInput] = useState('1');
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.25);
  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load PDF document via visibility-enforced fetch
  useEffect(() => {
    if (!book) return;
    let cancelled = false;
    let activeTask: ReturnType<typeof pdfjsLib.getDocument> | null = null;

    setLoading(true);
    setError(null);
    setPageNumber(1);
    setPageInput('1');
    setNumPages(0);
    setPdfDoc(null);

    fetchPdfBytesForViewer(book)
      .then((buffer) => {
        if (cancelled) return null;
        activeTask = pdfjsLib.getDocument({ data: buffer });
        return activeTask.promise;
      })
      .then((doc) => {
        if (cancelled) {
          void activeTask?.destroy();
          return;
        }
        if (doc) {
          setPdfDoc(doc);
          setNumPages(doc.numPages);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Unable to open this PDF document.'
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      if (activeTask) {
        void activeTask.destroy();
      }
    };
  }, [book]);

  // Render active page onto high-DPI canvas
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;
    let cancelled = false;
    let renderTask: { cancel: () => void; promise: Promise<void> } | null = null;

    setRendering(true);
    pdfDoc
      .getPage(pageNumber)
      .then((page) => {
        if (cancelled || !canvasRef.current) return;
        const outputScale = window.devicePixelRatio || 1;
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        if (!context) return;

        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        const transform =
          outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined;

        renderTask = page.render({
          canvasContext: context,
          transform,
          viewport,
          canvas,
        });
        return renderTask.promise;
      })
      .catch((err: unknown) => {
        if (!cancelled && err instanceof Error && err.name !== 'RenderingCancelledException') {
          console.error('PDF page render error:', err);
        }
      })
      .finally(() => {
        if (!cancelled) setRendering(false);
      });

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [pdfDoc, pageNumber, scale]);

  // Keyboard navigation
  useEffect(() => {
    if (!book) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        setPageNumber((p) => {
          const next = Math.min(numPages || 1, p + 1);
          setPageInput(String(next));
          return next;
        });
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        setPageNumber((p) => {
          const next = Math.max(1, p - 1);
          setPageInput(String(next));
          return next;
        });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [book, numPages, onClose]);

  if (!book) return null;

  const goToPage = (target: number) => {
    const clamped = Math.max(1, Math.min(numPages || 1, target));
    setPageNumber(clamped);
    setPageInput(String(clamped));
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Reading ${book.title}`}
      className="fixed inset-0 z-50 flex flex-col bg-[#F2EDE4]"
      onContextMenu={(e) => {
        if (!canDownload) e.preventDefault();
      }}
    >
      {/* Reader Header Toolbar */}
      <header className="bg-white border-b border-[#E8E2D6] px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close PDF reader"
            className="w-11 h-11 inline-flex items-center justify-center rounded-xl border border-[#E8E2D6] text-[#2B2B2B] hover:border-[#2F5D62] hover:text-[#2F5D62] transition-colors shrink-0 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h2 className="font-serif text-base font-semibold text-[#2B2B2B] truncate">
              {book.title}
            </h2>
            <p className="text-xs text-[#6B6B6B] truncate">{book.author}</p>
          </div>
        </div>

        {/* Page & Zoom Controls */}
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <div className="flex items-center gap-1 bg-[#FAF7F2] border border-[#E8E2D6] rounded-xl p-1">
            <button
              type="button"
              disabled={pageNumber <= 1}
              onClick={() => goToPage(pageNumber - 1)}
              aria-label="Previous page"
              className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-[#2B2B2B] hover:bg-white disabled:opacity-35 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const parsed = parseInt(pageInput, 10);
                if (!isNaN(parsed)) goToPage(parsed);
              }}
              className="flex items-center gap-1.5 px-1.5 text-xs tabular-nums"
            >
              <label htmlFor="pdf-page-input" className="sr-only">
                Current page number
              </label>
              <input
                id="pdf-page-input"
                type="text"
                inputMode="numeric"
                value={pageInput}
                onChange={(e) => setPageInput(e.target.value)}
                className="w-11 h-8 text-center rounded-md bg-white border border-[#E8E2D6] text-[#2B2B2B]"
              />
              <span className="text-[#6B6B6B]">/ {numPages || '—'}</span>
            </form>

            <button
              type="button"
              disabled={pageNumber >= numPages}
              onClick={() => goToPage(pageNumber + 1)}
              aria-label="Next page"
              className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-[#2B2B2B] hover:bg-white disabled:opacity-35 cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-1 bg-[#FAF7F2] border border-[#E8E2D6] rounded-xl p-1">
            <button
              type="button"
              onClick={() => setScale((s) => Math.max(0.6, +(s - 0.15).toFixed(2)))}
              aria-label="Zoom out"
              className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-[#2B2B2B] hover:bg-white cursor-pointer"
            >
              <Minus className="w-4 h-4" />
            </button>
            <span className="px-1.5 text-xs font-medium text-[#2B2B2B] tabular-nums min-w-[44px] text-center">
              {Math.round(scale * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setScale((s) => Math.min(2.5, +(s + 0.15).toFixed(2)))}
              aria-label="Zoom in"
              className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-[#2B2B2B] hover:bg-white cursor-pointer"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setScale(1.25)}
              aria-label="Reset zoom"
              className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-[#6B6B6B] hover:text-[#2B2B2B] hover:bg-white cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          {canDownload && (
            <button
              type="button"
              onClick={() => void downloadBookPdfFile(book)}
              className="inline-flex items-center gap-2 min-h-[42px] px-4 rounded-xl bg-[#2F5D62] text-white text-xs sm:text-sm font-medium hover:bg-[#244A4E] transition-colors whitespace-nowrap cursor-pointer"
            >
              <Download className="w-4 h-4" aria-hidden="true" />
              <span className="hidden sm:inline">Download</span>
            </button>
          )}
        </div>
      </header>

      {/* Canvas Reading Surface */}
      <div className="flex-1 overflow-auto p-4 sm:p-8 flex justify-center items-start">
        {loading ? (
          <div className="my-auto text-center">
            <p className="font-serif text-lg text-[#2B2B2B] mb-1">Opening volume...</p>
            <p className="text-xs text-[#6B6B6B]">Rendering pages with PDF.js</p>
          </div>
        ) : error ? (
          <div className="my-auto max-w-md bg-white border border-[#E8E2D6] rounded-2xl p-6 text-center">
            <p className="font-serif text-lg font-semibold text-[#2B2B2B] mb-2">
              Unable to open PDF
            </p>
            <p className="text-sm text-[#6B6B6B] mb-5">{error}</p>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#2F5D62] text-white text-sm font-medium hover:bg-[#244A4E] transition-colors cursor-pointer"
            >
              Return to Library
            </button>
          </div>
        ) : (
          <div className="relative bg-white shadow-[0_8px_32px_rgba(43,43,43,0.12)] border border-[#E8E2D6]">
            <canvas ref={canvasRef} className="block" />
            {rendering && (
              <div className="absolute inset-0 bg-white/40 pointer-events-none" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
