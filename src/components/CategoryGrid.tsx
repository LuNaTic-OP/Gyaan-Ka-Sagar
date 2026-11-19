import React from 'react';
import {
  BookOpen,
  Compass,
  FolderOpen,
  Globe,
  Landmark,
  Scale,
  ScrollText,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import type { Book, CategoryRecord } from '../types/library';
import { useReveal } from '../hooks/useReveal';

interface CategoryGridProps {
  categories: CategoryRecord[];
  books: Book[];
  selectedCategory: string;
  onSelectCategory: (categoryName: string) => void;
}

function getCategoryIcon(categoryName: string) {
  const lower = categoryName.toLowerCase();
  if (lower.includes('history') || lower.includes('freedom')) return ScrollText;
  if (lower.includes('hindutva') || lower.includes('nationalism')) return Landmark;
  if (lower.includes('civilisation') || lower.includes('hindu thought')) return BookOpen;
  if (lower.includes('economics')) return TrendingUp;
  if (lower.includes('geopolitics') || lower.includes('foreign')) return Globe;
  if (lower.includes('politics')) return Scale;
  if (lower.includes('philosophy') || lower.includes('traditionalism')) return Compass;
  if (lower === 'other') return FolderOpen;
  return Sparkles;
}

export function CategoryGrid({
  categories,
  books,
  selectedCategory,
  onSelectCategory,
}: CategoryGridProps) {
  const { ref, revealClass } = useReveal<HTMLElement>();

  const countsByCategory = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const book of books) {
      counts.set(book.category, (counts.get(book.category) ?? 0) + 1);
    }
    return counts;
  }, [books]);

  return (
    <section
      id="categories"
      ref={ref}
      className={`py-16 sm:py-22 px-5 sm:px-8 border-b border-[#E8E2D6] ${revealClass}`}
    >
      <div className="max-w-7xl mx-auto">
        <div className="max-w-2xl mb-10 sm:mb-12">
          <p className="text-xs font-medium tracking-[0.14em] text-[#B8893B] mb-2">
            Browse by Subject
          </p>
          <h2 className="font-serif text-2xl sm:text-3xl font-semibold text-[#2B2B2B] mb-3">
            Categories
          </h2>
          <p className="text-sm sm:text-base text-[#6B6B6B]">
            Select a discipline to filter the collection and jump directly into the reading shelf.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
          {categories.map((cat) => {
            const Icon = getCategoryIcon(cat.name);
            const count = countsByCategory.get(cat.name) ?? 0;
            const isSelected = selectedCategory === cat.name;

            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => onSelectCategory(cat.name)}
                className={`group text-left p-5 sm:p-6 rounded-2xl border transition-all duration-200 cursor-pointer min-h-[112px] flex flex-col justify-between hover:-translate-y-0.5 ${
                  isSelected
                    ? 'bg-[#2F5D62]/[0.04] border-[#2F5D62] shadow-[0_6px_20px_rgba(47,93,98,0.08)]'
                    : 'bg-white border-[#E8E2D6] hover:border-[#2F5D62]/50 hover:shadow-[0_6px_20px_rgba(43,43,43,0.05)]'
                }`}
              >
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
                      isSelected
                        ? 'bg-[#2F5D62] text-white'
                        : 'bg-[#FAF7F2] text-[#2F5D62] group-hover:bg-[#2F5D62]/10'
                    }`}
                  >
                    <Icon className="w-5 h-5" aria-hidden="true" />
                  </div>
                  <span className="text-xs font-medium text-[#6B6B6B] tabular-nums pt-1">
                    {count} {count === 1 ? 'book' : 'books'}
                  </span>
                </div>

                <h3 className="font-serif text-base font-semibold text-[#2B2B2B] leading-snug group-hover:text-[#2F5D62] transition-colors">
                  {cat.name}
                </h3>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
