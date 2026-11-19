import React, { useMemo, useRef, useState } from 'react';
import { Check, FileUp, Plus, Sparkles, Upload } from 'lucide-react';
import { useLibrary } from '../context/LibraryContext';
import { MAX_PDF_SIZE_BYTES, type Book } from '../types/library';
import {
  formatFileSize,
  makeSafeId,
  normalizeFilename,
} from '../utils/catalogHelpers';
import {
  createBookRecord,
  createCategoryRecord,
  fetchOrGenerateBookSummary,
  updateBookRecord,
  uploadPdfFileWithInspection,
} from '../services/libraryService';
import { inspectPdfFile } from '../utils/pdfUtils';

export function UploadForm() {
  const { books, categories, user } = useLibrary();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [category, setCategory] = useState(categories[0]?.name || 'Other');
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  const [aboutBook, setAboutBook] = useState('');
  const [whyWorthReading, setWhyWorthReading] = useState('');
  const [aboutAuthor, setAboutAuthor] = useState('');
  const [aiGenerated, setAiGenerated] = useState(false);

  const [generatingAi, setGeneratingAi] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Detect matching existing catalog entry by filename
  const matchedBook: Book | undefined = useMemo(() => {
    if (!file) return undefined;
    const target = normalizeFilename(file.name);
    return books.find((b) => normalizeFilename(b.filename) === target);
  }, [file, books]);

  const handlePickedFile = (picked: File | null) => {
    setError(null);
    setStatusMessage(null);
    if (!picked) return;

    if (picked.type !== 'application/pdf' && !picked.name.toLowerCase().endsWith('.pdf')) {
      setError('Please select a valid PDF file.');
      return;
    }
    if (picked.size > MAX_PDF_SIZE_BYTES) {
      setError('This file exceeds the 100 MB maximum limit.');
      return;
    }

    setFile(picked);
    const match = books.find(
      (b) => normalizeFilename(b.filename) === normalizeFilename(picked.name)
    );
    if (match) {
      setTitle(match.title);
      setAuthor(match.author);
      setCategory(match.category);
      setAboutBook(match.aboutBook || '');
      setWhyWorthReading(match.whyWorthReading || '');
      setAboutAuthor(match.aboutAuthor || '');
      setAiGenerated(Boolean(match.aiGenerated));
    } else {
      const cleanedTitle = picked.name
        .replace(/\.pdf$/i, '')
        .replace(/[_]+/g, ' ')
        .trim();
      if (!title) setTitle(cleanedTitle);
    }
  };

  const handleAddCategory = async () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed || !user) return;
    setError(null);
    try {
      const created = await createCategoryRecord(user.uid, trimmed, categories);
      setCategory(created.name);
      setNewCategoryName('');
      setAddingCategory(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not add category.');
    }
  };

  const handleAutoGenerateAi = async () => {
    if (!title.trim() || !author.trim()) {
      setError('Please enter at least a title and author before generating AI notes.');
      return;
    }
    setError(null);
    setGeneratingAi(true);
    try {
      let excerpt = matchedBook?.extractedPreviewText || '';
      if (file) {
        try {
          const inspected = await inspectPdfFile(file);
          excerpt = inspected.extractedPreviewText;
        } catch {
          // Proceed with title + author if PDF text cannot be extracted
        }
      }

      const result = await fetchOrGenerateBookSummary(
        {
          id: matchedBook?.id || makeSafeId(`${title}-${author}`, 'book'),
          title: title.trim(),
          author: author.trim(),
          category,
          extractedPreviewText: excerpt,
        },
        { forceRefresh: true, persistToFirestore: false }
      );

      setAboutBook(result.aboutBook);
      setWhyWorthReading(result.whyWorthReading);
      setAboutAuthor(result.aboutAuthor);
      setAiGenerated(true);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Failed to generate editorial summary.'
      );
    } finally {
      setGeneratingAi(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!title.trim() || !author.trim()) {
      setError('Title and author are required.');
      return;
    }

    setError(null);
    setStatusMessage(null);
    setUploading(true);
    setProgress(0);

    try {
      const targetBookId =
        matchedBook?.id ||
        makeSafeId(file?.name || `${title.trim()}-${Date.now()}`, 'book');

      let uploadedData: Awaited<ReturnType<typeof uploadPdfFileWithInspection>> | null = null;
      if (file) {
        uploadedData = await uploadPdfFileWithInspection(file, targetBookId, setProgress);
      }

      const nowIso = new Date().toISOString();
      const authorCleaned = author.trim();
      const authorNeedsCheck = /^UNKNOWN/i.test(authorCleaned);

      if (matchedBook) {
        await updateBookRecord(matchedBook.id, {
          filename: file?.name || matchedBook.filename,
          title: title.trim(),
          author: authorCleaned,
          category,
          authorNeedsCheck,
          ...(uploadedData
            ? {
                hasPdf: true,
                pdfStorageType: uploadedData.pdfStorageType,
                pdfStoragePath: uploadedData.pdfStoragePath,
                ...(uploadedData.pdfUrl ? { pdfUrl: uploadedData.pdfUrl } : {}),
                ...(uploadedData.coverUrl ? { coverUrl: uploadedData.coverUrl } : {}),
                pageCount: uploadedData.pageCount,
                fileSizeBytes: uploadedData.fileSizeBytes,
                extractedPreviewText: uploadedData.extractedPreviewText,
              }
            : {}),
          ...(aboutBook.trim() ? { aboutBook: aboutBook.trim() } : {}),
          ...(whyWorthReading.trim() ? { whyWorthReading: whyWorthReading.trim() } : {}),
          ...(aboutAuthor.trim() ? { aboutAuthor: aboutAuthor.trim() } : {}),
          aiGenerated,
          ...(aiGenerated ? { aiGeneratedAt: nowIso } : {}),
        });
        setStatusMessage(
          `Updated "${title.trim()}" and attached the PDF to its catalog entry.`
        );
      } else {
        await createBookRecord(user.uid, {
          id: targetBookId,
          filename: file?.name || `${title.trim()}.pdf`,
          title: title.trim(),
          author: authorCleaned,
          category,
          authorNeedsCheck,
          hasPdf: Boolean(uploadedData),
          pdfStorageType: uploadedData ? uploadedData.pdfStorageType : 'none',
          pdfStoragePath: uploadedData?.pdfStoragePath,
          pdfUrl: uploadedData?.pdfUrl,
          coverUrl: uploadedData?.coverUrl,
          pageCount: uploadedData?.pageCount,
          fileSizeBytes: uploadedData?.fileSizeBytes,
          extractedPreviewText: uploadedData?.extractedPreviewText,
          aboutBook: aboutBook.trim() || undefined,
          whyWorthReading: whyWorthReading.trim() || undefined,
          aboutAuthor: aboutAuthor.trim() || undefined,
          aiGenerated,
          aiGeneratedAt: aiGenerated ? nowIso : undefined,
        });
        setStatusMessage(`Added "${title.trim()}" to ${category}.`);
      }

      // Reset form cleanly
      setFile(null);
      setTitle('');
      setAuthor('');
      setAboutBook('');
      setWhyWorthReading('');
      setAboutAuthor('');
      setAiGenerated(false);
      setProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save book.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="bg-white border border-[#E8E2D6] rounded-2xl p-6 sm:p-7 space-y-6">
        <div>
          <h2 className="font-serif text-xl font-semibold text-[#2B2B2B] mb-1">
            Upload or Attach a Book
          </h2>
          <p className="text-sm text-[#6B6B6B]">
            Drop a PDF up to 100 MB. If its filename matches an existing catalog entry, it will
            attach automatically without creating a duplicate.
          </p>
        </div>

        {/* Drag-and-Drop Picker */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            handlePickedFile(e.dataTransfer.files?.[0] || null);
          }}
          className={`rounded-2xl border-2 border-dashed p-6 sm:p-8 text-center transition-colors ${
            dragging
              ? 'border-[#2F5D62] bg-[#2F5D62]/5'
              : 'border-[#E8E2D6] bg-[#FAF7F2]/60 hover:border-[#2F5D62]/50'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => handlePickedFile(e.target.files?.[0] || null)}
          />
          <FileUp className="w-7 h-7 text-[#2F5D62] mx-auto mb-3" aria-hidden="true" />
          {file ? (
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-[#2B2B2B] break-all">{file.name}</p>
              <p className="text-xs text-[#6B6B6B] tabular-nums">
                {formatFileSize(file.size)}
              </p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-xs font-medium text-[#2F5D62] hover:underline cursor-pointer"
              >
                Choose a different PDF
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-[#2B2B2B]">
                Drag and drop a PDF file here, or{' '}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-[#2F5D62] font-medium hover:underline cursor-pointer"
                >
                  browse your device
                </button>
              </p>
              <p className="text-xs text-[#6B6B6B]">
                PDF only · Up to 100 MB · First page rendered automatically as cover
              </p>
            </div>
          )}
        </div>

        {/* Automatic Catalog Filename Match Notice */}
        {matchedBook && (
          <div className="p-4 rounded-xl bg-[#2F5D62]/[0.06] border border-[#2F5D62]/25 text-xs sm:text-sm text-[#2B2B2B]">
            <p className="font-medium text-[#2F5D62]">
              Matched existing catalog entry: “{matchedBook.title}”
            </p>
            <p className="text-[#6B6B6B] mt-0.5">
              Uploading will attach this PDF directly to that entry instead of creating a duplicate.
            </p>
          </div>
        )}

        {/* Bibliographic Fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="upload-title" className="block text-xs font-medium text-[#2B2B2B] mb-1.5">
              Book Title
            </label>
            <input
              id="upload-title"
              type="text"
              required
              maxLength={300}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., The Discovery of India"
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-[#FAF7F2] border border-[#E8E2D6] text-sm text-[#2B2B2B] focus:outline-none focus:border-[#2F5D62]"
            />
          </div>

          <div>
            <label htmlFor="upload-author" className="block text-xs font-medium text-[#2B2B2B] mb-1.5">
              Author
            </label>
            <input
              id="upload-author"
              type="text"
              required
              maxLength={250}
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="e.g., Jawaharlal Nehru"
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-[#FAF7F2] border border-[#E8E2D6] text-sm text-[#2B2B2B] focus:outline-none focus:border-[#2F5D62]"
            />
          </div>
        </div>

        {/* Category Selector + Add New Category */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <label htmlFor="upload-category" className="text-xs font-medium text-[#2B2B2B]">
              Category
            </label>
            <button
              type="button"
              onClick={() => setAddingCategory((prev) => !prev)}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#2F5D62] hover:underline cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{addingCategory ? 'Cancel new category' : 'Add new category'}</span>
            </button>
          </div>

          <select
            id="upload-category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-[#FAF7F2] border border-[#E8E2D6] text-sm text-[#2B2B2B] focus:outline-none focus:border-[#2F5D62]"
          >
            {categories.map((cat) => (
              <option key={cat.id} value={cat.name}>
                {cat.name}
              </option>
            ))}
          </select>

          {addingCategory && (
            <div className="mt-3 flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                maxLength={120}
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="New category name..."
                className="flex-1 min-h-[44px] px-3.5 py-2 rounded-xl bg-white border border-[#E8E2D6] text-sm text-[#2B2B2B] focus:outline-none focus:border-[#2F5D62]"
              />
              <button
                type="button"
                onClick={handleAddCategory}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-[#2F5D62] text-white text-sm font-medium hover:bg-[#244A4E] transition-colors whitespace-nowrap cursor-pointer"
              >
                Save Category
              </button>
            </div>
          )}
        </div>

        {/* Optional Override Fields + Auto-Generate with AI */}
        <div className="pt-4 border-t border-[#E8E2D6] space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-serif text-base font-semibold text-[#2B2B2B]">
                Editorial Notes (Optional Override)
              </h3>
              <p className="text-xs text-[#6B6B6B]">
                Leave blank to generate automatically on first visit, or generate and refine now.
              </p>
            </div>

            <button
              type="button"
              disabled={generatingAi}
              onClick={handleAutoGenerateAi}
              className="inline-flex items-center gap-2 min-h-[40px] px-4 py-2 rounded-xl border border-[#2F5D62] text-[#2F5D62] text-xs sm:text-sm font-medium hover:bg-[#2F5D62]/5 disabled:opacity-50 transition-colors cursor-pointer"
            >
              <Sparkles className="w-4 h-4" aria-hidden="true" />
              <span>{generatingAi ? 'Generating...' : 'Auto-generate with AI'}</span>
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label htmlFor="upload-about-book" className="block text-xs font-medium text-[#2B2B2B] mb-1.5">
                About the Book
              </label>
              <textarea
                id="upload-about-book"
                rows={3}
                maxLength={3000}
                value={aboutBook}
                onChange={(e) => {
                  setAboutBook(e.target.value);
                  setAiGenerated(false);
                }}
                placeholder="3–5 neutral sentences describing the book..."
                className="w-full p-3.5 rounded-xl bg-[#FAF7F2] border border-[#E8E2D6] text-sm text-[#2B2B2B] focus:outline-none focus:border-[#2F5D62]"
              />
            </div>

            <div>
              <label htmlFor="upload-why-read" className="block text-xs font-medium text-[#2B2B2B] mb-1.5">
                Why This Book Is Worth Reading
              </label>
              <textarea
                id="upload-why-read"
                rows={3}
                maxLength={3000}
                value={whyWorthReading}
                onChange={(e) => {
                  setWhyWorthReading(e.target.value);
                  setAiGenerated(false);
                }}
                placeholder="Who should read it, what they gain, and its historical or scholarly place..."
                className="w-full p-3.5 rounded-xl bg-[#FAF7F2] border border-[#E8E2D6] text-sm text-[#2B2B2B] focus:outline-none focus:border-[#2F5D62]"
              />
            </div>

            <div>
              <label htmlFor="upload-about-author" className="block text-xs font-medium text-[#2B2B2B] mb-1.5">
                About the Author
              </label>
              <textarea
                id="upload-about-author"
                rows={3}
                maxLength={3000}
                value={aboutAuthor}
                onChange={(e) => {
                  setAboutAuthor(e.target.value);
                  setAiGenerated(false);
                }}
                placeholder="3–4 factual sentences on the author's background and notable works..."
                className="w-full p-3.5 rounded-xl bg-[#FAF7F2] border border-[#E8E2D6] text-sm text-[#2B2B2B] focus:outline-none focus:border-[#2F5D62]"
              />
            </div>
          </div>
        </div>

        {/* Upload Progress Bar */}
        {uploading && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-[#6B6B6B] tabular-nums">
              <span>Processing PDF & uploading...</span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 rounded-full bg-[#E8E2D6] overflow-hidden">
              <div
                className="h-full bg-[#2F5D62] transition-all duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="text-xs sm:text-sm text-[#8C3B2B]">
            {error}
          </p>
        )}

        {statusMessage && (
          <p className="inline-flex items-center gap-2 text-xs sm:text-sm text-[#2F5D62] font-medium">
            <Check className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{statusMessage}</span>
          </p>
        )}

        <div className="pt-2">
          <button
            type="submit"
            disabled={uploading}
            className="inline-flex items-center justify-center gap-2 min-h-[44px] px-6 py-2.5 rounded-xl bg-[#2F5D62] text-white text-sm font-medium hover:bg-[#244A4E] disabled:opacity-50 transition-colors cursor-pointer"
          >
            <Upload className="w-4 h-4" aria-hidden="true" />
            <span>
              {uploading
                ? 'Saving to Library...'
                : matchedBook
                ? 'Attach PDF & Update Entry'
                : 'Publish Book to Library'}
            </span>
          </button>
        </div>
      </div>
    </form>
  );
}
