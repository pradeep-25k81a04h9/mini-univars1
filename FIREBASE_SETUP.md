# Our Little Universe — Firebase connection

## Firebase project
- Project ID: `our-little-universe-70755`
- Web app nickname: `Our Little Universe Web`
- Authentication provider: Email/Password
- Firestore database: `(default)`

## Local environment
Create `.env.local` in the project root. Copy the real values from Firebase Console → Project settings → General → Your apps.

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=our-little-universe-70755.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=our-little-universe-70755
VITE_FIREBASE_STORAGE_BUCKET=our-little-universe-70755.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

Do not share or commit `.env.local`. The web API key is expected to appear in client-side config, but restrict it to the APIs used by this Firebase project where appropriate. Never use a service-account private key in the browser.

## Vercel
Add the same six variables under Project → Settings → Environment Variables. Select Production (and Preview if you use preview deployments), save, then redeploy the project.

## Data model
- `users/{uid}` — each separately authenticated account.
- `couples/{coupleId}` — one shared space with one or two members and relationship dates.
- `invitations/{code}` — one-time invitation code with expiry and claim status.
- `couples/{coupleId}/messages/{messageId}`
- `couples/{coupleId}/photos/{photoId}`
- `couples/{coupleId}/calendar/{eventId}`
- `couples/{coupleId}/notes/{noteId}`
- `couples/{coupleId}/bucketGoals/{goalId}`
- `couples/{coupleId}/moods/{moodId}`
- `couples/{coupleId}/loveLetters/{letterId}`
- `couples/{coupleId}/songs/{songId}`
- `couples/{coupleId}/quizQuestions/{questionId}`
- `couples/{coupleId}/trips/{tripId}`
- `couples/{coupleId}/dailyAnswers/{yyyy-mm-dd}`

The app is designed to use Firestore transactions/batched writes for the two-account pairing flow. Do not manually create seed users or couple records in the Firebase Console.
