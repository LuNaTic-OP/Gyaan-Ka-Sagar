import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type DocumentData,
  type Timestamp,
} from 'firebase/firestore';
import {
  deleteObject,
  getDownloadURL,
  ref as storageRef,
  uploadBytes,
  uploadBytesResumable,
} from 'firebase/storage';
import {
  auth,
  db,
  handleFirestoreError,
  OperationType,
  storage,
} from '../firebase';
import {
  DEFAULT_CATEGORIES,
  MAX_PDF_SIZE_BYTES,
  type Book,
  type CategoryRecord,
  type PdfStorageType,
  type SeedBookEntry,
  type VisibilityMode,
} from '../types/library';
import { extractSeriesInfo, makeSafeId, seedEntryToBook } from '../utils/catalogHelpers';
import { inspectPdfFile } from '../utils/pdfUtils';

function timestampToMs(ts: unknown): number {
  if (ts && typeof ts === 'object' && 'toMillis' in ts && typeof (ts as Timestamp).toMillis === 'function') {
    return (ts as Timestamp).toMillis();
  }
  return Date.now();
}

export function docToBook(data: DocumentData): Book {
  return {
    id: String(data.id || ''),
    filename: String(data.filename || ''),
    title: String(data.title || ''),
    author: String(data.author || ''),
    category: String(data.category || 'Other'),
    authorNeedsCheck: Boolean(data.authorNeedsCheck),
    seriesName: typeof data.seriesName === 'string' && data.seriesName ? data.seriesName : undefined,
    volumeNumber: typeof data.volumeNumber === 'number' ? data.volumeNumber : 0,
    hasPdf: Boolean(data.hasPdf),
    pdfStorageType: (data.pdfStorageType as PdfStorageType) || 'none',
    pdfStoragePath: typeof data.pdfStoragePath === 'string' ? data.pdfStoragePath : undefined,
    pdfUrl: typeof data.pdfUrl === 'string' ? data.pdfUrl : undefined,
    coverUrl: typeof data.coverUrl === 'string' ? data.coverUrl : undefined,
    pageCount: typeof data.pageCount === 'number' ? data.pageCount : undefined,
    fileSizeBytes: typeof data.fileSizeBytes === 'number' ? data.fileSizeBytes : undefined,
    extractedPreviewText:
      typeof data.extractedPreviewText === 'string' ? data.extractedPreviewText : undefined,
    aboutBook: typeof data.aboutBook === 'string' ? data.aboutBook : undefined,
    whyWorthReading: typeof data.whyWorthReading === 'string' ? data.whyWorthReading : undefined,
    aboutAuthor: typeof data.aboutAuthor === 'string' ? data.aboutAuthor : undefined,
    aiGenerated: Boolean(data.aiGenerated),
    aiGeneratedAt: typeof data.aiGeneratedAt === 'string' ? data.aiGeneratedAt : undefined,
    ownerId: String(data.ownerId || ''),
    createdAtMs: timestampToMs(data.createdAt),
    updatedAtMs: timestampToMs(data.updatedAt),
  };
}

/**
 * Strips undefined keys and enforces exact blueprint maxLength & volumetric boundaries
 * before sending any payload to Firestore.
 */
function buildValidatedBookCreatePayload(book: {
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
}): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    id: book.id.slice(0, 128),
    filename: book.filename.trim().slice(0, 300) || `${book.id}.pdf`,
    title: book.title.trim().slice(0, 300) || 'Untitled',
    author: book.author.trim().slice(0, 250) || 'Unknown',
    category: book.category.trim().slice(0, 120) || 'Other',
    authorNeedsCheck: Boolean(book.authorNeedsCheck),
    hasPdf: Boolean(book.hasPdf),
    pdfStorageType: book.pdfStorageType,
    aiGenerated: Boolean(book.aiGenerated),
    ownerId: book.ownerId.slice(0, 128),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (book.seriesName && book.seriesName.trim()) {
    payload.seriesName = book.seriesName.trim().slice(0, 200);
  }
  if (typeof book.volumeNumber === 'number' && book.volumeNumber >= 0) {
    payload.volumeNumber = Math.min(500, Math.max(0, Math.round(book.volumeNumber)));
  }
  if (book.pdfStoragePath) payload.pdfStoragePath = book.pdfStoragePath.slice(0, 500);
  if (book.pdfUrl) payload.pdfUrl = book.pdfUrl.slice(0, 1000);
  if (book.coverUrl) payload.coverUrl = book.coverUrl.slice(0, 1000);
  if (typeof book.pageCount === 'number' && book.pageCount >= 0) {
    payload.pageCount = Math.min(50000, Math.max(0, Math.round(book.pageCount)));
  }
  if (typeof book.fileSizeBytes === 'number' && book.fileSizeBytes >= 0) {
    payload.fileSizeBytes = Math.min(MAX_PDF_SIZE_BYTES, Math.max(0, Math.round(book.fileSizeBytes)));
  }
  if (book.extractedPreviewText) {
    payload.extractedPreviewText = book.extractedPreviewText.slice(0, 8000);
  }
  if (book.aboutBook) payload.aboutBook = book.aboutBook.slice(0, 3000);
  if (book.whyWorthReading) payload.whyWorthReading = book.whyWorthReading.slice(0, 3000);
  if (book.aboutAuthor) payload.aboutAuthor = book.aboutAuthor.slice(0, 3000);
  if (book.aiGeneratedAt) payload.aiGeneratedAt = book.aiGeneratedAt.slice(0, 40);

  return payload;
}

/**
 * Seeds the 69 catalog entries, 8 default categories, and default 'private' library settings
 * into Firestore when the owner first signs in.
 */
export async function seedCatalogToFirestore(
  ownerUid: string,
  seedEntries: SeedBookEntry[]
): Promise<void> {
  // Ensure default settings document exists (defaults to 'private')
  const settingsRef = doc(db, 'settings', 'library');
  try {
    const settingsSnap = await getDoc(settingsRef);
    if (!settingsSnap.exists()) {
      await setDoc(settingsRef, {
        visibility: 'private',
        seededCatalogCount: seedEntries.length,
        ownerId: ownerUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'settings/library');
  }

  // Ensure default 8 categories exist
  try {
    const catBatch = writeBatch(db);
    DEFAULT_CATEGORIES.forEach((name, idx) => {
      const catId = makeSafeId(name, 'cat');
      const catRef = doc(db, 'categories', catId);
      catBatch.set(
        catRef,
        {
          id: catId,
          name: name.slice(0, 120),
          order: idx,
          isDefault: true,
          ownerId: ownerUid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: false }
      );
    });
    await catBatch.commit();
  } catch (err) {
    // Categories may already exist; ignore duplicate create conflict cleanly
    console.warn('Category seed note:', err);
  }

  // Seed books in chunks of 25
  const chunkSize = 25;
  for (let i = 0; i < seedEntries.length; i += chunkSize) {
    const slice = seedEntries.slice(i, i + chunkSize);
    const batch = writeBatch(db);
    for (let j = 0; j < slice.length; j++) {
      const book = seedEntryToBook(slice[j], i + j, ownerUid);
      const bookRef = doc(db, 'books', book.id);
      batch.set(bookRef, buildValidatedBookCreatePayload(book));
    }
    try {
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'books');
    }
  }
}

export async function createBookRecord(
  ownerUid: string,
  input: {
    id?: string;
    filename: string;
    title: string;
    author: string;
    category: string;
    authorNeedsCheck?: boolean;
    hasPdf?: boolean;
    pdfStorageType?: PdfStorageType;
    pdfStoragePath?: string;
    pdfUrl?: string;
    coverUrl?: string;
    pageCount?: number;
    fileSizeBytes?: number;
    extractedPreviewText?: string;
    aboutBook?: string;
    whyWorthReading?: string;
    aboutAuthor?: string;
    aiGenerated?: boolean;
    aiGeneratedAt?: string;
  }
): Promise<string> {
  const id = input.id || makeSafeId(`${input.filename}-${Date.now()}`, 'book');
  const { seriesName, volumeNumber } = extractSeriesInfo(input.title);
  const payload = buildValidatedBookCreatePayload({
    id,
    filename: input.filename,
    title: input.title,
    author: input.author,
    category: input.category,
    authorNeedsCheck: Boolean(input.authorNeedsCheck),
    seriesName: seriesName || undefined,
    volumeNumber,
    hasPdf: Boolean(input.hasPdf),
    pdfStorageType: input.pdfStorageType || 'none',
    pdfStoragePath: input.pdfStoragePath,
    pdfUrl: input.pdfUrl,
    coverUrl: input.coverUrl,
    pageCount: input.pageCount,
    fileSizeBytes: input.fileSizeBytes,
    extractedPreviewText: input.extractedPreviewText,
    aboutBook: input.aboutBook,
    whyWorthReading: input.whyWorthReading,
    aboutAuthor: input.aboutAuthor,
    aiGenerated: Boolean(input.aiGenerated),
    aiGeneratedAt: input.aiGeneratedAt,
    ownerId: ownerUid,
  });

  try {
    await setDoc(doc(db, 'books', id), payload);
    return id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `books/${id}`);
  }
}

export async function updateBookRecord(
  bookId: string,
  updates: Partial<{
    filename: string;
    title: string;
    author: string;
    category: string;
    authorNeedsCheck: boolean;
    seriesName: string;
    volumeNumber: number;
    hasPdf: boolean;
    pdfStorageType: PdfStorageType;
    pdfStoragePath: string;
    pdfUrl: string;
    coverUrl: string;
    pageCount: number;
    fileSizeBytes: number;
    extractedPreviewText: string;
    aboutBook: string;
    whyWorthReading: string;
    aboutAuthor: string;
    aiGenerated: boolean;
    aiGeneratedAt: string;
  }>
): Promise<void> {
  const clean: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };

  if (typeof updates.filename === 'string') clean.filename = updates.filename.trim().slice(0, 300);
  if (typeof updates.title === 'string') {
    const trimmed = updates.title.trim().slice(0, 300);
    clean.title = trimmed;
    const { seriesName, volumeNumber } = extractSeriesInfo(trimmed);
    clean.seriesName = seriesName.slice(0, 200);
    clean.volumeNumber = volumeNumber;
  }
  if (typeof updates.author === 'string') clean.author = updates.author.trim().slice(0, 250);
  if (typeof updates.category === 'string') clean.category = updates.category.trim().slice(0, 120);
  if (typeof updates.authorNeedsCheck === 'boolean') clean.authorNeedsCheck = updates.authorNeedsCheck;
  if (typeof updates.hasPdf === 'boolean') clean.hasPdf = updates.hasPdf;
  if (updates.pdfStorageType) clean.pdfStorageType = updates.pdfStorageType;
  if (typeof updates.pdfStoragePath === 'string') clean.pdfStoragePath = updates.pdfStoragePath.slice(0, 500);
  if (typeof updates.pdfUrl === 'string') clean.pdfUrl = updates.pdfUrl.slice(0, 1000);
  if (typeof updates.coverUrl === 'string') clean.coverUrl = updates.coverUrl.slice(0, 1000);
  if (typeof updates.pageCount === 'number') {
    clean.pageCount = Math.min(50000, Math.max(0, Math.round(updates.pageCount)));
  }
  if (typeof updates.fileSizeBytes === 'number') {
    clean.fileSizeBytes = Math.min(MAX_PDF_SIZE_BYTES, Math.max(0, Math.round(updates.fileSizeBytes)));
  }
  if (typeof updates.extractedPreviewText === 'string') {
    clean.extractedPreviewText = updates.extractedPreviewText.slice(0, 8000);
  }
  if (typeof updates.aboutBook === 'string') clean.aboutBook = updates.aboutBook.slice(0, 3000);
  if (typeof updates.whyWorthReading === 'string') clean.whyWorthReading = updates.whyWorthReading.slice(0, 3000);
  if (typeof updates.aboutAuthor === 'string') clean.aboutAuthor = updates.aboutAuthor.slice(0, 3000);
  if (typeof updates.aiGenerated === 'boolean') clean.aiGenerated = updates.aiGenerated;
  if (typeof updates.aiGeneratedAt === 'string') clean.aiGeneratedAt = updates.aiGeneratedAt.slice(0, 40);

  try {
    await updateDoc(doc(db, 'books', bookId), clean);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `books/${bookId}`);
  }
}

export async function deleteBookRecord(book: Book): Promise<void> {
  // Remove stored PDF file if present
  if (book.hasPdf) {
    if (book.pdfStorageType === 'firebase' && book.pdfStoragePath) {
      try {
        await deleteObject(storageRef(storage, book.pdfStoragePath));
      } catch (err) {
        console.warn('Could not delete Firebase Storage PDF:', err);
      }
    }
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (idToken) {
        await fetch(`/api/pdfs/${encodeURIComponent(book.id)}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${idToken}` },
        });
      }
    } catch (err) {
      console.warn('Could not delete vault PDF/cover:', err);
    }
  }

  try {
    await deleteDoc(doc(db, 'books', book.id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `books/${book.id}`);
  }
}

export async function createCategoryRecord(
  ownerUid: string,
  name: string,
  existingCategories: CategoryRecord[]
): Promise<CategoryRecord> {
  const trimmed = name.trim().slice(0, 120);
  const id = makeSafeId(trimmed, 'cat');
  const nextOrder =
    existingCategories.reduce((max, c) => Math.max(max, c.order), 0) + 1;

  try {
    await setDoc(doc(db, 'categories', id), {
      id,
      name: trimmed,
      order: Math.min(1000, nextOrder),
      isDefault: false,
      ownerId: ownerUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return { id, name: trimmed, order: nextOrder, isDefault: false };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `categories/${id}`);
  }
}

export async function updateLibraryVisibilitySetting(
  ownerUid: string,
  visibility: VisibilityMode,
  seededCatalogCount: number
): Promise<void> {
  const ref = doc(db, 'settings', 'library');
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, {
        visibility,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        visibility,
        seededCatalogCount,
        ownerId: ownerUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'settings/library');
  }
}

export interface UploadedPdfResult {
  pdfStorageType: PdfStorageType;
  pdfStoragePath: string;
  pdfUrl?: string;
  coverUrl?: string;
  pageCount: number;
  fileSizeBytes: number;
  extractedPreviewText: string;
}

/**
 * Uploads a PDF to the server-side Visibility-Enforced PDF Vault with XHR progress reporting.
 */
async function uploadToServerVault(
  file: File,
  bookId: string,
  coverBlob: Blob | null,
  onProgress: (percent: number) => void
): Promise<{ pdfStoragePath: string; coverUrl?: string }> {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) {
    throw new Error('Owner authentication required to upload PDFs.');
  }

  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('bookId', bookId);
    formData.append('pdf', file, file.name);
    if (coverBlob) {
      formData.append('cover', coverBlob, `${bookId}.jpg`);
    }

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/pdfs/upload?bookId=${encodeURIComponent(bookId)}`, true);
    xhr.setRequestHeader('Authorization', `Bearer ${idToken}`);

    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable) {
        const pct = Math.min(99, Math.round(15 + (evt.loaded / evt.total) * 84));
        onProgress(pct);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText) as {
            pdfStoragePath: string;
            coverUrl?: string;
          };
          onProgress(100);
          resolve(data);
        } catch {
          reject(new Error('Invalid upload response from server.'));
        }
      } else {
        try {
          const errData = JSON.parse(xhr.responseText) as { error?: string };
          reject(new Error(errData.error || `Upload failed (${xhr.status}).`));
        } catch {
          reject(new Error(`Upload failed (${xhr.status}).`));
        }
      }
    };

    xhr.onerror = () => reject(new Error('Network error during PDF upload.'));
    xhr.send(formData);
  });
}

/**
 * Attempts Firebase Storage upload first (when configured and enabled on the Firebase project),
 * falling back seamlessly to the Firebase-Auth-verified Server Vault if Firebase Storage
 * is not yet initialized in Firebase Console.
 */
async function tryFirebaseStorageUpload(
  file: File,
  bookId: string,
  coverBlob: Blob | null,
  onProgress: (percent: number) => void
): Promise<{ pdfStoragePath: string; pdfUrl: string; coverUrl?: string } | null> {
  const safeName = file.name.replace(/[^\w.\-\s()]/g, '_').slice(0, 180);
  const pdfPath = `books/${bookId}/${safeName}`;
  const pdfRef = storageRef(storage, pdfPath);

  return new Promise((resolve) => {
    let settled = false;
    const task = uploadBytesResumable(pdfRef, file, {
      contentType: 'application/pdf',
    });

    // If Firebase Storage bucket isn't initialized, abort quickly and fall back smoothly
    const stallTimer = window.setTimeout(() => {
      if (!settled && task.snapshot.bytesTransferred === 0) {
        settled = true;
        task.cancel();
        resolve(null);
      }
    }, 3500);

    task.on(
      'state_changed',
      (snap) => {
        if (snap.bytesTransferred > 0) {
          window.clearTimeout(stallTimer);
          const pct = Math.min(95, Math.round(15 + (snap.bytesTransferred / snap.totalBytes) * 80));
          onProgress(pct);
        }
      },
      () => {
        window.clearTimeout(stallTimer);
        if (!settled) {
          settled = true;
          resolve(null);
        }
      },
      async () => {
        window.clearTimeout(stallTimer);
        if (settled) return;
        settled = true;
        try {
          const pdfUrl = await getDownloadURL(task.snapshot.ref);
          let coverUrl: string | undefined;
          if (coverBlob) {
            try {
              const coverRef = storageRef(storage, `covers/${bookId}/cover.jpg`);
              await uploadBytes(coverRef, coverBlob, { contentType: 'image/jpeg' });
              coverUrl = await getDownloadURL(coverRef);
            } catch {
              // Store cover thumbnail via server fallback
              const idToken = await auth.currentUser?.getIdToken();
              if (idToken) {
                const fd = new FormData();
                fd.append('bookId', bookId);
                fd.append('cover', coverBlob, `${bookId}.jpg`);
                const resp = await fetch(`/api/covers/upload?bookId=${encodeURIComponent(bookId)}`, {
                  method: 'POST',
                  headers: { Authorization: `Bearer ${idToken}` },
                  body: fd,
                });
                if (resp.ok) {
                  const data = (await resp.json()) as { coverUrl?: string };
                  coverUrl = data.coverUrl;
                }
              }
            }
          }
          onProgress(100);
          resolve({ pdfStoragePath: pdfPath, pdfUrl, coverUrl });
        } catch {
          resolve(null);
        }
      }
    );
  });
}

/**
 * End-to-end PDF upload pipeline:
 * 1. Validates size (<= 100 MB) and PDF format
 * 2. Uses PDF.js to render first-page cover thumbnail, count pages, and extract opening text
 * 3. Uploads to Firebase Storage (if enabled) or seamlessly to the authenticated Server PDF Vault
 */
export async function uploadPdfFileWithInspection(
  file: File,
  bookId: string,
  onProgress: (percent: number) => void
): Promise<UploadedPdfResult> {
  if (file.size > MAX_PDF_SIZE_BYTES) {
    throw new Error('File exceeds the 100 MB maximum upload size.');
  }
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    throw new Error('Only PDF documents are supported.');
  }

  onProgress(5);
  const inspected = await inspectPdfFile(file);
  onProgress(15);

  // Try Firebase Storage first; automatically fall back to Visibility-Enforced Server Vault
  const firebaseResult = await tryFirebaseStorageUpload(
    file,
    bookId,
    inspected.coverBlob,
    onProgress
  );

  if (firebaseResult) {
    return {
      pdfStorageType: 'firebase',
      pdfStoragePath: firebaseResult.pdfStoragePath,
      pdfUrl: firebaseResult.pdfUrl,
      coverUrl: firebaseResult.coverUrl,
      pageCount: inspected.pageCount,
      fileSizeBytes: file.size,
      extractedPreviewText: inspected.extractedPreviewText,
    };
  }

  const vaultResult = await uploadToServerVault(
    file,
    bookId,
    inspected.coverBlob,
    onProgress
  );

  return {
    pdfStorageType: 'vault',
    pdfStoragePath: vaultResult.pdfStoragePath,
    coverUrl: vaultResult.coverUrl,
    pageCount: inspected.pageCount,
    fileSizeBytes: file.size,
    extractedPreviewText: inspected.extractedPreviewText,
  };
}

export interface BookSummaryResponse {
  aboutBook: string;
  whyWorthReading: string;
  aboutAuthor: string;
  aiGenerated: boolean;
  aiGeneratedAt: string;
  cached?: boolean;
}

/**
 * Generates (or retrieves cached) scholarly notes via server-side Gemini API.
 * When called by the authenticated owner, also caches the result into Firestore.
 */
export async function fetchOrGenerateBookSummary(
  book: Pick<Book, 'id' | 'title' | 'author' | 'category' | 'extractedPreviewText' | 'isSeedFallback'>,
  options: { forceRefresh?: boolean; persistToFirestore?: boolean } = {}
): Promise<BookSummaryResponse> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const idToken = await auth.currentUser?.getIdToken().catch(() => undefined);
  if (idToken) {
    headers.Authorization = `Bearer ${idToken}`;
  }

  const resp = await fetch('/api/books/summarize', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      bookId: book.id,
      title: book.title,
      author: book.author,
      category: book.category,
      excerpt: book.extractedPreviewText || '',
      forceRefresh: Boolean(options.forceRefresh),
    }),
  });

  if (!resp.ok) {
    const errBody = (await resp.json().catch(() => ({}))) as { error?: string };
    throw new Error(errBody.error || 'Could not generate editorial summary.');
  }

  const data = (await resp.json()) as BookSummaryResponse;

  if (options.persistToFirestore && !book.isSeedFallback && auth.currentUser) {
    try {
      await updateBookRecord(book.id, {
        aboutBook: data.aboutBook,
        whyWorthReading: data.whyWorthReading,
        aboutAuthor: data.aboutAuthor,
        aiGenerated: true,
        aiGeneratedAt: data.aiGeneratedAt,
      });
    } catch (err) {
      console.warn('Could not persist AI summary to Firestore:', err);
    }
  }

  return data;
}

/**
 * Fetches PDF binary data for the in-page PDF.js viewer while honoring visibility rules.
 */
export async function fetchPdfBytesForViewer(book: Book): Promise<ArrayBuffer> {
  if (book.pdfStorageType === 'firebase' && book.pdfUrl) {
    const resp = await fetch(book.pdfUrl);
    if (!resp.ok) {
      throw new Error('Access to this PDF is restricted under the current library visibility setting.');
    }
    return resp.arrayBuffer();
  }

  const headers: Record<string, string> = {};
  const idToken = await auth.currentUser?.getIdToken().catch(() => undefined);
  if (idToken) {
    headers.Authorization = `Bearer ${idToken}`;
  }

  const resp = await fetch(`/api/pdfs/${encodeURIComponent(book.id)}`, { headers });
  if (!resp.ok) {
    const errBody = (await resp.json().catch(() => ({}))) as { error?: string };
    throw new Error(
      errBody.error || 'This PDF cannot be opened under the current library visibility setting.'
    );
  }
  return resp.arrayBuffer();
}

/**
 * Triggers a browser download of the PDF while honoring server-enforced visibility rules.
 */
export async function downloadBookPdfFile(book: Book): Promise<void> {
  let blob: Blob;

  if (book.pdfStorageType === 'firebase' && book.pdfUrl) {
    const resp = await fetch(book.pdfUrl);
    if (!resp.ok) {
      throw new Error('Download is not permitted under the current visibility setting.');
    }
    blob = await resp.blob();
  } else {
    const headers: Record<string, string> = {};
    const idToken = await auth.currentUser?.getIdToken().catch(() => undefined);
    if (idToken) {
      headers.Authorization = `Bearer ${idToken}`;
    }
    const resp = await fetch(
      `/api/pdfs/${encodeURIComponent(book.id)}/download?filename=${encodeURIComponent(book.filename)}`,
      { headers }
    );
    if (!resp.ok) {
      const errBody = (await resp.json().catch(() => ({}))) as { error?: string };
      throw new Error(
        errBody.error || 'Download is disabled under the current library visibility setting.'
      );
    }
    blob = await resp.blob();
  }

  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = book.filename.toLowerCase().endsWith('.pdf')
    ? book.filename
    : `${book.title}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
}
