# SafePair

A personal-safety app that connects **two people**: they see each other on a live map, message each other, and can send an SOS with one tap.

| Feature | What it does |
| --- | --- |
| **Device pairing** | One person shows a 6-digit code (valid 10 min, single use), the other types it in. Each account can have exactly one partner. |
| **Live location** | Both phones stream their position to each other in real time while the app is open, and every ~25 m / 60 s in the background. The map shows distance, direction, last update time and battery level. |
| **SOS** | One tap on the red SOS button alerts the partner right away: a full-screen red alert on their phone, a high-priority push notification, vibration, and your location. Tap **SAFE** to cancel. |
| **Navigation** | "Find ‹partner›" and "Go home" open walking directions in Apple Maps or Google Maps. Set Home in Settings. |
| **Notifications** | Push notifications for SOS (always) and messages (when the partner isn't connected). Android uses a dedicated SOS channel that can bypass Do Not Disturb. |
| **Messaging** | Chat with quick replies ("I'm OK 👍", "On my way", …), location sharing, typing indicator, unread badge, and retry for failed messages. |

## Repository layout

```
app/      Expo (React Native) mobile app – iOS & Android
server/   Node.js server – REST + Socket.IO realtime relay + Expo push
```

### How it works

```
 Phone A ──socket.io──▶ ┌────────────┐ ◀──socket.io── Phone B
        ──HTTPS (bg)──▶ │   server   │ ◀──HTTPS (bg)──
                        └─────┬──────┘
                              └──▶ Expo Push service ──▶ APNs / FCM
```

* While the app is open, location, messages and SOS travel over a Socket.IO connection.
* In the background, the OS wakes a background location task, which `POST`s to `/api/location`.
* An SOS also sends a push notification, so it reaches the partner even when their app is closed.

## Running it

### 1. Server

```bash
cd server
npm install
npm start            # http://localhost:4000
npm test             # integration tests (pairing, location, SOS, chat, presence)
```

Environment variables: `PORT` (default `4000`), `DATA_FILE` (JSON persistence file, default `safepair-data.json`), `CORS_ORIGIN`.
There is a `Dockerfile` for deployment. Put the server behind HTTPS in production.

#### Hosting on Render (free)

`render.yaml` at the repo root describes the service.

1. Sign in at render.com with GitHub and give Render access to this repository.
2. **New → Blueprint**, pick this repository, and click **Apply**. Render builds and starts the `safepair` web service.
3. Copy the service URL (for example `https://safepair-xxxx.onrender.com`). Opening `<url>/health` should show `{"ok":true}`.
4. In the app, open **Server settings** on the welcome screen and enter that URL on both phones.

Free-plan limits: the service sleeps after about 15 minutes without traffic, so the first request afterwards can take up to a minute. It has no persistent disk, so a restart or redeploy wipes accounts and pairings. The app then returns to the welcome screen and the two people pair again. For real use, switch to a paid plan and add a disk (set `DATA_FILE` to a path on it).

### 2. App

```bash
cd app
npm install
EXPO_PUBLIC_SERVER_URL=http://<your-computer-LAN-IP>:4000 npx expo start
```

You can also change the server address on the welcome screen under **Server settings**.

> **Use a development build, not Expo Go.** Background location, maps and push notifications need native code that Expo Go doesn't include. Build one with `npx expo run:ios` / `npx expo run:android`, or `npx eas-cli build --profile development`.

Optional configuration (environment variables read by `app.config.ts`):

| Variable | Purpose |
| --- | --- |
| `EXPO_PUBLIC_SERVER_URL` | Default server URL |
| `EAS_PROJECT_ID` | Needed for push tokens (`npx eas-cli init` creates a project) |
| `GOOGLE_MAPS_ANDROID_API_KEY` | Google Maps on Android (iOS uses Apple Maps) |

`npm run web` starts a browser preview for working on the UI. The map shows a placeholder there, because react-native-maps has no web support.

Checks: `npm run typecheck`, `npm run lint`, `npx expo-doctor`.

### Trying it with two people

1. Install the app on two phones and open it on both. Enter a name on each.
2. Phone A shows a code. Type it into **Enter their code** on phone B.
3. Both phones switch to the map. Allow location (choose **Always** for background sharing) and notifications.

## API summary

All `/api` routes except `register` need `Authorization: Bearer <token>`.

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/register` | `{name}` → `{token, user, partner}` |
| GET / PATCH | `/api/me` | Profile + partner; update `name`, `pushToken` |
| POST | `/api/pair/code` | Create a pairing code |
| POST | `/api/pair/join` | `{code}` – pair with the code's owner |
| DELETE | `/api/pair` | Unpair (deletes the shared chat history) |
| POST | `/api/location` | Location update (used by the background task) |
| POST / DELETE | `/api/sos` | Raise / resolve SOS |
| GET / POST | `/api/messages` | History (`?before=&limit=`) / send |

Socket.IO (auth: `{ token }`). Client → server: `location:update`, `sos:trigger`, `sos:resolve`, `message:send`, `typing`.
Server → client: `partner:location`, `partner:status`, `partner:typing`, `sos:alert`, `sos:resolved`, `sos:status`, `message:new`, `pair:updated`.

## Safety notes & limitations

* SafePair helps two people look out for each other. It does **not** replace emergency services. The SOS alert screen includes a button to call your local emergency number, which you can set in Settings (default 112).
* Location data goes only to the paired partner. Unpairing stops sharing and deletes the chat history on the server.
* The server keeps its data in memory and saves it to a JSON file. That is fine for personal use or small groups. For larger deployments, swap `server/src/store.js` for a database.
* Auth is a random device token (stored hashed on the server). Signing out, or losing the device, means creating a new account and pairing again.
