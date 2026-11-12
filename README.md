# Our Little Universe ❤️
### A private couple app for two separately authenticated accounts
*Two hearts, one little world.*

Our Little Universe is a mobile-first relationship space with a Bubu-and-Dudu-inspired pastel design. Each partner registers with a separate Firebase Authentication account. After the first person creates an invitation, the second person joins the same couple space. Relationship dates and shared content are stored in Cloud Firestore and synchronized between the paired accounts.

## Features currently connected to Firebase

- Separate email/password registration and login for each person.
- One-time, expiring invitation code for pairing two accounts.
- Relationship setup with first-meeting date, relationship start date, and optional special dates.
- Live Firestore synchronization for chat messages, calendar events, notes, bucket-list goals, moods, love letters, songs, travel plans, and hug count.
- Shared gallery metadata using image URLs. This is not a private file-upload service yet.
- Profile editing and browser-local convenience PIN.
- Responsive Bubu-and-Dudu-inspired interface with light/dark themes.

## Important feature limitations

- **Chat encryption:** live messages are stored as plaintext Firestore text fields. They are not end-to-end encrypted.
- **Photo privacy:** the gallery stores URLs and metadata. A third-party image URL may be publicly accessible; Firebase Storage upload is not wired up.
- **Calling:** the call screen can request a local camera/microphone preview, but it does not yet connect two devices through WebRTC.
- **Online status:** live presence is not implemented; the interface does not claim to know whether the partner is online.
- **Unpair/reset:** destructive unpairing is disabled until a safe two-person confirmation workflow is added.
- **PIN lock:** the PIN is a convenience lock for the current browser, not account security or device encryption.

## Technical architecture

- React + TypeScript + Vite.
- Firebase Authentication for individual accounts.
- Cloud Firestore for couple data and real-time synchronization.
- Firestore Security Rules for account and couple membership checks.
- Vercel for static Vite hosting.

## 🔥 Firebase setup (Vite + Firebase Authentication + Firestore)

This project now uses Firebase Authentication for separate user accounts and Cloud Firestore for shared couple data. The old Express + local JSON database is not part of the deployed frontend runtime.

### 1. Install dependencies

```bash
npm install
```

### 2. Configure the Firebase web app

In Firebase Console → Project settings → General → Your apps, copy the Web App configuration values. Create a local `.env.local` file in the project root using the names below:

```env
VITE_FIREBASE_API_KEY=your_firebase_web_api_key
VITE_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project-id.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
VITE_FIREBASE_APP_ID=your_web_app_id
```

Do not commit `.env.local`. It is ignored by `.gitignore`.

### 3. Firebase products

- Authentication → Sign-in method → Email/Password: enabled.
- Cloud Firestore: create the `(default)` database in Production mode.
- Publish the Firestore Rules configured for the `users`, `couples`, `invitations`, and couple subcollections used by this app.

The app does not create sample users, couple records, dates, messages, or memories. A user profile is created after successful registration. The couple and invitation documents are created only when the first user creates a couple space; the second account joins using the invitation code.

### 4. Vercel environment variables

Add the same six `VITE_FIREBASE_*` variables in Vercel → Project → Settings → Environment Variables. Apply them to Production and Preview as needed, then trigger a new deployment. Vite embeds `VITE_*` values in the browser bundle, so these are public Firebase web configuration values, not service-account secrets. Protect your data with Firebase Authentication and Firestore Security Rules. Never place a Firebase service-account private key in a `VITE_*` variable.

### 5. Run and build

```bash
npm run dev
npm run build
```

Vercel is configured through `vercel.json` to build the Vite app and serve the `dist` directory.

## 🔐 Current privacy and feature status

- Firebase Authentication: separate email/password accounts.
- Firestore: realtime couple-scoped records protected by Firestore Security Rules.
- Chat: messages currently live in Firestore as normal text fields. This is **not end-to-end encryption**. Firebase provides encryption in transit and at rest, but that is not the same as client-to-client E2EE.
- Gallery: the current screen saves image URLs and metadata; it does not upload private image files to Firebase Storage. External image URLs may be public.
- Calling: the current call screen is a local camera/microphone preview and timer; it is not yet a WebRTC call connecting two devices.
- PIN: the current PIN is a convenience lock stored in this browser, not a replacement for account authentication.
- Destructive unpair/reset: intentionally disabled until a safe two-person confirmation flow is implemented.

Firebase Storage may require a billing-enabled Firebase plan for a new bucket. Do not enable billing just to test authentication and Firestore; those can be developed independently. Use a properly reviewed storage design before putting private photos or videos online.

## 📱 PWA Installation (Android & Desktop)
- **On Android (Chrome / Brave / Edge):** Tap the browser menu (`⋮`) -> **"Add to Home screen"** or **"Install app"**.
- **On iOS (Safari):** Tap the Share button -> **"Add to Home Screen"**.
- **On Desktop (Chrome / Edge):** Click the install icon in the URL bar to install the applet as an independent standalone window.
