export type VisibilityMode = 'private' | 'read_only' | 'public';

export type PdfStorageType = 'none' | 'firebase' | 'vault';

export type SortOption = 'title_asc' | 'author_asc' | 'recent';

export interface SeedBookEntry {
  filename: string;
  title: string;
  author: string;
  category: string;
  authorNeedsCheck: boolean;
}

export interface Book {
  id: string;
  filename: string;
  title: string;
  author: string;
  category: string;
  authorNeedsCheck: boolean;
  seriesName?: string;
  volumeNumber?: number;
  hasPdf: boolean;
  pdfStorageType: PdfStorageType;
  pdfStoragePath?: string;
  pdfUrl?: string;
  coverUrl?: string;
  pageCount?: number;
  fileSizeBytes?: number;
  extractedPreviewText?: string;
  aboutBook?: string;
  whyWorthReading?: string;
  aboutAuthor?: string;
  aiGenerated: boolean;
  aiGeneratedAt?: string;
  ownerId: string;
  createdAtMs: number;
  updatedAtMs: number;
  isSeedFallback?: boolean;
}

export interface CategoryRecord {
  id: string;
  name: string;
  order: number;
  isDefault: boolean;
}

export interface LibrarySettings {
  visibility: VisibilityMode;
  seededCatalogCount: number;
}

export const DEFAULT_CATEGORIES: readonly string[] = [
  'History & Freedom Movement',
  'Hindutva & Hindu Nationalism',
  'Hindu Thought & Civilisation',
  'Economics',
  'Politics & Political Thought',
  'Geopolitics & Foreign Policy',
  'Philosophy & Traditionalism',
  'Other',
] as const;

export const MAX_PDF_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB
