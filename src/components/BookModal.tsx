import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Download,
  Lock,
  RefreshCw,
  X,
} from 'lucide-react';
import type { Book, VisibilityMode } from '../types/library';
import {
  formatAuthorDisplay,
  formatFileSize,
  getPlaceholderCoverTheme,
} from '../utils/catalogHelpers';
import {
  downloadBookPdfFile,
  fetchOrGenerateBookSummary,
} from '../services/libraryService';
import { useLibrary } from '../context/LibraryContext';

interface BookModalProps {
  book: Book | null;
  visibility: VisibilityMode;
  isOwner: boolean;
  canReadPdfs: boolean;
  canDownloadPdfs: boolean;
  onClose: () => void;
  onReadOnline: (book: Book) => void;
}

export function BookModal({
  book,
  visibility,
  isOwner,
  canReadPdfs,
  canDownloadPdfs,
  onClose,
  onReadOnline,
}: BookModalProps) {
  const { updateLocalBookSummary } = useLibrary();
  const [imgFailed, setImgFailed] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [generatedNotes, setGeneratedNotes] = useState<{
    aboutBook: string;
    whyWorthReading: string;
    aboutAuthor: string;
    aiGenerated: boolean;
  } | null>(null);

  // Lock background scrolling and handle Escape key
  useEffect(() => {
    if (!book) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [book, onClose]);

  // Reset local state when switching books and trigger one-time Gemini generation if needed
  useEffect(() => {
    setImgFailed(false);
    setSummaryError(null);
    setDownloadError(null);
    setGeneratedNotes(null);

    if (!book) return;

    const alreadyHasNotes = Boolean(
      book.aboutBook && book.whyWorthReading && book.aboutAuthor
    );
    if (alreadyHasNotes) return;

    let cancelled = false;
    setSummaryLoading(true);

    fetchOrGenerateBookSummary(book, {
      forceRefresh: false,
      persistToFirestore: isOwner,
    })
      .then((res) => {
        if (cancelled) return;
        setGeneratedNotes({
          aboutBook: res.aboutBook,
          whyWorthReading: res.whyWorthReading,
          aboutAuthor: res.aboutAuthor,
          aiGenerated: res.aiGenerated,
        });
        updateLocalBookSummary(book.id, {
          aboutBook: res.aboutBook,
          whyWorthReading: res.whyWorthReading,
          aboutAuthor: res.aboutAuthor,
          aiGenerated: res.aiGenerated,
          aiGeneratedAt: res.aiGeneratedAt,
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setSummaryError(
          err instanceof Error
            ? err.message
            : 'Unable to load editorial notes at this moment.'
        );
      })
      .finally(() => {
        if (!cancelled) setSummaryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [book?.id, isOwner, updateLocalBookSummary]);

  if (!book) return null;

  const theme = getPlaceholderCoverTheme(`${book.title}-${book.author}`);
  const authorDisplay = formatAuthorDisplay(book.author, isOwner);
  const aboutBook = book.aboutBook || generatedNotes?.aboutBook || '';
  const whyWorthReading = book.whyWorthReading || generatedNotes?.whyWorthReading || '';
  const aboutAuthor = book.aboutAuthor || generatedNotes?.aboutAuthor || '';
  const isAiGenerated = Boolean(book.aiGenerated || generatedNotes?.aiGenerated);

  const handleRetrySummary = async () => {
    setSummaryError(null);
    setSummaryLoading(true);
    try {
      const res = await fetchOrGenerateBookSummary(book, {
        forceRefresh: false,
        persistToFirestore: isOwner,
      });
      setGeneratedNotes({
        aboutBook: res.aboutBook,
        whyWorthReading: res.whyWorthReading,
        aboutAuthor: res.aboutAuthor,
        aiGenerated: res.aiGenerated,
      });
      updateLocalBookSummary(book.id, {
        aboutBook: res.aboutBook,
        whyWorthReading: res.whyWorthReading,
        aboutAuthor: res.aboutAuthor,
        aiGenerated: res.aiGenerated,
        aiGeneratedAt: res.aiGeneratedAt,
      });
    } catch (err: unknown) {
      setSummaryError(
        err instanceof Error ? err.message : 'Unable to generate summary.'
      );
    } finally {
      setSummaryLoading(false);
    }
  };

  const handleDownload = async () => {
    setDownloadError(null);
    setDownloading(true);
    try {
      await downloadBookPdfFile(book);
    } catch (err: unknown) {
      setDownloadError(
        err instanceof Error ? err.message : 'Unable to download PDF.'
      );
    } finally {
      setDownloading(false);
    }
  };

  const pdfRestrictedPrivate = book.hasPdf && !canReadPdfs && visibility === 'private';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="book-modal-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#2B2B2B]/45 backdrop-blur-[2px] sm:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-4xl bg-[#FAF7F2] sm:rounded-2xl border border-[#E8E2D6] shadow-[0_20px_60px_rgba(43,43,43,0.16)] flex flex-col overflow-hidden">
        {/* Sticky Top Bar */}
        <div className="flex items-center justify-between gap-4 px-5 sm:px-8 py-4 bg-white border-b border-[#E8E2D6] shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-2 min-h-[44px] text-sm font-medium text-[#2F5D62] hover:text-[#244A4E] transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            <span>Back to Library</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close book details"
            className="w-11 h-11 inline-flex items-center justify-center rounded-xl text-[#6B6B6B] hover:text-[#2B2B2B] hover:bg-[#FAF7F2] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto flex-1 px-5 sm:px-8 py-6 sm:py-8">
          <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-7 sm:gap-9 items-start">
            {/* Left Column: Cover + Technical Metadata */}
            <div className="flex flex-col items-center md:items-stretch gap-5">
              <div className="w-44 sm:w-52 md:w-full aspect-[3/4] rounded-xl overflow-hidden border border-[#E8E2D6] bg-[#F3EEE4] shadow-[0_4px_16px_rgba(43,43,43,0.06)]">
                {book.coverUrl && !imgFailed ? (
                  <img
                    src={book.coverUrl}
                    alt={`Cover of ${book.title}`}
                    referrerPolicy="no-referrer"
                    onError={() => setImgFailed(true)}
                    className="w-full h-full object-cover object-top"
                  />
                ) : (
                  <div
                    className="w-full h-full p-5 flex flex-col justify-between relative"
                    style={{ backgroundColor: theme.bg, color: theme.text }}
                  >
                    <div
                      aria-hidden="true"
                      className="absolute inset-y-0 left-3 w-px opacity-25"
                      style={{ backgroundColor: theme.accent }}
                    />
                    <span
                      className="pl-2 text-[10px] tracking-[0.12em] uppercase opacity-80"
                      style={{ color: theme.accent }}
                    >
                      Gyaan Ka Sagar
                    </span>
                    <p className="pl-2 font-serif text-base font-semibold leading-snug line-clamp-6">
                      {book.title}
                    </p>
                    <p className="pl-2 text-xs opacity-85 border-t border-white/15 pt-2 line-clamp-1">
                      {authorDisplay}
                    </p>
                  </div>
                )}
              </div>

              {/* Clean Definition List of Edition Details */}
              <dl className="w-full bg-white border border-[#E8E2D6] rounded-xl p-4 space-y-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-[#6B6B6B]">Pages</dt>
                  <dd className="font-medium text-[#2B2B2B] tabular-nums">
                    {book.pageCount ? `${book.pageCount}` : '—'}
                  </dd>
                </div>
                <div className="h-px bg-[#E8E2D6]/70" />
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-[#6B6B6B]">File Size</dt>
                  <dd className="font-medium text-[#2B2B2B] tabular-nums">
                    {formatFileSize(book.fileSizeBytes)}
                  </dd>
                </div>
                <div className="h-px bg-[#E8E2D6]/70" />
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-[#6B6B6B]">PDF Status</dt>
                  <dd className="font-medium text-[#2F5D62]">
                    {book.hasPdf ? 'Available' : 'Coming soon'}
                  </dd>
                </div>
              </dl>
            </div>

            {/* Right Column: Title, Actions, Editorial Notes */}
            <div className="min-w-0">
              <p className="text-xs font-medium tracking-[0.06em] text-[#2F5D62] mb-2">
                {book.category}
              </p>
              <h2
                id="book-modal-title"
                className="font-serif text-2xl sm:text-3xl font-semibold text-[#2B2B2B] leading-snug mb-2"
              >
                {book.title}
              </h2>
              <p className="text-base text-[#6B6B6B] mb-6">{authorDisplay}</p>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-3 pb-7 mb-7 border-b border-[#E8E2D6]">
                {book.hasPdf ? (
                  canReadPdfs ? (
                    <button
                      type="button"
                      onClick={() => onReadOnline(book)}
                      className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl bg-[#2F5D62] text-white text-sm font-medium hover:bg-[#244A4E] transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <BookOpen className="w-4 h-4" aria-hidden="true" />
                      <span>Read Online</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled
                      className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl bg-[#E8E2D6]/70 text-[#6B6B6B] text-sm font-medium cursor-not-allowed whitespace-nowrap"
                    >
                      <Lock className="w-4 h-4" aria-hidden="true" />
                      <span>Owner Access Only</span>
                    </button>
                  )
                ) : (
                  <button
                    type="button"
                    disabled
                    className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl bg-[#E8E2D6]/70 text-[#6B6B6B] text-sm font-medium cursor-not-allowed whitespace-nowrap"
                  >
                    <BookOpen className="w-4 h-4" aria-hidden="true" />
                    <span>PDF coming soon</span>
                  </button>
                )}

                {/* Download button: visible ONLY when permitted (Public or Owner) */}
                {canDownloadPdfs && (
                  <button
                    type="button"
                    disabled={!book.hasPdf || downloading}
                    onClick={handleDownload}
                    className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl border border-[#E8E2D6] bg-white text-[#2B2B2B] text-sm font-medium hover:border-[#2F5D62] hover:text-[#2F5D62] disabled:opacity-45 disabled:cursor-not-allowed transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <Download className="w-4 h-4" aria-hidden="true" />
                    <span>{downloading ? 'Preparing PDF...' : 'Download PDF'}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex items-center justify-center min-h-[44px] px-4 py-2.5 rounded-xl text-sm font-medium text-[#6B6B6B] hover:text-[#2B2B2B] transition-colors whitespace-nowrap cursor-pointer"
                >
                  Back to Library
                </button>
              </div>

              {pdfRestrictedPrivate && (
                <p className="text-xs text-[#6B6B6B] bg-white border border-[#E8E2D6] rounded-xl px-4 py-3 mb-6">
                  This library is currently in Private mode. Visitors may browse the catalog,
                  covers, and editorial notes while full PDF reading is restricted to the owner.
                </p>
              )}

              {book.hasPdf && visibility === 'read_only' && !isOwner && (
                <p className="text-xs text-[#6B6B6B] bg-white border border-[#E8E2D6] rounded-xl px-4 py-3 mb-6">
                  This volume is available for online reading in the built-in viewer; file downloads
                  are disabled.
                </p>
              )}

              {downloadError && (
                <p role="alert" className="text-xs text-[#8C3B2B] mb-5">
                  {downloadError}
                </p>
              )}

              {/* Editorial Summary Sections */}
              {summaryLoading ? (
                <div className="space-y-6" aria-live="polite">
                  <p className="text-xs text-[#6B6B6B] italic">
                    Preparing scholarly catalog notes...
                  </p>
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="space-y-2 animate-pulse">
                      <div className="h-4 w-44 bg-[#E8E2D6] rounded" />
                      <div className="h-3.5 w-full bg-[#EDE7DC] rounded" />
                      <div className="h-3.5 w-11/12 bg-[#EDE7DC] rounded" />
                      <div className="h-3.5 w-3/4 bg-[#EDE7DC] rounded" />
                    </div>
                  ))}
                </div>
              ) : summaryError ? (
                <div className="bg-white border border-[#E8E2D6] rounded-xl p-5">
                  <p className="text-sm text-[#6B6B6B] mb-4">{summaryError}</p>
                  <button
                    type="button"
                    onClick={handleRetrySummary}
                    className="inline-flex items-center gap-2 min-h-[40px] px-4 py-2 rounded-xl border border-[#E8E2D6] text-sm font-medium text-[#2F5D62] hover:border-[#2F5D62] transition-colors cursor-pointer"
                  >
                    <RefreshCw className="w-4 h-4" aria-hidden="true" />
                    <span>Retry Summary</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-7 max-w-prose">
                  <section aria-labelledby="about-book-heading">
                    <h3
                      id="about-book-heading"
                      className="font-serif text-lg font-semibold text-[#2B2B2B] mb-2"
                    >
                      About the Book
                    </h3>
                    <p className="text-sm sm:text-[15px] text-[#2B2B2B]/90 leading-[1.75]">
                      {aboutBook || 'Catalog notes for this volume are being prepared.'}
                    </p>
                  </section>

                  <section aria-labelledby="why-read-heading">
                    <h3
                      id="why-read-heading"
                      className="font-serif text-lg font-semibold text-[#2B2B2B] mb-2"
                    >
                      Why This Book Is Worth Reading
                    </h3>
                    <p className="text-sm sm:text-[15px] text-[#2B2B2B]/90 leading-[1.75]">
                      {whyWorthReading ||
                        'Historical and scholarly context will appear here once generated.'}
                    </p>
                  </section>

                  <section aria-labelledby="about-author-heading">
                    <h3
                      id="about-author-heading"
                      className="font-serif text-lg font-semibold text-[#2B2B2B] mb-2"
                    >
                      About the Author
                    </h3>
                    <p className="text-sm sm:text-[15px] text-[#2B2B2B]/90 leading-[1.75]">
                      {aboutAuthor || 'Biographical notes will appear here once generated.'}
                    </p>
                  </section>

                  {isAiGenerated && (
                    <p className="pt-4 border-t border-[#E8E2D6] text-xs text-[#6B6B6B] italic">
                      AI-generated summary — compiled neutrally for catalog reference.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
