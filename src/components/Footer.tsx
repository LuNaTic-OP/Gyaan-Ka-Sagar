import React from 'react';
import { LogoMark } from './Navbar';

export function Footer() {
  return (
    <footer className="bg-white border-t border-[#E8E2D6] py-14 sm:py-16 px-5 sm:px-8">
      <div className="max-w-5xl mx-auto text-center">
        <div className="inline-flex items-center justify-center mb-5">
          <LogoMark className="w-9 h-9" />
        </div>

        <blockquote className="max-w-2xl mx-auto mb-8">
          <p className="font-serif italic text-lg sm:text-xl text-[#2B2B2B] leading-relaxed mb-2">
            “Vidya dadati vinayam — knowledge bestows humility, and from humility comes worthiness.”
          </p>
          <footer className="text-xs tracking-[0.12em] text-[#B8893B]">
            Hitopadesha
          </footer>
        </blockquote>

        <div className="h-px max-w-xs mx-auto bg-[#E8E2D6] mb-6" />

        <p className="font-serif text-sm font-semibold text-[#2B2B2B] mb-1">
          Gyaan Ka Sagar · Ocean of Knowledge
        </p>
        <p className="text-xs text-[#6B6B6B]">
          Personal digital library archive for quiet study and reference.
        </p>
      </div>
    </footer>
  );
}
