import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { GoogleGenAI, Type } from '@google/genai';

const PORT = 3000;
const ROOT_DIR = process.cwd();
const DATA_DIR = path.join(ROOT_DIR, 'data');
const PDF_DIR = path.join(DATA_DIR, 'pdfs');
const COVER_DIR = path.join(DATA_DIR, 'covers');
const SUMMARY_CACHE_PATH = path.join(DATA_DIR, 'summaries-cache.json');
const MAX_PDF_BYTES = 100 * 1024 * 1024; // 100 MB
const BOOTSTRAPPED_OWNER_EMAIL = 'saideeppoojari@gmail.com';

// Ensure storage directories exist
fs.mkdirSync(PDF_DIR, { recursive: true });
fs.mkdirSync(COVER_DIR, { recursive: true });

// Load Firebase applet configuration for server-side token & settings verification
interface FirebaseAppletConfig {
  projectId: string;
  apiKey: string;
  firestoreDatabaseId?: string;
}

let firebaseConfig: FirebaseAppletConfig = { projectId: '', apiKey: '' };
try {
  const rawConfig = fs.readFileSync(path.join(ROOT_DIR, 'firebase-applet-config.json'), 'utf8');
  firebaseConfig = JSON.parse(rawConfig);
} catch (err) {
  console.warn('Could not load firebase-applet-config.json on server:', err);
}

// Initialize Gemini API client server-side with required User-Agent header
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

interface CachedSummary {
  aboutBook: string;
  whyWorthReading: string;
  aboutAuthor: string;
  aiGenerated: boolean;
  aiGeneratedAt: string;
  usedExcerpt: boolean;
}

function readSummaryCache(): Record<string, CachedSummary> {
  try {
    if (!fs.existsSync(SUMMARY_CACHE_PATH)) return {};
    return JSON.parse(fs.readFileSync(SUMMARY_CACHE_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function writeSummaryCache(cache: Record<string, CachedSummary>): void {
  fs.writeFileSync(SUMMARY_CACHE_PATH, JSON.stringify(cache, null, 2), 'utf8');
}

function isSafeId(id: string): boolean {
  return /^[a-zA-Z0-9_\-]{1,128}$/.test(id);
}

interface VerifiedUser {
  uid: string;
  email: string;
  emailVerified: boolean;
}

/**
 * Cryptographically verifies a Firebase Auth ID token using Google Identity Toolkit.
 * Works across all Firebase tiers without requiring Admin SDK IAM credentials.
 */
async function verifyFirebaseIdToken(idToken: string): Promise<VerifiedUser | null> {
  if (!idToken || !firebaseConfig.apiKey) return null;
  try {
    const resp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      }
    );
    if (!resp.ok) return null;
    const data = (await resp.json()) as {
      users?: Array<{ localId?: string; email?: string; emailVerified?: boolean }>;
    };
    const user = data.users?.[0];
    if (!user?.localId) return null;
    return {
      uid: user.localId,
      email: user.email ?? '',
      emailVerified: Boolean(user.emailVerified),
    };
  } catch {
    return null;
  }
}

/**
 * Checks whether the verified Firebase user is the library owner.
 */
async function isVerifiedOwner(req: Request): Promise<VerifiedUser | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const idToken = authHeader.slice(7).trim();
  const user = await verifyFirebaseIdToken(idToken);
  if (!user) return null;

  if (
    user.email.toLowerCase() === BOOTSTRAPPED_OWNER_EMAIL.toLowerCase() &&
    user.emailVerified
  ) {
    return user;
  }

  // Fallback check against /admins/{uid} using the caller's own ID token
  try {
    const dbId = firebaseConfig.firestoreDatabaseId || '(default)';
    const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(firebaseConfig.projectId)}/databases/${encodeURIComponent(dbId)}/documents/admins/${encodeURIComponent(user.uid)}`;
    const adminResp = await fetch(url, {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (adminResp.ok) {
      return user;
    }
  } catch {
    // Ignore and deny
  }

  return null;
}

type VisibilityMode = 'private' | 'read_only' | 'public';

/**
 * Reads the authoritative library visibility setting directly from Firestore.
 * Defaults securely to 'private' whenever the setting is absent or unreachable.
 */
async function getAuthoritativeVisibility(): Promise<VisibilityMode> {
  if (!firebaseConfig.projectId) return 'private';
  try {
    const dbId = firebaseConfig.firestoreDatabaseId || '(default)';
    const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(firebaseConfig.projectId)}/databases/${encodeURIComponent(dbId)}/documents/settings/library`;
    const resp = await fetch(url);
    if (!resp.ok) return 'private';
    const docData = (await resp.json()) as {
      fields?: { visibility?: { stringValue?: string } };
    };
    const vis = docData.fields?.visibility?.stringValue;
    if (vis === 'public' || vis === 'read_only' || vis === 'private') {
      return vis;
    }
    return 'private';
  } catch {
    return 'private';
  }
}

// Configure Multer disk storage for PDF uploads (up to 100 MB) and cover images
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, file, cb) => {
      if (file.fieldname === 'cover') {
        cb(null, COVER_DIR);
      } else {
        cb(null, PDF_DIR);
      }
    },
    filename: (req, file, cb) => {
      const bookId = String(req.body?.bookId || req.query?.bookId || '');
      const safeBookId = isSafeId(bookId) ? bookId : `upload-${Date.now()}`;
      if (file.fieldname === 'cover') {
        cb(null, `${safeBookId}.jpg`);
      } else {
        cb(null, `${safeBookId}.pdf`);
      }
    },
  }),
  limits: {
    fileSize: MAX_PDF_BYTES,
    files: 2,
  },
  fileFilter: (_req, file, cb) => {
    if (file.fieldname === 'pdf') {
      const isPdf =
        file.mimetype === 'application/pdf' ||
        file.originalname.toLowerCase().endsWith('.pdf');
      if (!isPdf) {
        cb(new Error('Only PDF files are accepted.'));
        return;
      }
    } else if (file.fieldname === 'cover') {
      if (!file.mimetype.startsWith('image/')) {
        cb(new Error('Cover must be an image file.'));
        return;
      }
    }
    cb(null, true);
  },
});

const EDITORIAL_SYSTEM_INSTRUCTION = `You are a scholarly archivist writing calm, balanced catalog notes for "Gyaan Ka Sagar" ("Ocean of Knowledge"), a personal digital library spanning Indian history, political thought, philosophy, economics, geopolitics, and civilisation.

Follow these editorial rules strictly:
1. Be factual, neutral, and measured. Describe what the book argues using phrasing such as "the author argues…", "the book presents…", or "the work examines…". Never state a contested claim as established fact.
2. Where a book is a polemic, an advocacy work, or widely disputed, say so plainly and note that other scholars take different views. In "whyWorthReading", explain its influence, its place in the historical or political debate, or its value as a primary source, without endorsing or condemning it.
3. Treat all communities, traditions, and religions respectfully; avoid inflammatory or partisan language.
4. If you are unsure about an author's biography—or if the author is marked as UNKNOWN—keep "aboutAuthor" general and candid rather than inventing details. Never fabricate awards, publication dates, university posts, or quotations.
5. Structure:
   - "aboutBook": 3 to 5 clear, scholarly sentences.
   - "whyWorthReading": 3 to 5 sentences explaining who should read it, what the reader gains, and why it matters intellectually or historically.
   - "aboutAuthor": 3 to 4 sentences on the author's background and notable works (or an honest brief note if the author is yet to be verified).`;

async function generateBookNotesWithRetry(params: {
  title: string;
  author: string;
  category: string;
  excerpt?: string;
}): Promise<{ aboutBook: string; whyWorthReading: string; aboutAuthor: string }> {
  const promptParts = [
    `Book Title: ${params.title}`,
    `Author: ${params.author}`,
    `Library Category: ${params.category}`,
  ];
  if (params.excerpt && params.excerpt.trim().length > 40) {
    promptParts.push(
      `Opening pages excerpt from the uploaded PDF (use this to ground the summary accurately):\n"""\n${params.excerpt.slice(0, 5000)}\n"""`
    );
  }
  promptParts.push(
    'Return valid JSON with the three fields: aboutBook, whyWorthReading, and aboutAuthor.'
  );

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: promptParts.join('\n\n'),
        config: {
          systemInstruction: EDITORIAL_SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              aboutBook: {
                type: Type.STRING,
                description: '3 to 5 neutral, scholarly sentences describing the book.',
              },
              whyWorthReading: {
                type: Type.STRING,
                description:
                  '3 to 5 sentences on who should read it, what the reader gains, and its intellectual or historical place.',
              },
              aboutAuthor: {
                type: Type.STRING,
                description: '3 to 4 factual sentences on the author and notable works.',
              },
            },
            required: ['aboutBook', 'whyWorthReading', 'aboutAuthor'],
          },
        },
      });

      const rawText = (response.text ?? '').trim();
      const parsed = JSON.parse(rawText) as {
        aboutBook?: string;
        whyWorthReading?: string;
        aboutAuthor?: string;
      };
      if (!parsed.aboutBook || !parsed.whyWorthReading || !parsed.aboutAuthor) {
        throw new Error('Incomplete summary JSON returned by Gemini.');
      }
      return {
        aboutBook: parsed.aboutBook.trim().slice(0, 2900),
        whyWorthReading: parsed.whyWorthReading.trim().slice(0, 2900),
        aboutAuthor: parsed.aboutAuthor.trim().slice(0, 2900),
      };
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // ── Health check ────────────────────────────────────────────────────────────
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok' });
  });

  // ── Gemini Editorial Summary API (cached so each book is generated once) ───
  app.post('/api/books/summarize', async (req: Request, res: Response) => {
    try {
      const { bookId, title, author, category, excerpt, forceRefresh } = req.body as {
        bookId?: string;
        title?: string;
        author?: string;
        category?: string;
        excerpt?: string;
        forceRefresh?: boolean;
      };

      if (!title || !author) {
        res.status(400).json({ error: 'Book title and author are required.' });
        return;
      }

      const cacheKey = bookId && isSafeId(bookId) ? bookId : `${title}::${author}`;
      const cache = readSummaryCache();
      const existingCached = cache[cacheKey];

      // Only the verified owner may force regeneration
      let allowForce = false;
      if (forceRefresh) {
        const owner = await isVerifiedOwner(req);
        allowForce = Boolean(owner);
      }

      const hasNewExcerpt = Boolean(excerpt && excerpt.trim().length > 40);
      if (existingCached && !allowForce && (!hasNewExcerpt || existingCached.usedExcerpt)) {
        res.json({ ...existingCached, cached: true });
        return;
      }

      if (!process.env.GEMINI_API_KEY) {
        res.status(503).json({
          error: 'GEMINI_API_KEY is not configured in the server environment.',
        });
        return;
      }

      const generated = await generateBookNotesWithRetry({
        title: String(title).slice(0, 300),
        author: String(author).slice(0, 250),
        category: String(category || 'Other').slice(0, 120),
        excerpt: excerpt ? String(excerpt).slice(0, 6000) : undefined,
      });

      const entry: CachedSummary = {
        ...generated,
        aiGenerated: true,
        aiGeneratedAt: new Date().toISOString(),
        usedExcerpt: hasNewExcerpt,
      };

      cache[cacheKey] = entry;
      writeSummaryCache(cache);

      res.json({ ...entry, cached: false });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to generate book summary.';
      console.error('Gemini summarize error:', err);
      res.status(500).json({ error: msg });
    }
  });

  // ── Cached Summary Lookup (for unauthenticated visitors viewing seed books) ─
  app.get('/api/books/summary/:bookId', (req: Request, res: Response) => {
    const { bookId } = req.params;
    if (!isSafeId(bookId)) {
      res.status(400).json({ error: 'Invalid book ID.' });
      return;
    }
    const cache = readSummaryCache();
    if (!cache[bookId]) {
      res.status(404).json({ error: 'Summary not yet generated.' });
      return;
    }
    res.json(cache[bookId]);
  });

  // ── Owner-Only PDF + Cover Upload (supports up to 100 MB) ──────────────────
  app.post(
    '/api/pdfs/upload',
    async (req: Request, res: Response, next) => {
      const owner = await isVerifiedOwner(req);
      if (!owner) {
        res.status(403).json({ error: 'Owner authentication is required to upload PDFs.' });
        return;
      }
      next();
    },
    upload.fields([
      { name: 'pdf', maxCount: 1 },
      { name: 'cover', maxCount: 1 },
    ]),
    (req: Request, res: Response) => {
      const files = req.files as Record<string, Express.Multer.File[]> | undefined;
      const pdfFile = files?.pdf?.[0];
      const coverFile = files?.cover?.[0];
      const bookId = String(req.body?.bookId || '');

      if (!isSafeId(bookId)) {
        res.status(400).json({ error: 'A valid bookId is required.' });
        return;
      }

      if (!pdfFile) {
        res.status(400).json({ error: 'PDF file is required.' });
        return;
      }

      // Ensure final files are cleanly named <bookId>.pdf / <bookId>.jpg
      const targetPdfPath = path.join(PDF_DIR, `${bookId}.pdf`);
      if (pdfFile.path !== targetPdfPath) {
        fs.renameSync(pdfFile.path, targetPdfPath);
      }

      let coverUrl = '';
      if (coverFile) {
        const targetCoverPath = path.join(COVER_DIR, `${bookId}.jpg`);
        if (coverFile.path !== targetCoverPath) {
          fs.renameSync(coverFile.path, targetCoverPath);
        }
        coverUrl = `/api/covers/${bookId}?v=${Date.now()}`;
      }

      res.json({
        bookId,
        pdfStorageType: 'vault',
        pdfStoragePath: `vault/${bookId}.pdf`,
        coverUrl,
        fileSizeBytes: pdfFile.size,
      });
    }
  );

  // ── Owner-Only Cover Thumbnail Upload (when PDF is stored in Firebase Storage)
  app.post(
    '/api/covers/upload',
    async (req: Request, res: Response, next) => {
      const owner = await isVerifiedOwner(req);
      if (!owner) {
        res.status(403).json({ error: 'Owner authentication required.' });
        return;
      }
      next();
    },
    upload.single('cover'),
    (req: Request, res: Response) => {
      const bookId = String(req.body?.bookId || '');
      if (!isSafeId(bookId) || !req.file) {
        res.status(400).json({ error: 'Valid bookId and cover image required.' });
        return;
      }
      const targetCoverPath = path.join(COVER_DIR, `${bookId}.jpg`);
      if (req.file.path !== targetCoverPath) {
        fs.renameSync(req.file.path, targetCoverPath);
      }
      res.json({ coverUrl: `/api/covers/${bookId}?v=${Date.now()}` });
    }
  );

  // ── Public Book Cover Thumbnail (allowed in all visibility modes) ──────────
  app.get('/api/covers/:bookId', (req: Request, res: Response) => {
    const { bookId } = req.params;
    if (!isSafeId(bookId)) {
      res.status(400).end();
      return;
    }
    const coverPath = path.join(COVER_DIR, `${bookId}.jpg`);
    if (!fs.existsSync(coverPath)) {
      res.status(404).end();
      return;
    }
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    fs.createReadStream(coverPath).pipe(res);
  });

  // ── Visibility-Enforced PDF Inline Stream (for PDF.js Reader) ──────────────
  app.get('/api/pdfs/:bookId', async (req: Request, res: Response) => {
    const { bookId } = req.params;
    if (!isSafeId(bookId)) {
      res.status(400).json({ error: 'Invalid book identifier.' });
      return;
    }

    const visibility = await getAuthoritativeVisibility();
    const owner = await isVerifiedOwner(req);

    if (visibility === 'private' && !owner) {
      res.status(403).json({
        error: 'This library is currently set to Private. Only the owner may read PDFs.',
        visibility,
      });
      return;
    }

    const pdfPath = path.join(PDF_DIR, `${bookId}.pdf`);
    if (!fs.existsSync(pdfPath)) {
      res.status(404).json({ error: 'PDF file not found on server.' });
      return;
    }

    const stat = fs.statSync(pdfPath);
    const range = req.headers.range;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'private, no-store');

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      if (isNaN(start) || isNaN(end) || start >= stat.size || end >= stat.size) {
        res.status(416).setHeader('Content-Range', `bytes */${stat.size}`).end();
        return;
      }
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
      res.setHeader('Content-Length', String(end - start + 1));
      fs.createReadStream(pdfPath, { start, end }).pipe(res);
    } else {
      res.setHeader('Content-Length', String(stat.size));
      fs.createReadStream(pdfPath).pipe(res);
    }
  });

  // ── Visibility-Enforced PDF Download Endpoint ──────────────────────────────
  app.get('/api/pdfs/:bookId/download', async (req: Request, res: Response) => {
    const { bookId } = req.params;
    if (!isSafeId(bookId)) {
      res.status(400).json({ error: 'Invalid book identifier.' });
      return;
    }

    const visibility = await getAuthoritativeVisibility();
    const owner = await isVerifiedOwner(req);

    if (visibility !== 'public' && !owner) {
      res.status(403).json({
        error:
          visibility === 'read_only'
            ? 'Downloads are disabled while the library is in Read Online Only mode.'
            : 'This library is currently set to Private.',
        visibility,
      });
      return;
    }

    const pdfPath = path.join(PDF_DIR, `${bookId}.pdf`);
    if (!fs.existsSync(pdfPath)) {
      res.status(404).json({ error: 'PDF file not found on server.' });
      return;
    }

    const requestedName = String(req.query.filename || `${bookId}.pdf`)
      .replace(/[^\w.\-\s()]/g, '')
      .trim() || `${bookId}.pdf`;
    const downloadName = requestedName.toLowerCase().endsWith('.pdf')
      ? requestedName
      : `${requestedName}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    fs.createReadStream(pdfPath).pipe(res);
  });

  // ── Owner-Only PDF & Cover Delete ──────────────────────────────────────────
  app.delete('/api/pdfs/:bookId', async (req: Request, res: Response) => {
    const owner = await isVerifiedOwner(req);
    if (!owner) {
      res.status(403).json({ error: 'Owner authentication required.' });
      return;
    }
    const { bookId } = req.params;
    if (!isSafeId(bookId)) {
      res.status(400).json({ error: 'Invalid book identifier.' });
      return;
    }
    const pdfPath = path.join(PDF_DIR, `${bookId}.pdf`);
    const coverPath = path.join(COVER_DIR, `${bookId}.jpg`);
    if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
    if (fs.existsSync(coverPath)) fs.unlinkSync(coverPath);
    res.json({ deleted: true });
  });

  // Multer & API error handler
  app.use((err: unknown, _req: Request, res: Response, _next: express.NextFunction) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({ error: 'File exceeds the 100 MB maximum limit.' });
        return;
      }
      res.status(400).json({ error: err.message });
      return;
    }
    if (err instanceof Error) {
      res.status(400).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: 'Internal server error.' });
  });

  // ── Frontend Mounting (Vite middleware in dev, static dist in prod) ────────
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(ROOT_DIR, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Gyaan Ka Sagar running at http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Gyaan Ka Sagar server:', err);
  process.exit(1);
});
