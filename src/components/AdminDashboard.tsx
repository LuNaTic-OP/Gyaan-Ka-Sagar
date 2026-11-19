import React, { useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Eye,
  Files,
  Globe,
  Lock,
  LogOut,
  Upload,
} from 'lucide-react';
import { useLibrary } from '../context/LibraryContext';
import type { VisibilityMode } from '../types/library';
import { LogoMark } from './Navbar';
import { ManageBooks } from './ManageBooks';
import { UploadForm } from './UploadForm';
import { BulkUploader } from './BulkUploader';

interface AdminDashboardProps {
  onBackToSite: () => void;
}

type DashboardTab = 'manage' | 'upload' | 'bulk';

const VISIBILITY_OPTIONS: Array<{
  mode: VisibilityMode;
  label: string;
  description: string;
  icon: typeof Lock;
}> = [
  {
    mode: 'private',
    label: 'Private (Default)',
    description:
      'PDF reading and downloads are restricted to the logged-in owner. Visitors browse the catalog, covers, and summaries only.',
    icon: Lock,
  },
  {
    mode: 'read_only',
    label: 'Read Online Only',
    description:
      'Visitors can read uploaded books in the built-in PDF.js viewer; downloads are disabled in the UI and blocked server-side.',
    icon: Eye,
  },
  {
    mode: 'public',
    label: 'Public',
    description:
      'Anyone visiting Gyaan Ka Sagar can read uploaded books online and download the PDF files.',
    icon: Globe,
  },
];

export function AdminDashboard({ onBackToSite }: AdminDashboardProps) {
  const { books, settings, seeding, user, logout, setVisibility } = useLibrary();
  const [activeTab, setActiveTab] = useState<DashboardTab>('manage');
  const [savingVisibility, setSavingVisibility] = useState(false);
  const [visibilityNotice, setVisibilityNotice] = useState<string | null>(null);

  const attachedCount = books.filter((b) => b.hasPdf).length;
  const verifyCount = books.filter((b) => b.authorNeedsCheck).length;

  const handleVisibilityChange = async (mode: VisibilityMode) => {
    if (mode === settings.visibility) return;
    setSavingVisibility(true);
    setVisibilityNotice(null);
    try {
      await setVisibility(mode);
      setVisibilityNotice('Library visibility updated and enforced immediately.');
    } catch (err: unknown) {
      setVisibilityNotice(
        err instanceof Error ? err.message : 'Unable to update visibility setting.'
      );
    } finally {
      setSavingVisibility(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF7F2]">
      {/* Dashboard Top Header */}
      <header className="sticky top-0 z-30 bg-[#FAF7F2]/92 backdrop-blur-md border-b border-[#E8E2D6]">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <LogoMark className="w-7 h-7 shrink-0" />
            <div className="min-w-0">
              <h1 className="font-serif text-base sm:text-lg font-semibold text-[#2B2B2B] truncate">
                Owner Dashboard
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              type="button"
              onClick={onBackToSite}
              className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 rounded-xl border border-[#E8E2D6] bg-white text-xs sm:text-sm font-medium text-[#2B2B2B] hover:border-[#2F5D62] hover:text-[#2F5D62] transition-colors whitespace-nowrap cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              <span>Public Library</span>
            </button>

            <button
              type="button"
              onClick={() => void logout().then(onBackToSite)}
              className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 rounded-xl border border-[#E8E2D6] bg-white text-xs sm:text-sm font-medium text-[#6B6B6B] hover:border-[#8C3B2B] hover:text-[#8C3B2B] transition-colors whitespace-nowrap cursor-pointer"
            >
              <LogOut className="w-4 h-4" aria-hidden="true" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-5 sm:px-8 py-8 sm:py-10 space-y-8">
        {seeding && (
          <div className="p-4 rounded-xl bg-white border border-[#2F5D62]/30 text-sm text-[#2F5D62]">
            Initializing your 69 catalog books and 8 core categories in Firestore...
          </div>
        )}

        {/* Quiet Collection Overview Strip */}
        <section aria-label="Library summary" className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white border border-[#E8E2D6] rounded-2xl p-5">
            <p className="text-xs text-[#6B6B6B] mb-1">Cataloged Works</p>
            <p className="font-serif text-3xl font-semibold text-[#2B2B2B] tabular-nums">
              {books.length}
            </p>
          </div>
          <div className="bg-white border border-[#E8E2D6] rounded-2xl p-5">
            <p className="text-xs text-[#6B6B6B] mb-1">PDFs Attached</p>
            <p className="font-serif text-3xl font-semibold text-[#2F5D62] tabular-nums">
              {attachedCount}
            </p>
          </div>
          <div className="bg-white border border-[#E8E2D6] rounded-2xl p-5">
            <p className="text-xs text-[#6B6B6B] mb-1">Authors to Verify</p>
            <p className="font-serif text-3xl font-semibold text-[#B8893B] tabular-nums">
              {verifyCount}
            </p>
          </div>
        </section>

        {/* Library Visibility Setting */}
        <section
          aria-labelledby="visibility-heading"
          className="bg-white border border-[#E8E2D6] rounded-2xl p-6 sm:p-7 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2
                id="visibility-heading"
                className="font-serif text-lg sm:text-xl font-semibold text-[#2B2B2B]"
              >
                Library Visibility Setting
              </h2>
              <p className="text-xs sm:text-sm text-[#6B6B6B]">
                Controls visitor access to PDF files. Enforced by server-side access checks and
                Firebase Storage rules.
              </p>
            </div>
            {user?.email && (
              <span className="text-xs text-[#6B6B6B]">Signed in as {user.email}</span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {VISIBILITY_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const active = settings.visibility === opt.mode;
              return (
                <button
                  key={opt.mode}
                  type="button"
                  disabled={savingVisibility}
                  onClick={() => void handleVisibilityChange(opt.mode)}
                  aria-pressed={active}
                  className={`text-left p-4 rounded-xl border transition-all cursor-pointer ${
                    active
                      ? 'border-[#2F5D62] bg-[#2F5D62]/[0.05]'
                      : 'border-[#E8E2D6] bg-[#FAF7F2]/50 hover:border-[#2F5D62]/50'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Icon
                      className={`w-4 h-4 ${active ? 'text-[#2F5D62]' : 'text-[#6B6B6B]'}`}
                      aria-hidden="true"
                    />
                    <span className="text-sm font-semibold text-[#2B2B2B]">{opt.label}</span>
                  </div>
                  <p className="text-xs text-[#6B6B6B] leading-relaxed">{opt.description}</p>
                </button>
              );
            })}
          </div>

          {visibilityNotice && (
            <p className="text-xs text-[#2F5D62] font-medium">{visibilityNotice}</p>
          )}
        </section>

        {/* Dashboard Section Tabs */}
        <div>
          <div
            role="tablist"
            aria-label="Owner dashboard sections"
            className="inline-flex flex-wrap items-center gap-1 p-1 rounded-xl bg-white border border-[#E8E2D6] mb-6"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'manage'}
              onClick={() => setActiveTab('manage')}
              className={`inline-flex items-center gap-2 min-h-[42px] px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors cursor-pointer ${
                activeTab === 'manage'
                  ? 'bg-[#2F5D62] text-white'
                  : 'text-[#6B6B6B] hover:text-[#2B2B2B]'
              }`}
            >
              <BookOpen className="w-4 h-4" aria-hidden="true" />
              <span>Manage Books</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'upload'}
              onClick={() => setActiveTab('upload')}
              className={`inline-flex items-center gap-2 min-h-[42px] px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors cursor-pointer ${
                activeTab === 'upload'
                  ? 'bg-[#2F5D62] text-white'
                  : 'text-[#6B6B6B] hover:text-[#2B2B2B]'
              }`}
            >
              <Upload className="w-4 h-4" aria-hidden="true" />
              <span>Upload Book</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'bulk'}
              onClick={() => setActiveTab('bulk')}
              className={`inline-flex items-center gap-2 min-h-[42px] px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors cursor-pointer ${
                activeTab === 'bulk'
                  ? 'bg-[#2F5D62] text-white'
                  : 'text-[#6B6B6B] hover:text-[#2B2B2B]'
              }`}
            >
              <Files className="w-4 h-4" aria-hidden="true" />
              <span>Bulk Upload</span>
            </button>
          </div>

          {activeTab === 'manage' && <ManageBooks />}
          {activeTab === 'upload' && <UploadForm />}
          {activeTab === 'bulk' && <BulkUploader />}
        </div>
      </main>
    </div>
  );
}
