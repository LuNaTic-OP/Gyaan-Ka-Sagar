# Security Specification — Gyaan Ka Sagar

## 1. Data Invariants
1. **Public Catalog Read, Owner-Only Write**: Book metadata (`/books/{bookId}`), categories (`/categories/{categoryId}`), and the non-PII visibility mode (`/settings/library`) are publicly readable so visitors can browse the catalog, covers, and editorial summaries. All write/create/update/delete operations are strictly restricted to the authenticated owner.
2. **Zero PII Exposure**: No email addresses, phone numbers, or personal credentials are stored in `/books`, `/categories`, `/settings`, or `/admins`.
3. **Immutable Ownership & Creation Timestamps**: Once created, `ownerId` and `createdAt` can never be mutated. All timestamps (`createdAt`, `updatedAt`) must equal server `request.time`.
4. **Strict Schema & Volumetric Bounds**: Every string field enforces exact `maxLength` bounds matching `firebase-blueprint.json`, `fileSizeBytes` is capped at 104,857,600 bytes (100 MB), and document IDs match `^[a-zA-Z0-9_\-]+$` (max 128 chars).
5. **Email Spoofing Prevention**: Bootstrapped email ownership strictly requires `request.auth.token.email_verified == true`.
6. **PDF Visibility Enforcement**: Library visibility defaults to `private`. Both `storage.rules` and server-side `/api/pdfs/*` routes enforce `private`, `read_only`, and `public` independently of client UI buttons.

## 2. The "Dirty Dozen" Payloads (All Must Return PERMISSION_DENIED)
1. **Unauthenticated Book Create**: Anonymous visitor attempts `setDoc(/books/book-1, validPayload)`.
2. **Non-Owner Authenticated Book Create**: Signed-in non-owner user attempts `setDoc(/books/book-2, validPayload)`.
3. **Email Spoof Attack**: User with `email: 'saideeppoojari@gmail.com'` and `email_verified: false` attempts to create a book or register in `/admins`.
4. **Shadow Field Injection (Book)**: Owner sends valid book payload plus undocumented ghost key `{ isFeaturedAdmin: true }`.
5. **Identity Spoofing on Create**: Owner attempts to create a book with `ownerId: 'different-uid'`.
6. **Timestamp Forgery**: Owner sends a client-fabricated `createdAt` or `updatedAt` instead of `serverTimestamp()`.
7. **Immutable Field Tampering**: Owner attempts to modify `createdAt` or `ownerId` on an existing book update.
8. **ID Poisoning**: Owner attempts to create `/books/bad..id$with%chars` or a 200-character document ID.
9. **Resource Exhaustion / Value Poisoning**: Owner attempts to update `title` with a 5,000-character string or `fileSizeBytes: 500000000` (> 100 MB).
10. **Invalid Visibility Enum**: Owner attempts to write `/settings/library` with `{ visibility: 'open_all' }`.
11. **Settings Collection Enumeration / Arbitrary Doc**: Visitor or owner attempts to `list` `/settings` or create `/settings/secret`.
12. **Self-Assigned Admin Escalation**: Non-owner user attempts to create `/admins/{theirUid}` with `{ role: 'owner' }`.
