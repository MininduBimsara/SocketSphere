# SocketSphere — Frontend Deep Dive

> **Stack:** Next.js 15.5.4, React 19, Tailwind CSS 4, Socket.IO Client 4.8.1, TypeScript 5  
> **Directory:** `frontend/`

---

## 1. What the Frontend Does

The frontend is a **Next.js App Router** application with exactly **two pages**:

1. **Home Page (`/`)** — A login screen where the user enters a username.
2. **Chat Page (`/chat`)** — The real-time chat interface.

There is no authentication, no API calls for login — just `localStorage`. The real-time communication happens entirely over **WebSocket** (Socket.IO).

---

## 2. File-by-File Breakdown

### 2.1 `frontend/package.json`

```json
{
  "scripts": {
    "dev": "next dev --turbopack", // Dev server with Turbopack (fast HMR)
    "build": "next build", // Production build
    "start": "next start", // Start production server
    "lint": "eslint" // Run ESLint
  }
}
```

**Key dependencies:**

- `next` 15.5.4 — The React framework
- `react` / `react-dom` 19.1.0 — React core
- `socket.io-client` 4.8.1 — WebSocket client library
- `tailwindcss` 4.x — Utility-first CSS (used via PostCSS)

### 2.2 `frontend/next.config.ts`

```ts
const nextConfig = {
  output: "standalone", // Produces a self-contained build for Docker
  eslint: { ignoreDuringBuilds: true },
  env: {
    NEXT_PUBLIC_API_URL:
      process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000",
  },
};
```

- **`output: "standalone"`** — Critical for Docker. Instead of needing the full `node_modules`, Next.js bundles everything into a standalone folder.
- **`NEXT_PUBLIC_API_URL`** — The backend URL is baked into the client bundle at build time. In development, it defaults to `http://localhost:3000` (but the `.env.local` file overrides it to `http://localhost:5000`).

### 2.3 `frontend/.env.local`

```
NEXT_PUBLIC_API_URL=http://localhost:5000
```

This is the **actual backend URL used in local development**. The backend's `.env` file sets `PORT=5000`, so this must match. This variable is public (prefixed with `NEXT_PUBLIC_`) so it's embedded in the browser bundle.

### 2.4 `frontend/app/globals.css`

```css
@import "tailwindcss";

:root {
  --background: #ffffff;
  --foreground: #171717;
}
```

- Imports Tailwind CSS 4 (the new `@import "tailwindcss"` syntax replaces the old `@tailwind` directives).
- Defines CSS custom properties for light theme colors.
- Has a `prefers-color-scheme: dark` media query that switches to dark colors (though the app UI currently uses hardcoded white backgrounds).

### 2.5 `frontend/app/layout.tsx` — Root Layout

```tsx
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
```

**What it does:**

- Loads two Google fonts: **Geist** (sans-serif) and **Geist Mono** (monospace) using `next/font/google`.
- These fonts are set as CSS custom properties (`--font-geist-sans`, `--font-geist-mono`) and applied to the `<body>`.
- The `antialiased` class from Tailwind smooths font rendering.
- `{children}` is where the page content (Home or Chat) gets rendered.

### 2.6 `frontend/types/chat.ts` — TypeScript Interfaces

This file defines the shapes of data objects used across the frontend:

```ts
// A message as returned from the backend
interface Message {
  _id: string; // MongoDB ObjectId (as string)
  userId: string; // The client-generated user ID
  username: string; // Display name
  text: string; // Message content
  timestamp: Date; // When posted
  createdAt: Date; // MongoDB timestamp
}

// What we send when posting a message
interface SendMessagePayload {
  userId: string;
  text: string;
}

// What we send when joining
interface JoinPayload {
  userId: string;
  username: string;
}

// User info object
interface UserInfo {
  userId: string;
  username: string;
  _id?: string; // MongoDB ID (optional)
}

// Generic server response shape
interface SocketResponse {
  success: boolean;
  message?: string;
  data?: any;
  error?: string;
}
```

### 2.7 `frontend/lib/socket.ts` — Socket.IO Client Singleton

This is the **most important utility file**. It manages a single Socket.IO connection:

```ts
let socket: Socket | null = null;

export const initSocket = (): Socket => {
  if (!socket) {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

    socket = io(apiUrl, {
      autoConnect: false, // We manually call socket.connect() later
      reconnection: true, // Auto-reconnect on disconnect
      reconnectionAttempts: 5, // Try 5 times before giving up
      reconnectionDelay: 1000, // Wait 1 second between attempts
      transports: ["websocket", "polling"], // Try WebSocket first, fall back to HTTP polling
    });
  }
  return socket;
};

export const disconnectSocket = (): void => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};
```

**Key design decisions:**

- **Singleton pattern:** `initSocket()` creates the socket only once. Subsequent calls return the same instance. This prevents multiple connections.
- **`autoConnect: false`:** The socket does NOT connect on creation. The Chat page explicitly calls `socket.connect()` after setup is complete.
- **Transports:** Tries WebSocket first (faster, bidirectional), falls back to HTTP long-polling if WebSocket is blocked (e.g., behind a corporate proxy).

---

## 3. Page-by-Page Walkthrough

### 3.1 Home Page — `frontend/app/page.tsx`

**What the user sees:** A full-width split screen. Left side has branding ("Chat anywhere with anyone"). Right side has a form: username input + "Start chatting" button.

**State management:**

```ts
const [username, setUsername] = useState("");
const router = useRouter();
```

Only two pieces of state: the username text and Next.js router for navigation.

**Form submission flow:**

```ts
const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
  e.preventDefault();
  if (username.trim()) {
    localStorage.setItem("chatUsername", username.trim()); // Store for chat page
    router.push("/chat"); // Navigate
  }
};
```

1. Prevents default form behavior (no page reload).
2. Validates that the username isn't empty/whitespace.
3. Stores the trimmed username in `localStorage` under the key `"chatUsername"`.
4. Uses Next.js client-side router to navigate to `/chat`.

**Input validation:**

- HTML attributes `required`, `minLength={2}`, `maxLength={20}` enforce basic validation at the browser level.

**Styling:**

- `"use client"` directive at the top — this is a Client Component (it uses `useState`, `useRouter`).
- All styling uses Tailwind utility classes.
- The page is a flex container with two `w-1/2` halves.

### 3.2 Chat Page — `frontend/app/chat/page.tsx`

This is the heart of the frontend. It handles the entire real-time chat experience.

**State:**

```ts
const [messages, setMessages] = useState<Message[]>([]); // All chat messages
const [inputText, setInputText] = useState(""); // Current text input
const [username, setUsername] = useState(""); // From localStorage
const [userId, setUserId] = useState(""); // Generated session ID
const [isConnected, setIsConnected] = useState(false); // WebSocket connection status
const [isJoined, setIsJoined] = useState(false); // Has the join handshake completed?
```

**Refs:**

```ts
const messagesEndRef = useRef<HTMLDivElement>(null); // For auto-scroll to bottom
const socketRef = useRef<Socket | null>(null); // Holds socket instance across renders
```

#### Initialization (`useEffect` on mount):

This is the most complex part. Here's what happens step by step:

```
Mount → Read localStorage → Generate userId → Create socket → Connect
  → On 'connect': emit 'join'
  → On 'joinSuccess': set isJoined, request recent messages
  → On 'recentMessages': populate message list
  → On 'newMessage': append to message list
```

**Detailed breakdown:**

1. **Read username from localStorage:**

   ```ts
   const storedUsername = localStorage.getItem("chatUsername");
   if (!storedUsername) {
     router.push("/"); // Redirect to login if no username
     return;
   }
   ```

2. **Generate a unique session ID:**

   ```ts
   const generatedUserId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
   ```

   This creates something like `user_1760127880849_gq2a88d5j`. A new one is generated on every page load, meaning if you refresh, you get a new ID (but the same username).

3. **Create and connect the socket:**

   ```ts
   const socket = initSocket(); // Get/create singleton
   socketRef.current = socket; // Store in ref
   socket.connect(); // Open connection
   ```

4. **Register event listeners:**

   | Event            | What happens                                                 |
   | ---------------- | ------------------------------------------------------------ |
   | `connect`        | Set `isConnected = true`, emit `join` with userId + username |
   | `disconnect`     | Set `isConnected = false`, `isJoined = false`                |
   | `connected`      | Log the server acknowledgment                                |
   | `joinSuccess`    | Set `isJoined = true`, emit `getRecentMessages`              |
   | `recentMessages` | Reverse the array and set as messages state                  |
   | `newMessage`     | Append to messages array                                     |
   | `userJoined`     | Log to console                                               |
   | `userLeft`       | Log to console                                               |
   | `onlineCount`    | Log to console                                               |
   | `connect_error`  | Set both connected/joined to false                           |
   | `error`          | Log the error                                                |

5. **Cleanup on unmount:**
   ```ts
   return () => {
     if (socketRef.current && isJoined) {
       socketRef.current.emit("leave", { userId: generatedUserId });
     }
     disconnectSocket();
   };
   ```
   Emits a `leave` event so the backend knows the user intentionally left, then destroys the socket.

#### Sending a message:

```ts
const handleSendMessage = (e: FormEvent<HTMLFormElement>) => {
  e.preventDefault();
  if (!inputText.trim() || !socketRef.current || !isConnected || !isJoined)
    return;

  socketRef.current.emit("sendMessage", {
    userId,
    text: inputText.trim(),
  });

  setInputText(""); // Clear input immediately
};
```

**Important:** The message is NOT added to local state here. Instead, it waits for the `newMessage` event from the server. This ensures all messages (including your own) go through the same path and maintain consistent ordering.

#### Message rendering:

```tsx
messages.map((message, index) => {
  const isOwnMessage = message.userId === userId;
  // ...
});
```

- **Own messages:** Blue background, right-aligned, no username label.
- **Other messages:** Gray background, left-aligned, username shown above.
- Timestamps are formatted as `HH:MM AM/PM` using `toLocaleTimeString`.

#### Auto-scroll:

```ts
useEffect(() => {
  messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
}, [messages]);
```

Every time `messages` changes (new message arrives), smooth-scroll to the invisible `<div ref={messagesEndRef} />` at the bottom.

#### UI Layout:

The page is a **split screen** identical to the home page:

- **Left half:** Static branding (logo, headline, "Start chatting" button — decorative only on this page).
- **Right half:** The actual chat interface, split vertically into:
  - **Header:** User avatar (first letter), name, online status indicator (green/red dot), "Leave" button.
  - **Messages container:** Scrollable area with message bubbles.
  - **Input bar:** Text field + "Send" button in a form at the bottom.

**Disabled states:**

- Input field shows "Connecting..." and is disabled until `isConnected && isJoined`.
- Send button is disabled if input is empty or not connected.

---

## 4. How Data Flows Through the Frontend

```
localStorage                   React State                    Socket.IO
────────────                   ───────────                    ─────────

chatUsername ──► username       messages[] ◄──── newMessage event
                               messages[] ◄──── recentMessages event
                               isConnected ◄─── connect / disconnect events
                               isJoined ◄────── joinSuccess event
                               inputText ──────► sendMessage emit
```

---

## 5. Styling Architecture

- **Tailwind CSS 4** is used exclusively — no custom CSS classes, no CSS modules.
- The new Tailwind v4 import syntax (`@import "tailwindcss"`) is used in `globals.css`.
- PostCSS processes Tailwind via `@tailwindcss/postcss` (configured in `postcss.config.mjs`).
- The color scheme is simple: blue (`bg-blue-500`) for primary actions and own messages, gray (`bg-gray-100`) for others' messages, white backgrounds throughout.
- Layout is flex-based: `min-h-screen flex` on the outer container, `w-1/2` for the two halves.

---

## 6. Environment Variables

| Variable              | File         | Value                   | Used For                                        |
| --------------------- | ------------ | ----------------------- | ----------------------------------------------- |
| `NEXT_PUBLIC_API_URL` | `.env.local` | `http://localhost:5000` | Socket.IO server URL (baked into client bundle) |

**Important:** Because this variable has the `NEXT_PUBLIC_` prefix, it is:

- Available in browser JavaScript (not just server-side).
- Embedded at **build time** (not runtime). If you change it, you must rebuild.

---

## 7. Docker Build

The `Dockerfile` uses a **three-stage build**:

| Stage     | Base             | Purpose                                                         |
| --------- | ---------------- | --------------------------------------------------------------- |
| `deps`    | `node:18-alpine` | Install npm dependencies                                        |
| `builder` | `node:18-alpine` | Copy deps + source, run `npm run build`                         |
| `runner`  | `node:18-alpine` | Copy the standalone build output, run as non-root `nextjs` user |

The final image is minimal — it only contains the built application and production dependencies.

**Exposed port:** 3001 (set via `ENV PORT 3001` and `EXPOSE 3001`).

---

## 8. Common Questions

**Q: Why is there no API call to register the user?**  
A: The "registration" happens implicitly. When the user joins the chat via WebSocket, the backend's `handleJoin()` checks if the username exists in MongoDB and creates it if not. There is no separate signup step.

**Q: Why does the frontend generate its own user ID?**  
A: The client-generated ID (`user_<timestamp>_<random>`) serves as a **session identifier**. It's used to match incoming messages to "is this mine?" on the frontend. The MongoDB `_id` is not available until after the join handshake completes, so the app needs an ID immediately.

**Q: What happens if I refresh the page?**  
A: The username persists (it's in `localStorage`), so you'll be reconnected to the chat. However, you'll get a **new** `userId`, meaning old messages from your previous session will appear as if they're from someone else (since the `userId` comparison won't match).

**Q: Why are messages reversed after fetching?**  
A: The backend returns messages sorted by `timestamp DESC` (newest first) for efficient querying. The frontend reverses them to display oldest-at-top, newest-at-bottom.

**Q: What are the typing indicators?**  
A: The backend has `typing` and `stopTyping` events implemented, but the **frontend does not currently emit or listen to these events**. The UI does not show typing indicators yet — this is a ready-to-use backend feature awaiting frontend implementation.
