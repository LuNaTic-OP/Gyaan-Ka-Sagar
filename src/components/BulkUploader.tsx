import React, { useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Files,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react';
import { useLibrary } from '../context/LibraryContext';
import { MAX_PDF_SIZE_BYTES, type Book } from '../types/library';
import {
  formatFileSize,
  makeSafeId,
  normalizeFilename,
} from '../utils/catalogHelpers';
import {
  createBookRecord,
  updateBookRecord,
  uploadPdfFileWithInspection,
} from '../services/libraryService';

interface BulkQueueItem {
  localId: string;
  file: File;
  matchedBook?: Book;
  title: string;
  author: string;
  category: string;
  status: 'queued' | 'uploading' | 'done' | 'error';
  progress: number;
  errorMessage?: string;
}

export function BulkUploader() {
  const { books, categories, user } = useLibrary();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [items, setItems] = useState<BulkQueueItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [running, setRunning] = useState(false);

  const addFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    const existingNames = new Set(items.map((it) => normalizeFilename(it.file.name)));
    const nextItems: BulkQueueItem[] = [];

    Array.from(fileList).forEach((file) => {
      const norm = normalizeFilename(file.name);
      if (existingNames.has(norm)) return;
      existingNames.add(norm);

      const isPdf =
        file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      const tooLarge = file.size > MAX_PDF_SIZE_BYTES;
      const match = books.find((b) => normalizeFilename(b.filename) === norm);

      const fallbackTitle = file.name
        .replace(/\.pdf$/i, '')
        .replace(/[_]+/g, ' ')
        .trim();

      nextItems.push({
        localId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        matchedBook: match,
        title: match?.title || fallbackTitle,
        author: match?.author || 'UNKNOWN - read from PDF cover',
        category: match?.category || categories[0]?.name || 'Other',
        status: !isPdf || tooLarge ? 'error' : 'queued',
        progress: 0,
        errorMessage: !isPdf
          ? 'Not a PDF file'
          : tooLarge
          ? 'Exceeds 100 MB limit'
          : undefined,
      });
    });

    setItems((prev) => [...prev, ...nextItems]);
    if (inputRef.current) inputRef.current.value = '';
  };

  const updateItemField = (
    localId: string,
    patch: Partial<Pick<BulkQueueItem, 'title' | 'author' | 'category'>>
  ) => {
    setItems((prev) =>
      prev.map((it) => (it.localId === localId ? { ...it, ...patch } : it))
    );
  };

  const removeItem = (localId: string) => {
    setItems((prev) => prev.filter((it) => it.localId !== localId));
  };

  const uploadSingleItem = async (item: BulkQueueItem) => {
    if (!user) return;
    setItems((prev) =>
      prev.map((it) =>
        it.localId === item.localId
          ? { ...it, status: 'uploading', progress: 2, errorMessage: undefined }
          : it
      )
    );

    try {
      const targetBookId =
        item.matchedBook?.id ||
        makeSafeId(item.file.name || `${item.title}-${Date.now()}`, 'book');

      const uploaded = await uploadPdfFileWithInspection(
        item.file,
        targetBookId,
        (pct) => {
          setItems((prev) =>
            prev.map((it) =>
              it.localId === item.localId ? { ...it, progress: pct } : it
            )
          );
        }
      );

      const cleanedAuthor = item.author.trim() || 'UNKNOWN - read from PDF cover';
      const authorNeedsCheck = /^UNKNOWN/i.test(cleanedAuthor);

      if (item.matchedBook) {
        await updateBookRecord(item.matchedBook.id, {
          filename: item.file.name,
          title: item.title.trim() || item.matchedBook.title,
          author: cleanedAuthor,
          category: item.category,
          authorNeedsCheck,
          hasPdf: true,
          pdfStorageType: uploaded.pdfStorageType,
          pdfStoragePath: uploaded.pdfStoragePath,
          ...(uploaded.pdfUrl ? { pdfUrl: uploaded.pdfUrl } : {}),
          ...(uploaded.coverUrl ? { coverUrl: uploaded.coverUrl } : {}),
          pageCount: uploaded.pageCount,
          fileSizeBytes: uploaded.fileSizeBytes,
          extractedPreviewText: uploaded.extractedPreviewText,
        });
      } else {
        await createBookRecord(user.uid, {
          id: targetBookId,
          filename: item.file.name,
          title: item.title.trim() || item.file.name.replace(/\.pdf$/i, ''),
          author: cleanedAuthor,
          category: item.category,
          authorNeedsCheck,
          hasPdf: true,
          pdfStorageType: uploaded.pdfStorageType,
          pdfStoragePath: uploaded.pdfStoragePath,
          pdfUrl: uploaded.pdfUrl,
          coverUrl: uploaded.coverUrl,
          pageCount: uploaded.pageCount,
          fileSizeBytes: uploaded.fileSizeBytes,
          extractedPreviewText: uploaded.extractedPreviewText,
          aiGenerated: false,
        });
      }

      setItems((prev) =>
        prev.map((it) =>
          it.localId === item.localId
            ? { ...it, status: 'done', progress: 100 }
            : it
        )
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      setItems((prev) =>
        prev.map((it) =>
          it.localId === item.localId
            ? { ...it, status: 'error', errorMessage: msg }
            : it
        )
      );
    }
  };

  const runQueue = async (onlyFailed = false) => {
    const candidates = items.filter((it) =>
      onlyFailed ? it.status === 'error' && it.file.size <= MAX_PDF_SIZE_BYTES : it.status === 'queued'
    );
    if (candidates.length === 0) return;

    setRunning(true);
    // Process up to 2 PDFs concurrently so browser PDF.js rendering stays responsive for large files
    let index = 0;
    const concurrency = 2;
    const workers = Array.from({ length: Math.min(concurrency, candidates.length) }).map(
      async () => {
        while (index < candidates.length) {
          const next = candidates[index++];
          await uploadSingleItem(next);
        }
      }
    );
    await Promise.all(workers);
    setRunning(false);
  };

  const matchedCount = items.filter((i) => i.matchedBook).length;
  const queuedCount = items.filter((i) => i.status === 'queued').length;
  const doneCount = items.filter((i) => i.status === 'done').length;
  const failedCount = items.filter(
    (i) => i.status === 'error' && i.file.size <= MAX_PDF_SIZE_BYTES
  ).length;

  return (
    <div className="bg-white border border-[#E8E2D6] rounded-2xl p-6 sm:p-7 space-y-6">
      <div>
        <h2 className="font-serif text-xl font-semibold text-[#2B2B2B] mb-1">
          Bulk PDF Uploader
        </h2>
        <p className="text-sm text-[#6B6B6B]">
          Select multiple PDFs at once (up to 100 MB per file). Files are matched to your 69
          catalog entries by filename so you can review or adjust metadata before uploading.
        </p>
      </div>

      {/* Multi-file Drop Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          addFiles(e.dataTransfer.files);
        }}
        className={`rounded-2xl border-2 border-dashed p-7 text-center transition-colors ${
          dragging
            ? 'border-[#2F5D62] bg-[#2F5D62]/5'
            : 'border-[#E8E2D6] bg-[#FAF7F2]/60 hover:border-[#2F5D62]/50'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />
        <Files className="w-7 h-7 text-[#2F5D62] mx-auto mb-3" aria-hidden="true" />
        <p className="text-sm text-[#2B2B2B] mb-1">
          Drag and drop your folder of PDFs here, or{' '}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="text-[#2F5D62] font-medium hover:underline cursor-pointer"
          >
            select multiple files
          </button>
        </p>
        <p className="text-xs text-[#6B6B6B]">
          Supports files from 60 KB up to 100 MB each · Automatic catalog filename matching
        </p>
      </div>

      {items.length > 0 && (
        <>
          {/* Summary & Bulk Action Controls */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm text-[#6B6B6B] tabular-nums">
              <span>{items.length} selected</span>
              <span aria-hidden="true">·</span>
              <span className="text-[#2F5D62] font-medium">
                {matchedCount} matched to catalog
              </span>
              {doneCount > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{doneCount} completed</span>
                </>
              )}
              {failedCount > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-[#8C3B2B]">{failedCount} failed</span>
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {failedCount > 0 && (
                <button
                  type="button"
                  disabled={running}
                  onClick={() => void runQueue(true)}
                  className="inline-flex items-center gap-1.5 min-h-[40px] px-4 py-2 rounded-xl border border-[#E8E2D6] text-sm font-medium text-[#2B2B2B] hover:border-[#2F5D62] disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4" aria-hidden="true" />
                  <span>Retry Failed ({failedCount})</span>
                </button>
              )}

              <button
                type="button"
                disabled={running || queuedCount === 0}
                onClick={() => void runQueue(false)}
                className="inline-flex items-center gap-2 min-h-[40px] px-5 py-2 rounded-xl bg-[#2F5D62] text-white text-sm font-medium hover:bg-[#244A4E] disabled:opacity-50 transition-colors cursor-pointer"
              >
                <Upload className="w-4 h-4" aria-hidden="true" />
                <span>
                  {running
                    ? 'Uploading...'
                    : `Upload ${queuedCount} ${queuedCount === 1 ? 'File' : 'Files'}`}
                </span>
              </button>

              {!running && (
                <button
                  type="button"
                  onClick={() => setItems([])}
                  className="min-h-[40px] px-3 py-2 text-xs font-medium text-[#6B6B6B] hover:text-[#2B2B2B] cursor-pointer"
                >
                  Clear List
                </button>
              )}
            </div>
          </div>

          {/* Editable Confirmation Table */}
          <div className="overflow-x-auto border border-[#E8E2D6] rounded-xl">
            <table className="w-full text-left border-collapse min-w-[760px]">
              <thead>
                <tr className="bg-[#FAF7F2] border-b border-[#E8E2D6] text-xs font-medium text-[#6B6B6B]">
                  <th className="py-3 px-4">File & Match</th>
                  <th className="py-3 px-3">Title</th>
                  <th className="py-3 px-3">Author</th>
                  <th className="py-3 px-3">Category</th>
                  <th className="py-3 px-4 w-44">Progress</th>
                  <th className="py-3 px-3 w-12">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8E2D6] text-sm">
                {items.map((item) => {
                  const locked = item.status === 'uploading' || item.status === 'done';
                  return (
                    <tr key={item.localId} className="align-top">
                      <td className="py-3 px-4 max-w-[220px]">
                        <p className="text-xs font-medium text-[#2B2B2B] truncate" title={item.file.name}>
                          {item.file.name}
                        </p>
                        <div className="flex items-center gap-2 mt-1 text-[11px] tabular-nums">
                          <span className="text-[#6B6B6B]">
                            {formatFileSize(item.file.size)}
                          </span>
                          <span aria-hidden="true" className="text-[#E8E2D6]">
                            ·
                          </span>
                          <span
                            className={
                              item.matchedBook ? 'text-[#2F5D62] font-medium' : 'text-[#B8893B]'
                            }
                          >
                            {item.matchedBook ? 'Matched entry' : 'New entry'}
                          </span>
                        </div>
                      </td>

                      <td className="py-2.5 px-3">
                        <input
                          type="text"
                          disabled={locked}
                          value={item.title}
                          onChange={(e) =>
                            updateItemField(item.localId, { title: e.target.value })
                          }
                          aria-label={`Title for ${item.file.name}`}
                          className="w-full min-h-[38px] px-2.5 py-1.5 rounded-lg bg-[#FAF7F2] border border-[#E8E2D6] text-xs text-[#2B2B2B] disabled:opacity-65"
                        />
                      </td>

                      <td className="py-2.5 px-3">
                        <input
                          type="text"
                          disabled={locked}
                          value={item.author}
                          onChange={(e) =>
                            updateItemField(item.localId, { author: e.target.value })
                          }
                          aria-label={`Author for ${item.file.name}`}
                          className="w-full min-h-[38px] px-2.5 py-1.5 rounded-lg bg-[#FAF7F2] border border-[#E8E2D6] text-xs text-[#2B2B2B] disabled:opacity-65"
                        />
                      </td>

                      <td className="py-2.5 px-3">
                        <select
                          disabled={locked}
                          value={item.category}
                          onChange={(e) =>
                            updateItemField(item.localId, { category: e.target.value })
                          }
                          aria-label={`Category for ${item.file.name}`}
                          className="w-full min-h-[38px] px-2 py-1.5 rounded-lg bg-[#FAF7F2] border border-[#E8E2D6] text-xs text-[#2B2B2B] disabled:opacity-65"
                        >
                          {categories.map((cat) => (
                            <option key={cat.id} value={cat.name}>
                              {cat.name}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="py-3 px-4">
                        {item.status === 'done' ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#2F5D62]">
                            <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                            <span>Uploaded</span>
                          </span>
                        ) : item.status === 'error' ? (
                          <div className="space-y-1">
                            <span className="inline-flex items-center gap-1 text-xs text-[#8C3B2B]">
                              <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                              <span className="line-clamp-2">{item.errorMessage || 'Failed'}</span>
                            </span>
                            {item.file.size <= MAX_PDF_SIZE_BYTES && (
                              <button
                                type="button"
                                disabled={running}
                                onClick={() => void uploadSingleItem(item)}
                                className="block text-[11px] font-medium text-[#2F5D62] hover:underline cursor-pointer"
                              >
                                Retry file
                              </button>
                            )}
                          </div>
                        ) : item.status === 'uploading' ? (
                          <div className="space-y-1">
                            <div className="flex justify-between text-[11px] text-[#6B6B6B] tabular-nums">
                              <span>Uploading</span>
                              <span>{item.progress}%</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-[#E8E2D6] overflow-hidden">
                              <div
                                className="h-full bg-[#2F5D62] transition-all duration-150"
                                style={{ width: `${item.progress}%` }}
                              />
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-[#6B6B6B]">Ready</span>
                        )}
                      </td>

                      <td className="py-2.5 px-3 text-right">
                        {!locked && (
                          <button
                            type="button"
                            onClick={() => removeItem(item.localId)}
                            aria-label={`Remove ${item.file.name} from queue`}
                            className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-[#6B6B6B] hover:text-[#8C3B2B] hover:bg-[#FAF7F2] cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
