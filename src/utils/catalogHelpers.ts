import type { Book, SeedBookEntry, SortOption } from '../types/library';

/**
 * Generates a deterministic, Firestore-safe document ID matching ^[a-zA-Z0-9_\-]+$ (max 128 chars).
 */
export function makeSafeId(input: string, prefix = 'book'): string {
  const cleaned = input
    .toLowerCase()
    .replace(/\.pdf$/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 88);

  // Simple deterministic FNV-1a hash suffix to avoid collisions (e.g., two "How I Became a Hindu" titles)
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const suffix = (hash >>> 0).toString(36).slice(0, 8);
  return `${prefix}-${cleaned || 'item'}-${suffix}`.slice(0, 128);
}

/**
 * Normalizes a filename for resilient catalog matching during single and bulk uploads.
 */
export function normalizeFilename(filename: string): string {
  return filename
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Parses multi-volume series metadata from a book title so multi-volume sets
 * (e.g. R. C. Majumdar's History of the Freedom Movement Vols 1–3, Sita Ram Goel's Hindu Temples 2-vol set)
 * sit together and sort strictly in volume order.
 */
export function extractSeriesInfo(title: string): {
  seriesName: string;
  volumeNumber: number;
  volumeLabel?: string;
} {
  // Match ", Vol. 1", "Vol-2", "Volume 3", "Part 2"
  const volMatch = title.match(
    /^(.*?)(?:[,:\-–—\s]+)(?:vol(?:ume)?\.?|part)\s*[-#]?\s*(\d+)(?:\s*\(([^)]+)\))?$/i
  );
  if (volMatch) {
    const base = volMatch[1].trim().replace(/[,:\-–—]+$/, '').trim();
    const vol = parseInt(volMatch[2], 10);
    return {
      seriesName: base,
      volumeNumber: isNaN(vol) ? 0 : vol,
      volumeLabel: `Vol. ${vol}`,
    };
  }

  // Match "(2 Vol. Set)" or "(3 Volume Set)"
  const setMatch = title.match(/^(.*?)\s*\((\d+)\s*vol(?:ume)?s?\.?\s*set\)$/i);
  if (setMatch) {
    const base = setMatch[1].trim();
    const count = parseInt(setMatch[2], 10);
    return {
      seriesName: base,
      volumeNumber: 1,
      volumeLabel: `${count}-Vol. Set`,
    };
  }

  // Match "Breaking India 2.0" -> group alongside "Breaking India"
  if (/breaking india 2\.0/i.test(title)) {
    return {
      seriesName: 'Breaking India',
      volumeNumber: 2,
      volumeLabel: 'Book 2',
    };
  }
  if (/^breaking india$/i.test(title.trim())) {
    return {
      seriesName: 'Breaking India',
      volumeNumber: 1,
      volumeLabel: 'Book 1',
    };
  }

  return {
    seriesName: '',
    volumeNumber: 0,
  };
}

/**
 * Converts a seed JSON entry into a full Book object ready for display or Firestore seeding.
 */
export function seedEntryToBook(entry: SeedBookEntry, index: number, ownerId = 'seed'): Book {
  const id = makeSafeId(entry.filename, 'book');
  const { seriesName, volumeNumber } = extractSeriesInfo(entry.title);
  // Deterministic staggered timestamps so initial "Recently Added" preserves catalog order cleanly
  const baseMs = Date.UTC(2026, 0, 1) + (1000 - index) * 1000;

  return {
    id,
    filename: entry.filename.slice(0, 300),
    title: entry.title.slice(0, 300),
    author: entry.author.slice(0, 250),
    category: entry.category.slice(0, 120),
    authorNeedsCheck: Boolean(entry.authorNeedsCheck),
    seriesName: seriesName || undefined,
    volumeNumber: volumeNumber || 0,
    hasPdf: false,
    pdfStorageType: 'none',
    aiGenerated: false,
    ownerId,
    createdAtMs: baseMs,
    updatedAtMs: baseMs,
    isSeedFallback: ownerId === 'seed',
  };
}

function getSeriesGroupKey(book: Book): string {
  if (book.seriesName && book.seriesName.trim().length > 0) {
    return `${book.seriesName.trim().toLowerCase()}::${book.author.trim().toLowerCase()}`;
  }
  const parsed = extractSeriesInfo(book.title);
  if (parsed.seriesName) {
    return `${parsed.seriesName.toLowerCase()}::${book.author.trim().toLowerCase()}`;
  }
  return '';
}

function getVolumeNumber(book: Book): number {
  if (typeof book.volumeNumber === 'number' && book.volumeNumber > 0) {
    return book.volumeNumber;
  }
  return extractSeriesInfo(book.title).volumeNumber;
}

function stripLeadingArticles(title: string): string {
  return title.replace(/^(the|a|an)\s+/i, '').trim().toLowerCase();
}

/**
 * Sorts books according to the chosen sort mode while keeping multi-volume series
 * grouped together and ordered strictly by volume number.
 */
export function sortBooksWithSeriesGrouping(books: Book[], sortBy: SortOption): Book[] {
  // Compute representative sort key per series group so all volumes stay contiguous
  const groupRepresentative = new Map<string, Book>();
  for (const book of books) {
    const key = getSeriesGroupKey(book);
    if (!key) continue;
    const existing = groupRepresentative.get(key);
    if (!existing) {
      groupRepresentative.set(key, book);
    } else {
      // Pick Vol. 1 as representative for title/author, or newest timestamp for recent
      if (sortBy === 'recent') {
        if (book.updatedAtMs > existing.updatedAtMs) {
          groupRepresentative.set(key, book);
        }
      } else if (getVolumeNumber(book) < getVolumeNumber(existing)) {
        groupRepresentative.set(key, book);
      }
    }
  }

  return [...books].sort((a, b) => {
    const keyA = getSeriesGroupKey(a);
    const keyB = getSeriesGroupKey(b);

    // Same multi-volume series -> always sort in volume order
    if (keyA && keyA === keyB) {
      const volDiff = getVolumeNumber(a) - getVolumeNumber(b);
      if (volDiff !== 0) return volDiff;
      return a.title.localeCompare(b.title);
    }

    const repA = keyA ? groupRepresentative.get(keyA) ?? a : a;
    const repB = keyB ? groupRepresentative.get(keyB) ?? b : b;

    if (sortBy === 'author_asc') {
      const authorCmp = repA.author.localeCompare(repB.author, undefined, { sensitivity: 'base' });
      if (authorCmp !== 0) return authorCmp;
      return stripLeadingArticles(repA.title).localeCompare(stripLeadingArticles(repB.title));
    }

    if (sortBy === 'recent') {
      const timeDiff = repB.updatedAtMs - repA.updatedAtMs;
      if (timeDiff !== 0) return timeDiff;
      return stripLeadingArticles(repA.title).localeCompare(stripLeadingArticles(repB.title));
    }

    // Default: Title A-Z
    const titleCmp = stripLeadingArticles(repA.title).localeCompare(
      stripLeadingArticles(repB.title)
    );
    if (titleCmp !== 0) return titleCmp;
    return repA.author.localeCompare(repB.author, undefined, { sensitivity: 'base' });
  });
}

export function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Formats an author display string, gently softening catalog placeholders for public visitors.
 */
export function formatAuthorDisplay(author: string, isOwner: boolean): string {
  if (/^UNKNOWN/i.test(author.trim())) {
    return isOwner ? 'Unknown (verify from PDF)' : 'Author to be verified';
  }
  return author;
}

/**
 * Deterministic muted scholarly cover palette for placeholder book covers (no harsh colors).
 */
const COVER_THEMES = [
  { bg: '#2F5D62', border: '#244A4E', accent: '#D8C29D', text: '#FAF7F2' }, // Deep Muted Teal
  { bg: '#3E5258', border: '#2E3F44', accent: '#D6BE93', text: '#FAF7F2' }, // Slate Ink
  { bg: '#5C4B3B', border: '#46382B', accent: '#E2C99E', text: '#FAF7F2' }, // Archival Umber
  { bg: '#47574B', border: '#364339', accent: '#D8C49B', text: '#FAF7F2' }, // Sage Parchment
  { bg: '#63433B', border: '#4C322C', accent: '#DFC59C', text: '#FAF7F2' }, // Terracotta Cloth
  { bg: '#374859', border: '#2A3745', accent: '#D6C098', text: '#FAF7F2' }, // Indigo Linen
] as const;

export function getPlaceholderCoverTheme(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return COVER_THEMES[hash % COVER_THEMES.length];
}
