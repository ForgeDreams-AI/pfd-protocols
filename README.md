# PFD Protocols

Private, searchable Phoenix Fire Department EMS protocol reference for paramedics.
Mobile-first, built for use on scene.

**Privacy architecture (read this before touching anything):**
- This repo's public bundle contains ONLY the sign-in page. There is deliberately
  **zero protocol content** in this repository — no JSON, no text, nothing to leak.
- All protocol/drug content lives in Cloud Firestore and is served only to
  signed-in users whose email is on the admin-managed allowlist (`firestore.rules`
  enforces this server-side).
- The seed data (`protocols.json`) and service-account key live ONLY on the
  maintainer's machine, never in git (see `.gitignore`).

## Setup (one-time, ~15 minutes)

Full click-by-click instructions: [`FIREBASE_SETUP.md`](FIREBASE_SETUP.md).

1. Create a Firebase project (console.firebase.google.com) in your Google account.
2. Add a Web app → copy the config into `firebase-config.js`.
3. Enable **Authentication → Email/Password** sign-in method.
4. Create **Firestore Database** (production mode).
5. Deploy `firestore.rules` (Firebase console → Firestore → Rules, paste, Publish).
6. Create your first user: Authentication → Users → Add user (your email + a password).
7. Firestore → `allowlist` collection → Add document: document ID = your email
   lowercased (e.g. `anthony.hidalgo2@phoenix.gov`), fields: `email` (string, same),
   `role` (string, `admin`).
8. Seed the content: `cd seed && npm i firebase-admin`, add `serviceAccountKey.json`
   (Project settings → Service accounts → Generate new private key), then
   `node seed.js` with `protocols.json` beside it.
9. Enable GitHub Pages on this repo (Settings → Pages → Deploy from branch: `main`, `/`).
   The live app will be at `https://forgedreams-ai.github.io/pfd-protocols/`.

## Managing access

Sign in as the admin → ⚙ Admin → type a medic's department email → Approve.
Admins can also remove people or grant admin to another medic. Anyone not on the
list sees "access pending approval" and no protocol content, ever.

## Updating protocols

When the treatment guidelines are revised: re-run the extraction, replace
`seed/protocols.json`, run `node seed/seed.js` again (it clears and re-seeds).
A scheduled check reviews the department SharePoint for updates every 30 days.
