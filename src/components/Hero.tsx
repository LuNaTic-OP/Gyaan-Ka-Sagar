import React from 'react';
import { ArrowDown, Search } from 'lucide-react';
import { LogoMark } from './Navbar';

interface HeroProps {
  totalBooks: number;
  uploadedCount: number;
  categoryCount: number;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onSearchSubmit: () => void;
  onExploreClick: () => void;
}

export function Hero({
  totalBooks,
  uploadedCount,
  categoryCount,
  searchQuery,
  onSearchChange,
  onSearchSubmit,
  onExploreClick,
}: HeroProps) {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearchSubmit();
  };

  return (
    <section
      id="home"
      className="relative pt-16 pb-20 sm:pt-24 sm:pb-28 px-5 sm:px-8 border-b border-[#E8E2D6]"
    >
      <div className="max-w-4xl mx-auto text-center">
        <div className="inline-flex items-center justify-center mb-5">
          <LogoMark className="w-12 h-12" />
        </div>

        <p className="text-xs sm:text-sm font-medium tracking-[0.18em] text-[#B8893B] mb-3">
          Ocean of Knowledge
        </p>

        <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-semibold text-[#2B2B2B] tracking-tight leading-[1.15] mb-6">
          Gyaan Ka Sagar
        </h1>

        <p className="max-w-2xl mx-auto text-base sm:text-lg text-[#6B6B6B] leading-[1.75] mb-10">
          A quiet personal reading room of carefully gathered works across Indian history,
          political thought, philosophy, economics, geopolitics, and civilisation.
        </p>

        {/* Quiet Scholarly Search Form */}
        <form
          onSubmit={handleSubmit}
          role="search"
          aria-label="Search the library catalog"
          className="max-w-2xl mx-auto mb-8"
        >
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 bg-white border border-[#E8E2D6] rounded-2xl p-2 shadow-[0_2px_12px_rgba(43,43,43,0.03)] focus-within:border-[#2F5D62] transition-colors">
            <div className="flex items-center flex-1 pl-3 pr-2 min-h-[44px]">
              <Search className="w-4 h-4 text-[#6B6B6B] shrink-0 mr-3" aria-hidden="true" />
              <label htmlFor="hero-library-search" className="sr-only">
                Search by title, author, or category
              </label>
              <input
                id="hero-library-search"
                type="search"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search by title, author, or subject..."
                className="w-full bg-transparent text-sm sm:text-base text-[#2B2B2B] placeholder:text-[#6B6B6B]/75 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="min-h-[44px] px-6 py-2.5 rounded-xl bg-[#2F5D62] text-white text-sm font-medium hover:bg-[#244A4E] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Search Catalog
            </button>
          </div>
        </form>

        {/* Single Clear Secondary Action & Clean Unboxed Collection Summary */}
        <div className="flex flex-col items-center gap-6">
          <button
            type="button"
            onClick={onExploreClick}
            className="inline-flex items-center gap-2 min-h-[44px] px-6 py-2.5 rounded-xl border border-[#E8E2D6] bg-white text-sm font-medium text-[#2F5D62] hover:border-[#2F5D62] hover:bg-[#2F5D62]/5 transition-colors whitespace-nowrap cursor-pointer"
          >
            <span>Explore Library</span>
            <ArrowDown className="w-4 h-4" aria-hidden="true" />
          </button>

          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs sm:text-sm text-[#6B6B6B] tabular-nums">
            <span>{totalBooks} cataloged works</span>
            <span aria-hidden="true" className="text-[#B8893B]">
              ·
            </span>
            <span>{categoryCount} disciplines</span>
            {uploadedCount > 0 && (
              <>
                <span aria-hidden="true" className="text-[#B8893B]">
                  ·
                </span>
                <span>{uploadedCount} PDFs available</span>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
