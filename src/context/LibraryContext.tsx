import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
} from 'firebase/firestore';
import {
  auth,
  BOOTSTRAPPED_OWNER_EMAIL,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from '../firebase';
import {
  DEFAULT_CATEGORIES,
  type Book,
  type CategoryRecord,
  type LibrarySettings,
  type SeedBookEntry,
  type VisibilityMode,
} from '../types/library';
import { makeSafeId, seedEntryToBook } from '../utils/catalogHelpers';
import {
  docToBook,
  seedCatalogToFirestore,
  updateLibraryVisibilitySetting,
} from '../services/libraryService';

interface LibraryContextValue {
  books: Book[];
  categories: CategoryRecord[];
  settings: LibrarySettings;
  loading: boolean;
  seeding: boolean;
  error: string | null;
  user: User | null;
  authReady: boolean;
  isOwner: boolean;
  canReadPdfs: boolean;
  canDownloadPdfs: boolean;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  setVisibility: (mode: VisibilityMode) => Promise<void>;
  updateLocalBookSummary: (
    bookId: string,
    summary: {
      aboutBook: string;
      whyWorthReading: string;
      aboutAuthor: string;
      aiGenerated: boolean;
      aiGeneratedAt: string;
    }
  ) => void;
}

const LibraryContext = createContext<LibraryContextValue | null>(null);

const FALLBACK_CATEGORIES: CategoryRecord[] = DEFAULT_CATEGORIES.map((name, idx) => ({
  id: makeSafeId(name, 'cat'),
  name,
  order: idx,
  isDefault: true,
}));

export function LibraryProvider({ children }: { children: React.ReactNode }) {
  const [seedEntries, setSeedEntries] = useState<SeedBookEntry[]>([]);
  const [firestoreBooks, setFirestoreBooks] = useState<Book[] | null>(null);
  const [firestoreCategories, setFirestoreCategories] = useState<CategoryRecord[] | null>(null);
  const [settings, setSettings] = useState<LibrarySettings>({
    visibility: 'private',
    seededCatalogCount: 69,
  });
  const [localSummaryCache, setLocalSummaryCache] = useState<
    Record<
      string,
      {
        aboutBook: string;
        whyWorthReading: string;
        aboutAuthor: string;
        aiGenerated: boolean;
        aiGeneratedAt: string;
      }
    >
  >({});

  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seededOnceRef = useRef(false);

  // 1. Load the 69-book catalog seed JSON immediately so visitors always see the full library
  useEffect(() => {
    let cancelled = false;
    fetch('/assets/aistudio/books_catalog_5f313f26.json')
      .then((res) => {
        if (!res.ok) throw new Error('Unable to load initial books catalog.');
        return res.json();
      })
      .then((data: { books?: SeedBookEntry[] }) => {
        if (!cancelled && Array.isArray(data.books)) {
          setSeedEntries(data.books);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('Seed catalog load error:', err);
          setError('Could not load the catalog archive.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 2. Listen to Firebase Authentication and verify owner status
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (!firebaseUser) {
        setIsOwner(false);
        setAuthReady(true);
        return;
      }

      const isBootstrappedOwner =
        firebaseUser.email?.toLowerCase() === BOOTSTRAPPED_OWNER_EMAIL.toLowerCase() &&
        firebaseUser.emailVerified;

      if (isBootstrappedOwner) {
        setIsOwner(true);
        setAuthReady(true);
        return;
      }

      // Check /admins/{uid} for email/password owner accounts registered in Firestore
      try {
        const adminSnap = await getDoc(doc(db, 'admins', firebaseUser.uid));
        setIsOwner(adminSnap.exists());
      } catch {
        setIsOwner(false);
      } finally {
        setAuthReady(true);
      }
    });
    return unsubscribe;
  }, []);

  // 3. Subscribe to public Firestore collections (books, categories, settings/library)
  useEffect(() => {
    const unsubBooks = onSnapshot(
      query(collection(db, 'books')),
      (snapshot) => {
        const parsed = snapshot.docs.map((d) => docToBook(d.data()));
        setFirestoreBooks(parsed);
        setLoading(false);
      },
      (err) => {
        console.error('Books listener error:', err);
        setLoading(false);
        try {
          handleFirestoreError(err, OperationType.LIST, 'books');
        } catch {
          // Gracefully preserve seed fallback view if Firestore is temporarily unreachable
        }
      }
    );

    const unsubCategories = onSnapshot(
      query(collection(db, 'categories')),
      (snapshot) => {
        if (snapshot.empty) {
          setFirestoreCategories(null);
        } else {
          const cats: CategoryRecord[] = snapshot.docs
            .map((d) => {
              const data = d.data();
              return {
                id: String(data.id || d.id),
                name: String(data.name || ''),
                order: typeof data.order === 'number' ? data.order : 99,
                isDefault: Boolean(data.isDefault),
              };
            })
            .sort((a, b) => a.order - b.order);
          setFirestoreCategories(cats);
        }
      },
      (err) => {
        console.warn('Categories listener warning:', err);
      }
    );

    const unsubSettings = onSnapshot(
      doc(db, 'settings', 'library'),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          const vis = data.visibility;
          setSettings({
            visibility: vis === 'public' || vis === 'read_only' || vis === 'private' ? vis : 'private',
            seededCatalogCount:
              typeof data.seededCatalogCount === 'number' ? data.seededCatalogCount : 69,
          });
        }
      },
      (err) => {
        console.warn('Settings listener warning:', err);
      }
    );

    return () => {
      unsubBooks();
      unsubCategories();
      unsubSettings();
    };
  }, []);

  // 4. Automatically seed Firestore with the 69 books when the owner first signs into an empty DB
  useEffect(() => {
    if (
      !authReady ||
      !isOwner ||
      !user ||
      seededOnceRef.current ||
      firestoreBooks === null ||
      firestoreBooks.length > 0 ||
      seedEntries.length === 0
    ) {
      return;
    }

    seededOnceRef.current = true;
    setSeeding(true);
    seedCatalogToFirestore(user.uid, seedEntries)
      .catch((err) => {
        console.error('Auto-seeding Firestore failed:', err);
        seededOnceRef.current = false;
      })
      .finally(() => {
        setSeeding(false);
      });
  }, [authReady, isOwner, user, firestoreBooks, seedEntries]);

  // Compute active books list (live Firestore once seeded, or initial 69 seed entries before first owner login)
  const books = useMemo<Book[]>(() => {
    const baseList =
      firestoreBooks && firestoreBooks.length > 0
        ? firestoreBooks
        : seedEntries.map((entry, idx) => seedEntryToBook(entry, idx, 'seed'));

    return baseList.map((book) => {
      const localSummary = localSummaryCache[book.id];
      if (!book.aboutBook && localSummary) {
        return { ...book, ...localSummary };
      }
      return book;
    });
  }, [firestoreBooks, seedEntries, localSummaryCache]);

  // Compute active categories list (preserving exact 8 core categories + any custom owner categories)
  const categories = useMemo<CategoryRecord[]>(() => {
    const list =
      firestoreCategories && firestoreCategories.length > 0
        ? firestoreCategories
        : FALLBACK_CATEGORIES;
    return list;
  }, [firestoreCategories]);

  const loginWithEmail = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email.trim(), password);
  }, []);

  const loginWithGoogle = useCallback(async () => {
    await signInWithPopup(auth, googleProvider);
  }, []);

  const logout = useCallback(async () => {
    await signOut(auth);
  }, []);

  const setVisibility = useCallback(
    async (mode: VisibilityMode) => {
      if (!user || !isOwner) {
        throw new Error('Only the authenticated owner can change library visibility.');
      }
      await updateLibraryVisibilitySetting(user.uid, mode, seedEntries.length || 69);
    },
    [user, isOwner, seedEntries.length]
  );

  const updateLocalBookSummary = useCallback(
    (
      bookId: string,
      summary: {
        aboutBook: string;
        whyWorthReading: string;
        aboutAuthor: string;
        aiGenerated: boolean;
        aiGeneratedAt: string;
      }
    ) => {
      setLocalSummaryCache((prev) => ({ ...prev, [bookId]: summary }));
    },
    []
  );

  const canReadPdfs = isOwner || settings.visibility === 'public' || settings.visibility === 'read_only';
  const canDownloadPdfs = isOwner || settings.visibility === 'public';

  const value = useMemo<LibraryContextValue>(
    () => ({
      books,
      categories,
      settings,
      loading: loading && books.length === 0,
      seeding,
      error,
      user,
      authReady,
      isOwner,
      canReadPdfs,
      canDownloadPdfs,
      loginWithEmail,
      loginWithGoogle,
      logout,
      setVisibility,
      updateLocalBookSummary,
    }),
    [
      books,
      categories,
      settings,
      loading,
      seeding,
      error,
      user,
      authReady,
      isOwner,
      canReadPdfs,
      canDownloadPdfs,
      loginWithEmail,
      loginWithGoogle,
      logout,
      setVisibility,
      updateLocalBookSummary,
    ]
  );

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary(): LibraryContextValue {
  const ctx = useContext(LibraryContext);
  if (!ctx) {
    throw new Error('useLibrary must be used within a LibraryProvider');
  }
  return ctx;
}
