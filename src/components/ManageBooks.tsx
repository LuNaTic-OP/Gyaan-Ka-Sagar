import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Edit3,
  FileUp,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useLibrary } from '../context/LibraryContext';
import type { Book } from '../types/library';
import {
  formatFileSize,
  sortBooksWithSeriesGrouping,
} from '../utils/catalogHelpers';
import {
  deleteBookRecord,
  fetchOrGenerateBookSummary,
  updateBookRecord,
  uploadPdfFileWithInspection,
} from '../services/libraryService';

export function ManageBooks() {
  const { books, categories } = useLibrary();
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'has_pdf' | 'missing_pdf' | 'verify_author'>('all');
  const [categoryFilter, setCategoryFilter] = useState('All');

  const [editingBook, setEditingBook] = useState<Book | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editAuthor, setEditAuthor] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editNeedsCheck, setEditNeedsCheck] = useState(false);
  const [editAboutBook, setEditAboutBook] = useState('');
  const [editWhyRead, setEditWhyRead] = useState('');
  const [editAboutAuthor, setEditAboutAuthor] = useState('');
  const [editAiGenerated, setEditAiGenerated] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [generatingEditAi, setGeneratingEditAi] = useState(false);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const [replaceProgress, setReplaceProgress] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const replaceInputRef = useRef<HTMLInputElement | null>(null);
  const replaceTargetBookRef = useRef<Book | null>(null);

  const filteredBooks = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = books.filter((b) => {
      if (categoryFilter !== 'All' && b.category !== categoryFilter) return false;
      if (filterMode === 'has_pdf' && !b.hasPdf) return false;
      if (filterMode === 'missing_pdf' && b.hasPdf) return false;
      if (filterMode === 'verify_author' && !b.authorNeedsCheck) return false;
      if (!q) return true;
      return (
        b.title.toLowerCase().includes(q) ||
        b.author.toLowerCase().includes(q) ||
        b.filename.toLowerCase().includes(q)
      );
    });
    return sortBooksWithSeriesGrouping(list, 'title_asc');
  }, [books, search, filterMode, categoryFilter]);

  const openEdit = (book: Book) => {
    setError(null);
    setEditingBook(book);
    setEditTitle(book.title);
    setEditAuthor(book.author);
    setEditCategory(book.category);
    setEditNeedsCheck(book.authorNeedsCheck);
    setEditAboutBook(book.aboutBook || '');
    setEditWhyRead(book.whyWorthReading || '');
    setEditAboutAuthor(book.aboutAuthor || '');
    setEditAiGenerated(book.aiGenerated);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBook) return;
    setSavingEdit(true);
    setError(null);
    try {
      await updateBookRecord(editingBook.id, {
        title: editTitle.trim(),
        author: editAuthor.trim(),
        category: editCategory,
        authorNeedsCheck: editNeedsCheck,
        aboutBook: editAboutBook.trim(),
        whyWorthReading: editWhyRead.trim(),
        aboutAuthor: editAboutAuthor.trim(),
        aiGenerated: editAiGenerated,
      });
      setFeedback(`Saved changes to “${editTitle.trim()}”.`);
      setEditingBook(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save changes.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleGenerateInEdit = async () => {
    if (!editingBook) return;
    setGeneratingEditAi(true);
    setError(null);
    try {
      const res = await fetchOrGenerateBookSummary(
        {
          id: editingBook.id,
          title: editTitle.trim(),
          author: editAuthor.trim(),
          category: editCategory,
          extractedPreviewText: editingBook.extractedPreviewText,
        },
        { forceRefresh: true, persistToFirestore: false }
      );
      setEditAboutBook(res.aboutBook);
      setEditWhyRead(res.whyWorthReading);
      setEditAboutAuthor(res.aboutAuthor);
      setEditAiGenerated(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to generate AI notes.');
    } finally {
      setGeneratingEditAi(false);
    }
  };

  const handleQuickMoveCategory = async (book: Book, newCategory: string) => {
    if (book.category === newCategory) return;
    setError(null);
    try {
      await updateBookRecord(book.id, { category: newCategory });
      setFeedback(`Moved “${book.title}” to ${newCategory}.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not move book category.');
    }
  };

  const triggerReplacePdf = (book: Book) => {
    replaceTargetBookRef.current = book;
    replaceInputRef.current?.click();
  };

  const handleReplacePdfFile = async (file: File | null) => {
    const target = replaceTargetBookRef.current;
    if (!file || !target) return;
    setError(null);
    setReplacingId(target.id);
    setReplaceProgress(0);
    try {
      const uploaded = await uploadPdfFileWithInspection(
        file,
        target.id,
        setReplaceProgress
      );
      await updateBookRecord(target.id, {
        filename: file.name,
        hasPdf: true,
        pdfStorageType: uploaded.pdfStorageType,
        pdfStoragePath: uploaded.pdfStoragePath,
        ...(uploaded.pdfUrl ? { pdfUrl: uploaded.pdfUrl } : {}),
        ...(uploaded.coverUrl ? { coverUrl: uploaded.coverUrl } : {}),
        pageCount: uploaded.pageCount,
        fileSizeBytes: uploaded.fileSizeBytes,
        extractedPreviewText: uploaded.extractedPreviewText,
      });
      setFeedback(`Attached PDF (${formatFileSize(file.size)}) to “${target.title}”.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to replace PDF.');
    } finally {
      setReplacingId(null);
      setReplaceProgress(0);
      if (replaceInputRef.current) replaceInputRef.current.value = '';
    }
  };

  const handleDelete = async (book: Book) => {
    setError(null);
    try {
      await deleteBookRecord(book);
      setConfirmDeleteId(null);
      setFeedback(`Deleted “${book.title}” from the library.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete book.');
    }
  };

  const verifyCount = books.filter((b) => b.authorNeedsCheck).length;

  return (
    <div className="bg-white border border-[#E8E2D6] rounded-2xl p-5 sm:p-7 space-y-5">
      <input
        ref={replaceInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => void handleReplacePdfFile(e.target.files?.[0] || null)}
      />

      {/* Filter Toolbar */}
      <div className="flex flex-col lg:flex-row gap-3 justify-between">
        <div className="relative flex-1 max-w-md">
          <Search
            className="w-4 h-4 text-[#6B6B6B] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, author, or PDF filename..."
            className="w-full min-h-[42px] pl-10 pr-3.5 py-2 rounded-xl bg-[#FAF7F2] border border-[#E8E2D6] text-sm text-[#2B2B2B] focus:outline-none focus:border-[#2F5D62]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="Filter managed books by category"
            className="min-h-[42px] px-3 py-2 rounded-xl bg-[#FAF7F2] border border-[#E8E2D6] text-xs sm:text-sm text-[#2B2B2B]"
          >
            <option value="All">All Categories</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.name}>
                {cat.name}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1 p-1 rounded-xl bg-[#FAF7F2] border border-[#E8E2D6]">
            {(
              [
                ['all', 'All'],
                ['has_pdf', 'With PDF'],
                ['missing_pdf', 'No PDF'],
                ['verify_author', `Verify Author (${verifyCount})`],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilterMode(id)}
                className={`min-h-[34px] px-3 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                  filterMode === id
                    ? 'bg-white text-[#2F5D62] shadow-xs'
                    : 'text-[#6B6B6B] hover:text-[#2B2B2B]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {feedback && (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-[#2F5D62]/[0.06] text-xs sm:text-sm text-[#2F5D62]">
          <span>{feedback}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            aria-label="Dismiss notice"
            className="cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="text-xs sm:text-sm text-[#8C3B2B]">
          {error}
        </p>
      )}

      {/* Books Table */}
      <div className="overflow-x-auto border border-[#E8E2D6] rounded-xl">
        <table className="w-full text-left border-collapse min-w-[760px]">
          <thead>
            <tr className="bg-[#FAF7F2] border-b border-[#E8E2D6] text-xs font-medium text-[#6B6B6B]">
              <th className="py-3 px-4">Title & Author</th>
              <th className="py-3 px-3 w-56">Category</th>
              <th className="py-3 px-3 w-36">PDF Status</th>
              <th className="py-3 px-4 text-right w-56">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E8E2D6] text-sm">
            {filteredBooks.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-10 text-center text-sm text-[#6B6B6B]">
                  No books match the current filter.
                </td>
              </tr>
            ) : (
              filteredBooks.map((book) => (
                <tr key={book.id} className="hover:bg-[#FAF7F2]/50">
                  <td className="py-3.5 px-4">
                    <p className="font-serif font-semibold text-[#2B2B2B] leading-snug">
                      {book.title}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <span className="text-xs text-[#6B6B6B]">{book.author}</span>
                      {book.authorNeedsCheck && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#B8893B]/15 text-[#8A6320] text-[11px] font-medium">
                          <AlertTriangle className="w-3 h-3" aria-hidden="true" />
                          <span>verify author</span>
                        </span>
                      )}
                    </div>
                  </td>

                  <td className="py-3 px-3">
                    <select
                      value={book.category}
                      onChange={(e) => void handleQuickMoveCategory(book, e.target.value)}
                      aria-label={`Category for ${book.title}`}
                      className="w-full min-h-[38px] px-2.5 py-1.5 rounded-lg bg-[#FAF7F2] border border-[#E8E2D6] text-xs text-[#2B2B2B]"
                    >
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.name}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                  </td>

                  <td className="py-3 px-3 text-xs tabular-nums">
                    {replacingId === book.id ? (
                      <span className="text-[#2F5D62] font-medium">
                        Uploading {replaceProgress}%...
                      </span>
                    ) : book.hasPdf ? (
                      <div>
                        <span className="text-[#2F5D62] font-medium block">Attached</span>
                        <span className="text-[#6B6B6B]">
                          {formatFileSize(book.fileSizeBytes)}
                          {book.pageCount ? ` · ${book.pageCount} pp` : ''}
                        </span>
                      </div>
                    ) : (
                      <span className="text-[#6B6B6B]">Coming soon</span>
                    )}
                  </td>

                  <td className="py-3 px-4 text-right">
                    <div className="inline-flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => openEdit(book)}
                        title="Edit details & summary"
                        className="inline-flex items-center gap-1 min-h-[36px] px-2.5 rounded-lg border border-[#E8E2D6] bg-white text-xs font-medium text-[#2B2B2B] hover:border-[#2F5D62] hover:text-[#2F5D62] cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Edit</span>
                      </button>

                      <button
                        type="button"
                        disabled={replacingId === book.id}
                        onClick={() => triggerReplacePdf(book)}
                        title={book.hasPdf ? 'Replace PDF' : 'Attach PDF'}
                        className="inline-flex items-center gap-1 min-h-[36px] px-2.5 rounded-lg border border-[#E8E2D6] bg-white text-xs font-medium text-[#2B2B2B] hover:border-[#2F5D62] hover:text-[#2F5D62] cursor-pointer"
                      >
                        <FileUp className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{book.hasPdf ? 'Replace' : 'PDF'}</span>
                      </button>

                      {confirmDeleteId === book.id ? (
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => void handleDelete(book)}
                            className="min-h-[36px] px-2.5 rounded-lg bg-[#8C3B2B] text-white text-xs font-medium cursor-pointer"
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="min-h-[36px] px-2 rounded-lg text-xs text-[#6B6B6B] hover:text-[#2B2B2B] cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(book.id)}
                          aria-label={`Delete ${book.title}`}
                          className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-[#6B6B6B] hover:text-[#8C3B2B] hover:bg-[#FDF4F2] cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Edit Book Modal */}
      {editingBook && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-book-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#2B2B2B]/45 p-4 sm:p-6"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditingBook(null);
          }}
        >
          <form
            onSubmit={handleSaveEdit}
            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white border border-[#E8E2D6] rounded-2xl p-6 sm:p-7 space-y-5 shadow-xl"
          >
            <div className="flex items-center justify-between gap-4">
              <h3 id="edit-book-title" className="font-serif text-xl font-semibold text-[#2B2B2B]">
                Edit Book Entry
              </h3>
              <button
                type="button"
                onClick={() => setEditingBook(null)}
                aria-label="Close edit dialog"
                className="w-10 h-10 inline-flex items-center justify-center rounded-xl text-[#6B6B6B] hover:bg-[#FAF7F2] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-[#2B2B2B] mb-1">Title</label>
                <input
                  type="text"
                  required
                  maxLength={300}
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[#FAF7F2] border border-[#E8E2D6] text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#2B2B2B] mb-1">Author</label>
                <input
                  type="text"
                  required
                  maxLength={250}
                  value={editAuthor}
                  onChange={(e) => setEditAuthor(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[#FAF7F2] border border-[#E8E2D6] text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
              <div>
                <label className="block text-xs font-medium text-[#2B2B2B] mb-1">Category</label>
                <select
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[#FAF7F2] border border-[#E8E2D6] text-sm"
                >
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.name}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>
              <label className="inline-flex items-center gap-2.5 min-h-[42px] text-xs text-[#2B2B2B] cursor-pointer">
                <input
                  type="checkbox"
                  checked={editNeedsCheck}
                  onChange={(e) => setEditNeedsCheck(e.target.checked)}
                  className="w-4 h-4 accent-[#2F5D62]"
                />
                <span>Flag as “verify author” in dashboard</span>
              </label>
            </div>

            <div className="pt-3 border-t border-[#E8E2D6] space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-[#2B2B2B]">
                  Editorial Summary Sections
                </span>
                <button
                  type="button"
                  disabled={generatingEditAi}
                  onClick={handleGenerateInEdit}
                  className="inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-lg border border-[#2F5D62] text-[#2F5D62] text-xs font-medium hover:bg-[#2F5D62]/5 disabled:opacity-50 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{generatingEditAi ? 'Generating...' : 'Auto-generate with AI'}</span>
                </button>
              </div>

              <div>
                <label className="block text-xs text-[#6B6B6B] mb-1">About the Book</label>
                <textarea
                  rows={3}
                  maxLength={3000}
                  value={editAboutBook}
                  onChange={(e) => {
                    setEditAboutBook(e.target.value);
                    setEditAiGenerated(false);
                  }}
                  className="w-full p-3 rounded-xl bg-[#FAF7F2] border border-[#E8E2D6] text-sm"
                />
              </div>

              <div>
                <label className="block text-xs text-[#6B6B6B] mb-1">
                  Why This Book Is Worth Reading
                </label>
                <textarea
                  rows={3}
                  maxLength={3000}
                  value={editWhyRead}
                  onChange={(e) => {
                    setEditWhyRead(e.target.value);
                    setEditAiGenerated(false);
                  }}
                  className="w-full p-3 rounded-xl bg-[#FAF7F2] border border-[#E8E2D6] text-sm"
                />
              </div>

              <div>
                <label className="block text-xs text-[#6B6B6B] mb-1">About the Author</label>
                <textarea
                  rows={3}
                  maxLength={3000}
                  value={editAboutAuthor}
                  onChange={(e) => {
                    setEditAboutAuthor(e.target.value);
                    setEditAiGenerated(false);
                  }}
                  className="w-full p-3 rounded-xl bg-[#FAF7F2] border border-[#E8E2D6] text-sm"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingBook(null)}
                className="min-h-[42px] px-4 rounded-xl border border-[#E8E2D6] text-sm text-[#6B6B6B] hover:text-[#2B2B2B] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingEdit}
                className="min-h-[42px] px-5 rounded-xl bg-[#2F5D62] text-white text-sm font-medium hover:bg-[#244A4E] disabled:opacity-50 cursor-pointer"
              >
                {savingEdit ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
