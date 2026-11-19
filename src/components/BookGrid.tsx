import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Search, SlidersHorizontal, X } from 'lucide-react';
import type { Book, CategoryRecord, SortOption } from '../types/library';
import { sortBooksWithSeriesGrouping } from '../utils/catalogHelpers';
import { BookCard } from './BookCard';

interface BookGridProps {
  books: Book[];
  categories: CategoryRecord[];
  loading: boolean;
  error: string | null;
  isOwner: boolean;
  selectedCategory: string;
  searchQuery: string;
  sortBy: SortOption;
  onSelectCategory: (category: string) => void;
  onSearchChange: (q: string) => void;
  onSortChange: (sort: SortOption) => void;
  onSelectBook: (book: Book) => void;
}

const PAGE_SIZE = 24;

export function BookGrid({
  books,
  categories,
  loading,
  error,
  isOwner,
  selectedCategory,
  searchQuery,
  sortBy,
  onSelectCategory,
  onSearchChange,
  onSortChange,
  onSelectBook,
}: BookGridProps) {
  const [page, setPage] = useState(1);

  const filteredBooks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const matched = books.filter((book) => {
      if (selectedCategory !== 'All' && book.category !== selectedCategory) {
        return false;
      }
      if (!q) return true;
      return (
        book.title.toLowerCase().includes(q) ||
        book.author.toLowerCase().includes(q) ||
        book.category.toLowerCase().includes(q)
      );
    });
    return sortBooksWithSeriesGrouping(matched, sortBy);
  }, [books, selectedCategory, searchQuery, sortBy]);

  // Reset to page 1 when filters or sort change
  useEffect(() => {
    setPage(1);
  }, [selectedCategory, searchQuery, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredBooks.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginatedBooks = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredBooks.slice(start, start + PAGE_SIZE);
  }, [filteredBooks, safePage]);

  const handlePageChange = (nextPage: number) => {
    setPage(nextPage);
    const el = document.getElementById('library');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <section id="library" className="py-16 sm:py-24 px-5 sm:px-8 border-b border-[#E8E2D6]">
      <div className="max-w-7xl mx-auto">
        {/* Section Heading & Controls Header */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-8">
          <div>
            <p className="text-xs font-medium tracking-[0.14em] text-[#B8893B] mb-2">
              The Collection
            </p>
            <h2 className="font-serif text-2xl sm:text-3xl font-semibold text-[#2B2B2B]">
              Library Catalog
            </h2>
          </div>

          {/* Search & Sort Controls */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
            <div className="relative flex-1 sm:w-72">
              <Search
                className="w-4 h-4 text-[#6B6B6B] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <label htmlFor="library-filter-search" className="sr-only">
                Filter catalog by title, author, or category
              </label>
              <input
                id="library-filter-search"
                type="search"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Filter titles, authors..."
                className="w-full min-h-[44px] pl-10 pr-9 py-2 rounded-xl bg-white border border-[#E8E2D6] text-sm text-[#2B2B2B] placeholder:text-[#6B6B6B]/75 focus:outline-none focus:border-[#2F5D62] transition-colors"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => onSearchChange('')}
                  aria-label="Clear search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-lg text-[#6B6B6B] hover:text-[#2B2B2B] cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="relative flex items-center">
              <SlidersHorizontal
                className="w-4 h-4 text-[#6B6B6B] absolute left-3.5 pointer-events-none"
                aria-hidden="true"
              />
              <label htmlFor="library-sort-select" className="sr-only">
                Sort books
              </label>
              <select
                id="library-sort-select"
                value={sortBy}
                onChange={(e) => onSortChange(e.target.value as SortOption)}
                className="w-full sm:w-auto min-h-[44px] pl-10 pr-8 py-2 rounded-xl bg-white border border-[#E8E2D6] text-sm text-[#2B2B2B] focus:outline-none focus:border-[#2F5D62] transition-colors cursor-pointer"
              >
                <option value="title_asc">Sort: Title A–Z</option>
                <option value="author_asc">Sort: Author A–Z</option>
                <option value="recent">Sort: Recently Added</option>
              </select>
            </div>
          </div>
        </div>

        {/* Interactive Category Filter Chips */}
        <div
          role="group"
          aria-label="Filter library by category"
          className="flex items-center gap-2 overflow-x-auto pb-3 mb-6 -mx-1 px-1"
        >
          <button
            type="button"
            onClick={() => onSelectCategory('All')}
            aria-pressed={selectedCategory === 'All'}
            className={`min-h-[40px] px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
              selectedCategory === 'All'
                ? 'bg-[#2F5D62] text-white'
                : 'bg-white border border-[#E8E2D6] text-[#6B6B6B] hover:text-[#2B2B2B] hover:border-[#2F5D62]/50'
            }`}
          >
            All Works
          </button>
          {categories.map((cat) => {
            const active = selectedCategory === cat.name;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => onSelectCategory(cat.name)}
                aria-pressed={active}
                className={`min-h-[40px] px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#2F5D62] text-white'
                    : 'bg-white border border-[#E8E2D6] text-[#6B6B6B] hover:text-[#2B2B2B] hover:border-[#2F5D62]/50'
                }`}
              >
                {cat.name}
              </button>
            );
          })}
        </div>

        {/* Result Count & Clear Filters Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-7 text-xs sm:text-sm text-[#6B6B6B] tabular-nums">
          <p>
            Showing{' '}
            <span className="font-medium text-[#2B2B2B]">{paginatedBooks.length}</span> of{' '}
            <span className="font-medium text-[#2B2B2B]">{filteredBooks.length}</span>{' '}
            {filteredBooks.length === 1 ? 'book' : 'books'}
            {selectedCategory !== 'All' ? ` in ${selectedCategory}` : ''}
          </p>

          {(selectedCategory !== 'All' || searchQuery.trim() !== '') && (
            <button
              type="button"
              onClick={() => {
                onSelectCategory('All');
                onSearchChange('');
              }}
              className="text-[#2F5D62] hover:underline font-medium cursor-pointer"
            >
              Reset filters
            </button>
          )}
        </div>

        {/* Error State */}
        {error && (
          <div
            role="alert"
            className="mb-8 p-5 rounded-2xl bg-white border border-[#E8E2D6] text-sm text-[#6B6B6B]"
          >
            {error}
          </div>
        )}

        {/* Loading Skeleton */}
        {loading ? (
          <div className="grid grid-cols-1 min-[420px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5 sm:gap-6">
            {Array.from({ length: 8 }).map((_, idx) => (
              <div
                key={idx}
                className="bg-white border border-[#E8E2D6] rounded-2xl overflow-hidden animate-pulse"
              >
                <div className="aspect-[3/4] bg-[#EDE7DC]" />
                <div className="p-5 space-y-2.5">
                  <div className="h-3 w-24 bg-[#EDE7DC] rounded" />
                  <div className="h-4 w-4/5 bg-[#EDE7DC] rounded" />
                  <div className="h-3 w-1/2 bg-[#EDE7DC] rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredBooks.length === 0 ? (
          /* Empty State */
          <div className="py-16 px-6 bg-white border border-[#E8E2D6] rounded-2xl text-center">
            <h3 className="font-serif text-xl font-semibold text-[#2B2B2B] mb-2">
              {searchQuery.trim()
                ? 'No matching books found'
                : 'No books in this category yet'}
            </h3>
            <p className="text-sm text-[#6B6B6B] max-w-md mx-auto mb-6">
              {searchQuery.trim()
                ? 'Try searching with a different keyword, author surname, or clear the active category filter.'
                : 'Books assigned to this discipline will appear here as soon as they are added to the catalog.'}
            </p>
            {(selectedCategory !== 'All' || searchQuery.trim()) && (
              <button
                type="button"
                onClick={() => {
                  onSelectCategory('All');
                  onSearchChange('');
                }}
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#2F5D62] text-white text-sm font-medium hover:bg-[#244A4E] transition-colors cursor-pointer"
              >
                View All Works
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Responsive Book Grid: 4 desktop / 3 tablet / 2 mobile / 1 very small screens */}
            <div className="grid grid-cols-1 min-[420px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5 sm:gap-6">
              {paginatedBooks.map((book) => (
                <BookCard
                  key={book.id}
                  book={book}
                  isOwner={isOwner}
                  onSelect={onSelectBook}
                />
              ))}
            </div>

            {/* Pagination Bar (keeps 70+ books snappy on mobile & desktop) */}
            {totalPages > 1 && (
              <nav
                aria-label="Catalog pagination"
                className="mt-12 flex items-center justify-center gap-2"
              >
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => handlePageChange(safePage - 1)}
                  className="inline-flex items-center gap-1 min-h-[44px] px-4 rounded-xl border border-[#E8E2D6] bg-white text-sm font-medium text-[#2B2B2B] hover:border-[#2F5D62] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                  <span>Previous</span>
                </button>

                <div className="flex items-center gap-1.5 px-2">
                  {Array.from({ length: totalPages }).map((_, idx) => {
                    const pageNum = idx + 1;
                    const active = pageNum === safePage;
                    return (
                      <button
                        key={pageNum}
                        type="button"
                        onClick={() => handlePageChange(pageNum)}
                        aria-current={active ? 'page' : undefined}
                        className={`min-w-[44px] min-h-[44px] rounded-xl text-sm font-medium tabular-nums transition-colors cursor-pointer ${
                          active
                            ? 'bg-[#2F5D62] text-white'
                            : 'bg-white border border-[#E8E2D6] text-[#6B6B6B] hover:text-[#2B2B2B] hover:border-[#2F5D62]'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => handlePageChange(safePage + 1)}
                  className="inline-flex items-center gap-1 min-h-[44px] px-4 rounded-xl border border-[#E8E2D6] bg-white text-sm font-medium text-[#2B2B2B] hover:border-[#2F5D62] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  <span>Next</span>
                  <ChevronRight className="w-4 h-4" aria-hidden="true" />
                </button>
              </nav>
            )}
          </>
        )}
      </div>
    </section>
  );
}
