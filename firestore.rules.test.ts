/**
 * Payload-First Security TDD Test Suite for Gyaan Ka Sagar Firestore Rules.
 *
 * Verifies all "Dirty Dozen" adversarial payloads are rejected (PERMISSION_DENIED)
 * while valid public catalog reads and owner operations succeed.
 *
 * Run against the Firebase Emulator Suite with:
 *   firebase emulators:exec "npx tsx firestore.rules.test.ts"
 */

export interface DirtyDozenCase {
  id: number;
  name: string;
  actor: 'anonymous' | 'visitor' | 'spoofed_unverified_owner' | 'owner';
  operation: 'create' | 'update' | 'delete' | 'list';
  path: string;
  payload?: Record<string, unknown>;
  expected: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_PAYLOADS: DirtyDozenCase[] = [
  {
    id: 1,
    name: 'Unauthenticated book create',
    actor: 'anonymous',
    operation: 'create',
    path: 'books/test-book-1',
    payload: {
      id: 'test-book-1',
      filename: 'test.pdf',
      title: 'Unauthorized Book',
      author: 'Anon',
      category: 'Other',
      authorNeedsCheck: false,
      hasPdf: false,
      pdfStorageType: 'none',
      aiGenerated: false,
      ownerId: 'anon',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Non-owner authenticated book create',
    actor: 'visitor',
    operation: 'create',
    path: 'books/test-book-2',
    payload: {
      id: 'test-book-2',
      filename: 'test2.pdf',
      title: 'Visitor Book',
      author: 'Visitor',
      category: 'Other',
      authorNeedsCheck: false,
      hasPdf: false,
      pdfStorageType: 'none',
      aiGenerated: false,
      ownerId: 'visitor-uid',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Email spoofing with email_verified=false',
    actor: 'spoofed_unverified_owner',
    operation: 'create',
    path: 'admins/spoof-uid',
    payload: {
      role: 'owner',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Shadow field injection on book create',
    actor: 'owner',
    operation: 'create',
    path: 'books/shadow-book',
    payload: {
      id: 'shadow-book',
      filename: 'shadow.pdf',
      title: 'Shadow Test',
      author: 'Author',
      category: 'Economics',
      authorNeedsCheck: false,
      hasPdf: false,
      pdfStorageType: 'none',
      aiGenerated: false,
      ownerId: 'owner-uid',
      ghostField: true,
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Identity spoofing via mismatched ownerId',
    actor: 'owner',
    operation: 'create',
    path: 'books/spoof-owner-book',
    payload: {
      id: 'spoof-owner-book',
      filename: 'spoof.pdf',
      title: 'Spoof Owner',
      author: 'Author',
      category: 'Economics',
      authorNeedsCheck: false,
      hasPdf: false,
      pdfStorageType: 'none',
      aiGenerated: false,
      ownerId: 'someone-else-uid',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Client timestamp forgery on create',
    actor: 'owner',
    operation: 'create',
    path: 'books/forged-time-book',
    payload: {
      id: 'forged-time-book',
      filename: 'time.pdf',
      title: 'Forged Time',
      author: 'Author',
      category: 'Economics',
      authorNeedsCheck: false,
      hasPdf: false,
      pdfStorageType: 'none',
      aiGenerated: false,
      ownerId: 'owner-uid',
      createdAt: '2020-01-01T00:00:00Z',
      updatedAt: '2020-01-01T00:00:00Z',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Immutable createdAt tampering on update',
    actor: 'owner',
    operation: 'update',
    path: 'books/existing-book',
    payload: {
      createdAt: '2019-01-01T00:00:00Z',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'ID poisoning with invalid characters',
    actor: 'owner',
    operation: 'create',
    path: 'books/bad..id$poison',
    payload: {
      id: 'bad..id$poison',
      filename: 'bad.pdf',
      title: 'Bad ID',
      author: 'Author',
      category: 'Other',
      authorNeedsCheck: false,
      hasPdf: false,
      pdfStorageType: 'none',
      aiGenerated: false,
      ownerId: 'owner-uid',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Value poisoning exceeding maxLength and 100MB cap',
    actor: 'owner',
    operation: 'update',
    path: 'books/existing-book',
    payload: {
      title: 'A'.repeat(400),
      fileSizeBytes: 250 * 1024 * 1024,
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Invalid visibility enum value in settings/library',
    actor: 'owner',
    operation: 'update',
    path: 'settings/library',
    payload: {
      visibility: 'unrestricted',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Listing settings collection',
    actor: 'visitor',
    operation: 'list',
    path: 'settings',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Self-assigned owner role escalation in admins collection',
    actor: 'visitor',
    operation: 'create',
    path: 'admins/visitor-uid',
    payload: {
      role: 'owner',
    },
    expected: 'PERMISSION_DENIED',
  },
];
