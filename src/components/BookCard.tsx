import React, { useState } from 'react';
import type { Book } from '../types/library';
import {
  extractSeriesInfo,
  formatAuthorDisplay,
  getPlaceholderCoverTheme,
} from '../utils/catalogHelpers';
import { useReveal } from '../hooks/useReveal';

interface BookCardProps {
  book: Book;
  isOwner: boolean;
  onSelect: (book: Book) => void;
}

export function BookCard({ book, isOwner, onSelect }: BookCardProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const { ref, revealClass } = useReveal<HTMLElement>(0.04);

  const theme = getPlaceholderCoverTheme(`${book.title}-${book.author}`);
  const seriesInfo = extractSeriesInfo(book.title);
  const authorDisplay = formatAuthorDisplay(book.author, isOwner);
  const showRenderedCover = Boolean(book.coverUrl && !imgFailed);

  return (
    <article
      ref={ref}
      className={`group flex flex-col bg-white border border-[#E8E2D6] rounded-2xl overflow-hidden transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_10px_28px_rgba(43,43,43,0.07)] hover:border-[#D6CEBE] ${revealClass}`}
    >
      <button
        type="button"
        onClick={() => onSelect(book)}
        aria-label={`View details for ${book.title} by ${authorDisplay}`}
        className="flex flex-col flex-1 text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2F5D62]"
      >
        {/* Cover Area (3:4 vertical book proportion) */}
        <div className="relative aspect-[3/4] w-full bg-[#F3EEE4] overflow-hidden border-b border-[#E8E2D6]">
          {showRenderedCover ? (
            <img
              src={book.coverUrl}
              alt={`Cover of ${book.title}`}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              onError={() => setImgFailed(true)}
              className="w-full h-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.02]"
            />
          ) : (
            /* Elegant Cloth-Bound Scholarly Placeholder Cover */
            <div
              className="w-full h-full p-5 sm:p-6 flex flex-col justify-between relative"
              style={{ backgroundColor: theme.bg, color: theme.text }}
            >
              {/* Subtle book spine groove */}
              <div
                aria-hidden="true"
                className="absolute inset-y-0 left-3 w-px opacity-25"
                style={{ backgroundColor: theme.accent }}
              />
              {/* Top rule & series marker */}
              <div className="pl-2 flex items-center justify-between gap-2">
                <span
                  className="text-[11px] tracking-[0.12em] uppercase opacity-80 truncate"
                  style={{ color: theme.accent }}
                >
                  {seriesInfo.volumeLabel || 'Gyaan Ka Sagar'}
                </span>
              </div>

              {/* Center Title Typography */}
              <div className="pl-2 my-auto py-3">
                <div
                  aria-hidden="true"
                  className="w-8 h-px mb-3 opacity-60"
                  style={{ backgroundColor: theme.accent }}
                />
                <p className="font-serif text-base sm:text-lg font-semibold leading-snug line-clamp-5 tracking-tight">
                  {book.title}
                </p>
              </div>

              {/* Bottom Author Attribution */}
              <div className="pl-2 pt-2 border-t border-white/15">
                <p className="text-xs opacity-85 line-clamp-1">{authorDisplay}</p>
              </div>
            </div>
          )}
        </div>

        {/* Book Metadata Body (Zero-Pill Editorial Discipline) */}
        <div className="p-4 sm:p-5 flex flex-col flex-1 justify-between gap-3">
          <div>
            <p className="text-xs text-[#2F5D62] font-medium mb-1.5 line-clamp-1">
              {book.category}
            </p>
            <h3 className="font-serif text-base font-semibold text-[#2B2B2B] leading-snug line-clamp-2 group-hover:text-[#2F5D62] transition-colors mb-1">
              {book.title}
            </h3>
            <p className="text-sm text-[#6B6B6B] line-clamp-1">{authorDisplay}</p>
          </div>

          <div className="pt-2.5 border-t border-[#E8E2D6]/70 flex items-center justify-between gap-2 text-xs text-[#6B6B6B]">
            <span className={book.hasPdf ? 'text-[#2F5D62] font-medium' : 'text-[#6B6B6B]'}>
              {book.hasPdf ? 'PDF available' : 'PDF coming soon'}
            </span>
            {seriesInfo.volumeLabel && (
              <span className="text-[#B8893B] font-medium tabular-nums shrink-0">
                {seriesInfo.volumeLabel}
              </span>
            )}
          </div>
        </div>
      </button>
    </article>
  );
}
