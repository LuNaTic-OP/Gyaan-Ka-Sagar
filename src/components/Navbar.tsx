import React, { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';

interface NavbarProps {
  activeSection: string;
  isOwner: boolean;
  onNavigate: (sectionId: string) => void;
  onOpenAdmin: () => void;
}

/**
 * Simple open-book + ocean wave mark crafted specifically for Gyaan Ka Sagar.
 */
export function LogoMark({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Open book pages */}
      <path
        d="M18 10.5C14.8 8.3 10.4 7.7 5.5 8.8V22.4C10.2 21.3 14.6 21.8 18 24.2C21.4 21.8 25.8 21.3 30.5 22.4V8.8C25.6 7.7 21.2 8.3 18 10.5Z"
        stroke="#2F5D62"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M18 10.5V24.2"
        stroke="#2F5D62"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {/* Gentle ocean wave beneath the open book */}
      <path
        d="M5 27.8C7.6 26.2 10.2 26.2 12.8 27.8C15.4 29.4 18 29.4 20.6 27.8C23.2 26.2 25.8 26.2 28.4 27.8C29.5 28.5 30.3 28.7 31 28.7"
        stroke="#B8893B"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

const NAV_LINKS = [
  { id: 'home', label: 'Home' },
  { id: 'categories', label: 'Categories' },
  { id: 'library', label: 'Library' },
  { id: 'about', label: 'About' },
] as const;

export function Navbar({
  activeSection,
  isOwner,
  onNavigate,
  onOpenAdmin,
}: NavbarProps) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleLinkClick = (sectionId: string) => {
    setMobileOpen(false);
    onNavigate(sectionId);
  };

  return (
    <header
      className={`sticky top-0 z-40 w-full transition-shadow duration-200 bg-[#FAF7F2]/88 backdrop-blur-md border-b border-[#E8E2D6] ${
        scrolled ? 'shadow-[0_4px_20px_rgba(43,43,43,0.06)]' : 'shadow-none'
      }`}
    >
      <div className="max-w-7xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Single-line Brand Mark + Title */}
        <a
          href="#home"
          onClick={(e) => {
            e.preventDefault();
            handleLinkClick('home');
          }}
          className="inline-flex items-center gap-2.5 text-[#2B2B2B] hover:text-[#2F5D62] transition-colors whitespace-nowrap shrink-0"
        >
          <LogoMark className="w-7 h-7 shrink-0" />
          <span className="font-serif text-lg sm:text-xl font-semibold tracking-tight">
            Gyaan Ka Sagar
          </span>
        </a>

        {/* Zone 2: Primary Navigation Links */}
        <nav
          aria-label="Primary navigation"
          className="hidden md:flex items-center gap-7"
        >
          {NAV_LINKS.map((link) => {
            const isActive = activeSection === link.id;
            return (
              <a
                key={link.id}
                href={`#${link.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  handleLinkClick(link.id);
                }}
                aria-current={isActive ? 'page' : undefined}
                className={`relative py-2 text-sm font-medium whitespace-nowrap shrink-0 transition-colors ${
                  isActive
                    ? 'text-[#2F5D62]'
                    : 'text-[#6B6B6B] hover:text-[#2B2B2B]'
                }`}
              >
                {link.label}
                <span
                  aria-hidden="true"
                  className={`absolute left-0 right-0 bottom-0.5 h-[1.5px] bg-[#2F5D62] transition-opacity duration-200 ${
                    isActive ? 'opacity-100' : 'opacity-0'
                  }`}
                />
              </a>
            );
          })}
        </nav>

        {/* Zone 3: Single Primary Action (Owner Login / Dashboard) + Mobile Menu Trigger */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              setMobileOpen(false);
              onOpenAdmin();
            }}
            className={`hidden md:inline-flex items-center justify-center min-h-[40px] px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
              isOwner
                ? 'bg-[#2F5D62] text-white hover:bg-[#244A4E]'
                : 'border border-[#E8E2D6] bg-white text-[#2B2B2B] hover:border-[#2F5D62] hover:text-[#2F5D62]'
            }`}
          >
            {isOwner ? 'Owner Dashboard' : 'Owner Login'}
          </button>

          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav-panel"
            aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
            className="md:hidden inline-flex items-center justify-center w-11 h-11 rounded-xl text-[#2B2B2B] hover:bg-[#E8E2D6]/50 transition-colors cursor-pointer"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Smooth Slide-Down Mobile Panel */}
      <div
        id="mobile-nav-panel"
        className={`md:hidden overflow-hidden transition-all duration-300 ease-out bg-[#FAF7F2] border-t border-[#E8E2D6] ${
          mobileOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0 border-t-0'
        }`}
      >
        <nav aria-label="Mobile navigation" className="px-5 py-4 flex flex-col gap-1">
          {NAV_LINKS.map((link) => {
            const isActive = activeSection === link.id;
            return (
              <a
                key={link.id}
                href={`#${link.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  handleLinkClick(link.id);
                }}
                className={`min-h-[44px] flex items-center px-3 rounded-xl text-base font-medium transition-colors ${
                  isActive
                    ? 'bg-[#2F5D62]/10 text-[#2F5D62]'
                    : 'text-[#2B2B2B] hover:bg-[#E8E2D6]/40'
                }`}
              >
                {link.label}
              </a>
            );
          })}
          <div className="pt-2 mt-2 border-t border-[#E8E2D6]">
            <button
              type="button"
              onClick={() => {
                setMobileOpen(false);
                onOpenAdmin();
              }}
              className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-[#2F5D62] text-white text-sm font-medium hover:bg-[#244A4E] transition-colors cursor-pointer"
            >
              {isOwner ? 'Owner Dashboard' : 'Owner Login'}
            </button>
          </div>
        </nav>
      </div>
    </header>
  );
}
