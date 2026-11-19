/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LibraryProvider, useLibrary } from './context/LibraryContext';
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { CategoryGrid } from './components/CategoryGrid';
import { BookGrid } from './components/BookGrid';
import { BookModal } from './components/BookModal';
import { PdfViewer } from './components/PdfViewer';
import { AdminLogin } from './components/AdminLogin';
import { AdminDashboard } from './components/AdminDashboard';
import { Footer } from './components/Footer';
import { useReveal } from './hooks/useReveal';
import type { Book, SortOption } from './types/library';

function AboutSection() {
  const { ref, revealClass } = useReveal<HTMLElement>();

  return (
    <section
      id="about"
      ref={ref}
      className={`py-16 sm:py-24 px-5 sm:px-8 ${revealClass}`}
    >
      <div className="max-w-4xl mx-auto">
        <p className="text-xs font-medium tracking-[0.14em] text-[#B8893B] mb-2">
          About This Archive
        </p>
        <h2 className="font-serif text-2xl sm:text-3xl font-semibold text-[#2B2B2B] mb-6">
          A Quiet Reading Room for Serious Inquiry
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 sm:gap-10 text-sm sm:text-[15px] text-[#2B2B2B]/85 leading-[1.78]">
          <p>
            <strong className="font-serif font-semibold text-[#2B2B2B]">Gyaan Ka Sagar</strong>{' '}
            (“Ocean of Knowledge”) is a personal digital library curated for sustained reading and
            reference. Its shelves bring together primary sources, classic treatises, modern
            scholarship, and polemical works across Indian history, constitutional and political
            thought, economics, geopolitics, Hindu civilisation, and traditionalist philosophy.
          </p>
          <p>
            Because a serious library gathers voices from differing schools of thought, every
            catalog note is written in a measured, non-partisan register—summarising what each
            author argues and situating the book within its historical or intellectual debate so
            readers can engage with the texts directly and form their own judgement.
          </p>
        </div>
      </div>
    </section>
  );
}

function LibraryAppShell() {
  const {
    books,
    categories,
    settings,
    loading,
    error,
    isOwner,
    canReadPdfs,
    canDownloadPdfs,
  } = useLibrary();

  const [view, setView] = useState<'public' | 'admin'>('public');
  const [activeSection, setActiveSection] = useState<string>('home');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<SortOption>('title_asc');
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [readingBook, setReadingBook] = useState<Book | null>(null);

  // Keep selectedBook live with Firestore updates (e.g. once summary saves or PDF attaches)
  const selectedBook = useMemo(
    () => (selectedBookId ? books.find((b) => b.id === selectedBookId) ?? null : null),
    [books, selectedBookId]
  );

  // Highlight active navbar link as user scrolls through sections
  useEffect(() => {
    if (view !== 'public') return;
    const sectionIds = ['home', 'categories', 'library', 'about'];

    const onScroll = () => {
      const scrollPos = window.scrollY + 140;
      let current = 'home';
      for (const id of sectionIds) {
        const el = document.getElementById(id);
        if (el && el.offsetTop <= scrollPos) {
          current = id;
        }
      }
      setActiveSection(current);
    };

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [view]);

  const scrollToSection = (sectionId: string) => {
    setView('public');
    window.requestAnimationFrame(() => {
      const el = document.getElementById(sectionId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  };

  const handleSelectCategoryCard = (categoryName: string) => {
    setSelectedCategory(categoryName);
    scrollToSection('library');
  };

  const uploadedCount = useMemo(() => books.filter((b) => b.hasPdf).length, [books]);

  if (view === 'admin') {
    if (!isOwner) {
      return <AdminLogin onBack={() => setView('public')} />;
    }
    return <AdminDashboard onBackToSite={() => setView('public')} />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF7F2] text-[#2B2B2B]">
      <Navbar
        activeSection={activeSection}
        isOwner={isOwner}
        onNavigate={scrollToSection}
        onOpenAdmin={() => setView('admin')}
      />

      <main className="flex-1">
        <Hero
          totalBooks={books.length}
          uploadedCount={uploadedCount}
          categoryCount={categories.length}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onSearchSubmit={() => scrollToSection('library')}
          onExploreClick={() => scrollToSection('library')}
        />

        <CategoryGrid
          categories={categories}
          books={books}
          selectedCategory={selectedCategory}
          onSelectCategory={handleSelectCategoryCard}
        />

        <BookGrid
          books={books}
          categories={categories}
          loading={loading}
          error={error}
          isOwner={isOwner}
          selectedCategory={selectedCategory}
          searchQuery={searchQuery}
          sortBy={sortBy}
          onSelectCategory={setSelectedCategory}
          onSearchChange={setSearchQuery}
          onSortChange={setSortBy}
          onSelectBook={(book) => setSelectedBookId(book.id)}
        />

        <AboutSection />
      </main>

      <Footer />

      <BookModal
        book={selectedBook}
        visibility={settings.visibility}
        isOwner={isOwner}
        canReadPdfs={canReadPdfs}
        canDownloadPdfs={canDownloadPdfs}
        onClose={() => setSelectedBookId(null)}
        onReadOnline={(book) => {
          setSelectedBookId(null);
          setReadingBook(book);
        }}
      />

      <PdfViewer
        book={readingBook}
        canDownload={canDownloadPdfs}
        onClose={() => setReadingBook(null)}
      />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <LibraryProvider>
        <LibraryAppShell />
      </LibraryProvider>
    </ErrorBoundary>
  );
}
