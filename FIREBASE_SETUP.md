# Firebase setup — click by click

Do this in a desktop browser signed in to the Google account that should own the
project (Anthony's).

## 1. Create the project
1. Go to https://console.firebase.google.com → **Add project**.
2. Name: `pfd-protocols`. Disable Google Analytics (not needed) → Create project.

## 2. Register the web app & get config
1. In the project overview, click the **Web** icon (`</>`) → nickname `pfd-protocols-web` → Register.
2. Copy the `firebaseConfig` values into `firebase-config.js` in this repo
   (`apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`).
3. Commit + push so GitHub Pages serves the real config.

## 3. Enable Email/Password auth
1. Left menu → **Build → Authentication** → Get started.
2. **Sign-in method** tab → **Email/Password** → Enable → Save.
   (Leave "Email link" off.)

## 4. Create Firestore
1. Left menu → **Build → Firestore Database** → Create database.
2. Choose **Start in production mode** → pick the region closest to you
   (`nam5` / Iowa is fine) → Enable.

## 5. Publish the security rules
1. Firestore Database → **Rules** tab.
2. Replace the entire contents with `firestore.rules` from this repo → **Publish**.
3. These rules mean: only signed-in, allowlisted emails can read protocols;
   only admins can edit the allowlist or content. Everything else is denied.

## 6. Create the admin user
1. **Build → Authentication → Users** → **Add user**.
2. Email: Anthony's email (e.g. `anthony.hidalgo2@phoenix.gov`), set a password → Add.

## 7. Seed the allowlist with the admin
1. **Build → Firestore Database → Data** → **Start collection** → Collection ID: `allowlist`.
2. **Add document**: Document ID = the admin email **lowercased**
   (e.g. `anthony.hidalgo2@phoenix.gov`).
   Fields: `email` (string) = same email, `role` (string) = `admin`.
3. Save. This person can now sign in to the app and manage everyone else
   from the in-app Admin screen.

## 8. Seed the protocol content
1. On the maintainer machine: `cd seed && npm install firebase-admin`.
2. Project settings (gear icon) → **Service accounts** → **Generate new private key** →
   save as `seed/serviceAccountKey.json` (never commit this file).
3. Place the extracted `protocols.json` in `seed/`.
4. Run `node seed/seed.js`. It clears the `protocols` collection and writes all cards.

## 9. Verify privacy (do this before sharing the link)
1. Open the live site in a **private/incognito window** (signed out).
   You must see ONLY the sign-in page — no protocols, no search.
2. In the browser console, run:
   `fetch('https://firestore.googleapis.com/v1/projects/PROJECT_ID/databases/(default)/documents/protocols?pageSize=1')`
   (replace PROJECT_ID). It must return **403/permission-denied**.
3. Sign in as the admin → search works, focus mode works, Admin screen lists the allowlist.

## 10. Turn on GitHub Pages
Repo → Settings → Pages → Source: **Deploy from a branch**, Branch: `main`, folder `/` → Save.
Live URL: `https://forgedreams-ai.github.io/pfd-protocols/`
