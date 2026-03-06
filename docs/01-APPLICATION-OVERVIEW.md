# SocketSphere — Full Application Overview

> **Last updated:** February 2026  
> **Purpose:** This document explains the entire SocketSphere application end-to-end so you can ramp back up after time away from the codebase.

---

## 1. What Is SocketSphere?

SocketSphere (branded **"Anychat"** in the UI) is a **real-time chat application** that lets multiple users exchange messages instantly through their web browsers. Think of it as a simplified Slack or Discord with a single public chatroom.

**In plain English:**  
A user opens the website, types a username, clicks "Start chatting", and lands in a live group chat where every message appears in real time for everyone — no page refresh needed.

---

## 2. High-Level Architecture

The system is split into **three independent services** that talk to each other:

```
┌─────────────────────┐         WebSocket (Socket.IO)         ┌─────────────────────┐
│                     │  ◄──────────────────────────────────►  │                     │
│   FRONTEND          │         HTTP REST (fetch)              │   BACKEND           │
│   (Next.js 15)      │  ◄──────────────────────────────────►  │   (NestJS 11)       │
│   Port 3001         │                                        │   Port 3000/5000    │
│                     │                                        │                     │
└─────────────────────┘                                        └──────┬──────┬───────┘
                                                                      │      │
                                                                      │      │
                                                              ┌───────▼──┐ ┌─▼──────────┐
                                                              │  MongoDB │ │   Redis     │
                                                              │  :27017  │ │   :6379     │
                                                              │ (persist)│ │ (cache/pub- │
                                                              │          │ │  sub)       │
                                                              └──────────┘ └────────────┘
```

| Service      | Technology                                             | Role                                                                                                                |
| ------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| **Frontend** | Next.js 15, React 19, Tailwind CSS 4, Socket.IO Client | The UI the user sees — login page + chat page                                                                       |
| **Backend**  | NestJS 11, Socket.IO Server, Mongoose                  | REST API + WebSocket gateway — all business logic lives here                                                        |
| **MongoDB**  | MongoDB 7                                              | Permanent storage for users and messages                                                                            |
| **Redis**    | Redis (latest)                                         | Caches messages, tracks who is online, and enables Socket.IO pub/sub so the backend can scale to multiple instances |

---

## 3. The User Journey (Step by Step)

### 3a. Entering the App (Login Page — `/`)

1. User opens `http://localhost:3001` in a browser.
2. The **Home page** (`frontend/app/page.tsx`) renders a split-screen:
   - **Left half:** Branding — logo, headline "Chat anywhere with anyone", description.
   - **Right half:** A form with a single `username` field and a "Start chatting" button.
3. User types a username (2-20 characters) and submits the form.
4. The username is saved into `localStorage` under the key `chatUsername`.
5. The router navigates the user to `/chat`.

### 3b. Connecting to the Chat (Chat Page — `/chat`)

1. The **Chat page** (`frontend/app/chat/page.tsx`) loads.
2. On mount, it:
   - Reads `chatUsername` from `localStorage`. If missing, it redirects back to `/`.
   - Generates a **temporary user ID** (e.g. `user_1760127880849_gq2a88d5j`) — this is NOT the MongoDB `_id`; it is a client-generated identifier for the session.
   - Calls `initSocket()` from `frontend/lib/socket.ts` to create a **Socket.IO client** pointing at the backend (`NEXT_PUBLIC_API_URL`, default `http://localhost:5000`).
   - Calls `socket.connect()` to open the WebSocket connection.
3. Once the WebSocket connection is open (`connect` event):
   - The frontend emits a `join` event with `{ userId, username }`.
4. **On the backend** (`socketsphere/src/chat/chat.gateway.ts`):
   - `handleConnection()` fires — sends the client a `connected` acknowledgment + current online count.
   - `handleJoin()` fires — looks up or creates the user in MongoDB, stores the user's session in Redis, marks the user as online in Redis, broadcasts `userJoined` + `onlineCount` to **all** connected clients.
   - Sends `joinSuccess` back to the joining client.
5. The frontend, upon receiving `joinSuccess`, sets `isJoined = true` and emits `getRecentMessages` with `{ limit: 50 }`.
6. The backend's `handleGetRecentMessages()`:
   - Tries Redis cache first.
   - Falls back to MongoDB query if cache is empty.
   - Sends the messages back via a `recentMessages` event.
7. The frontend receives the messages, reverses them (newest last), and renders them in the chat window.

### 3c. Sending a Message

1. User types text and presses **Send** (or Enter).
2. Frontend emits `sendMessage` with `{ userId, text }`.
3. Backend `handleSendMessage()`:
   - Looks up the user in the local in-memory map (or Redis as fallback).
   - Creates a `Message` document in MongoDB via `MessageService.createMessage()`.
   - Caches the message in Redis (`addMessageToCache()`).
   - Broadcasts the saved message to **all** clients via `server.emit('newMessage', savedMessage)`.
4. Every connected client (including the sender) receives the `newMessage` event and appends it to the message list.

### 3d. Leaving the Chat

- **Explicit leave:** User clicks "Leave" — frontend emits `leave`, clears `localStorage`, redirects to `/`.
- **Implicit disconnect:** User closes the tab — Socket.IO fires `disconnect` on the backend, which cleans up Redis, updates MongoDB status, and broadcasts `userLeft`.

---

## 4. Data Flow Diagram

```
  Browser                        Backend (NestJS)                  Data Stores
  ──────                         ────────────────                  ───────────

  connect() ─────────────────►  handleConnection()
                                  ├─ emit 'connected' to client
                                  └─ emit 'onlineCount' to client

  emit 'join' ───────────────►  handleJoin()
                                  ├─ findOrCreate User in MongoDB ──► MongoDB
                                  ├─ store session in Redis ────────► Redis
                                  ├─ addOnlineUser in Redis ────────► Redis
                                  ├─ broadcast 'userJoined' to all
                                  └─ emit 'joinSuccess' to client

  emit 'getRecentMessages' ──►  handleGetRecentMessages()
                                  ├─ try Redis cache ◄──────────────  Redis
                                  ├─ fallback MongoDB ◄─────────────  MongoDB
                                  └─ emit 'recentMessages' to client

  emit 'sendMessage' ────────►  handleSendMessage()
                                  ├─ save to MongoDB ───────────────► MongoDB
                                  ├─ cache in Redis ────────────────► Redis
                                  └─ broadcast 'newMessage' to all

  emit 'leave' ──────────────►  handleLeave()
                                  ├─ remove from Redis ─────────────► Redis
                                  ├─ update MongoDB status ─────────► MongoDB
                                  └─ broadcast 'userLeft' to all
```

---

## 5. Technology Stack Summary

### Frontend

| Concern         | Technology           | Version  |
| --------------- | -------------------- | -------- |
| Framework       | Next.js (App Router) | 15.5.4   |
| UI Library      | React                | 19.1.0   |
| Styling         | Tailwind CSS         | 4.x      |
| Real-time Comms | socket.io-client     | 4.8.1    |
| Language        | TypeScript           | 5.x      |
| Build Tool      | Turbopack (dev)      | built-in |

### Backend

| Concern         | Technology                                           | Version         |
| --------------- | ---------------------------------------------------- | --------------- |
| Framework       | NestJS                                               | 11.1.6          |
| WebSocket       | @nestjs/websockets + @nestjs/platform-socket.io      | 11.1.6          |
| Database ODM    | Mongoose (@nestjs/mongoose)                          | 11.0.3 / 8.18.1 |
| Cache / Pub-Sub | Redis (via `redis` npm + `@socket.io/redis-adapter`) | 5.8.3 / 8.3.0   |
| Validation      | class-validator + class-transformer                  | 0.14.2 / 0.5.1  |
| Language        | TypeScript                                           | 5.x             |

### Infrastructure

| Concern          | Technology              |
| ---------------- | ----------------------- |
| Database         | MongoDB 7               |
| Cache            | Redis                   |
| Containerization | Docker + Docker Compose |

---

## 6. Project Folder Structure

```
SocketSphere/
├── docker-compose.prod.yml          # Orchestrates all services for production
│
├── frontend/                         # Next.js frontend application
│   ├── app/
│   │   ├── layout.tsx                # Root layout (fonts, global CSS)
│   │   ├── page.tsx                  # Home/Login page
│   │   ├── chat/
│   │   │   └── page.tsx              # Chat page (main feature)
│   │   └── globals.css               # Tailwind + CSS variables
│   ├── lib/
│   │   └── socket.ts                 # Socket.IO client singleton
│   ├── types/
│   │   └── chat.ts                   # TypeScript interfaces (Message, JoinPayload, etc.)
│   ├── public/                       # Static assets
│   ├── .env.local                    # NEXT_PUBLIC_API_URL=http://localhost:5000
│   ├── Dockerfile                    # Multi-stage Docker build
│   ├── next.config.ts                # Next.js config (standalone output)
│   └── package.json
│
├── socketsphere/                     # NestJS backend application
│   ├── src/
│   │   ├── main.ts                   # Bootstrap — CORS, validation pipe, listen on port
│   │   ├── app.module.ts             # Root module — imports all feature modules
│   │   ├── app.controller.ts         # Health check (GET /)
│   │   ├── app.service.ts            # "Hello World" service
│   │   │
│   │   ├── chat/
│   │   │   ├── chat.gateway.ts       # ★ Core: WebSocket gateway — all real-time logic
│   │   │   └── chat.module.ts        # Chat module definition
│   │   │
│   │   ├── message/
│   │   │   ├── message.controller.ts # REST endpoints: /messages
│   │   │   ├── message.service.ts    # CRUD for messages
│   │   │   ├── message.module.ts     # Message module definition
│   │   │   ├── dto/
│   │   │   │   └── create-message.dto.ts  # Validation DTO
│   │   │   └── schemas/
│   │   │       └── message.schema.ts      # Mongoose schema + indexes
│   │   │
│   │   ├── user/
│   │   │   ├── user.controller.ts    # REST endpoints: /users
│   │   │   ├── user.service.ts       # CRUD for users
│   │   │   ├── user.module.ts        # User module definition
│   │   │   ├── dto/
│   │   │   │   └── create-user.dto.ts     # Validation DTO
│   │   │   └── schemas/
│   │   │       └── user.schema.ts         # Mongoose schema + indexes
│   │   │
│   │   ├── redis/
│   │   │   ├── redis.service.ts      # Redis client — sessions, online tracking, caching
│   │   │   └── redis.module.ts       # Global Redis module
│   │   │
│   │   ├── config/
│   │   │   └── redis.config.ts       # Redis connection config helper
│   │   │
│   │   └── database/
│   │       └── database.module.ts    # Mongoose connection with pool settings
│   │
│   ├── test/                         # E2E tests
│   ├── .env                          # Backend environment variables
│   ├── Dockerfile                    # Multi-stage Docker build
│   └── package.json
│
└── docs/                             # (You are here) Documentation
```

---

## 7. Database Schemas

### Users Collection

| Field       | Type          | Required     | Description                                    |
| ----------- | ------------- | ------------ | ---------------------------------------------- |
| `_id`       | ObjectId      | auto         | MongoDB primary key                            |
| `username`  | String        | yes (unique) | Display name, 3-30 chars                       |
| `status`    | String (enum) | no           | `"online"` or `"offline"`, default `"offline"` |
| `createdAt` | Date          | auto         | Timestamp (Mongoose `timestamps: true`)        |
| `updatedAt` | Date          | auto         | Timestamp                                      |

### Messages Collection

| Field          | Type                 | Required | Description                                               |
| -------------- | -------------------- | -------- | --------------------------------------------------------- |
| `_id`          | ObjectId             | auto     | MongoDB primary key                                       |
| `userId`       | ObjectId (ref: User) | no       | Links to User document (null for WebSocket-only messages) |
| `username`     | String               | no       | Denormalized username for WebSocket messages              |
| `customUserId` | String               | no       | Client-generated user ID (e.g. `user_17601...`)           |
| `text`         | String               | yes      | Message content                                           |
| `timestamp`    | Date                 | no       | When the message was sent, defaults to `Date.now`         |
| `createdAt`    | Date                 | auto     | Timestamp                                                 |
| `updatedAt`    | Date                 | auto     | Timestamp                                                 |

---

## 8. WebSocket Events Reference

### Client → Server (emitted by frontend)

| Event               | Payload                                | Description                  |
| ------------------- | -------------------------------------- | ---------------------------- |
| `join`              | `{ userId: string, username: string }` | Register user in chat        |
| `sendMessage`       | `{ userId: string, text: string }`     | Send a chat message          |
| `getRecentMessages` | `{ limit?: number }`                   | Request chat history         |
| `typing`            | `{ userId: string, username: string }` | Typing indicator             |
| `stopTyping`        | `{ userId: string }`                   | Stop typing indicator        |
| `getOnlineUsers`    | (none)                                 | Request list of online users |
| `leave`             | `{ userId: string }`                   | Gracefully leave chat        |

### Server → Client (received by frontend)

| Event               | Payload                                | Description                      |
| ------------------- | -------------------------------------- | -------------------------------- |
| `connected`         | `{ message, socketId, timestamp }`     | Connection acknowledged          |
| `joinSuccess`       | `{ user, message }`                    | User successfully joined         |
| `newMessage`        | Full message object                    | A new message was sent by anyone |
| `recentMessages`    | `{ success, data: Message[], count }`  | Batch of chat history            |
| `userJoined`        | `{ userId, username, timestamp }`      | Someone joined                   |
| `userLeft`          | `{ userId, username, timestamp }`      | Someone left                     |
| `onlineCount`       | `number`                               | Updated count of online users    |
| `userTyping`        | `{ userId, username }`                 | Someone is typing                |
| `userStoppedTyping` | `{ userId }`                           | Someone stopped typing           |
| `onlineUsers`       | `{ success, data: UserInfo[], count }` | List of online users             |
| `error`             | `{ message, error? }`                  | Error occurred                   |

---

## 9. REST API Endpoints

These exist alongside WebSocket events and are usable by external tools/scripts.

### Users (`/users`)

| Method   | Path                | Description        |
| -------- | ------------------- | ------------------ |
| `POST`   | `/users`            | Create a user      |
| `GET`    | `/users`            | List all users     |
| `GET`    | `/users/online`     | List online users  |
| `GET`    | `/users/count`      | Get user count     |
| `GET`    | `/users/:id`        | Get user by ID     |
| `PATCH`  | `/users/:id/status` | Update user status |
| `DELETE` | `/users/:id`        | Delete user        |

### Messages (`/messages`)

| Method   | Path               | Description                         |
| -------- | ------------------ | ----------------------------------- |
| `POST`   | `/messages`        | Create a message                    |
| `GET`    | `/messages`        | List all messages (with `?limit=N`) |
| `GET`    | `/messages/recent` | Recent messages (with `?limit=N`)   |
| `GET`    | `/messages/count`  | Get message count                   |
| `GET`    | `/messages/:id`    | Get message by ID                   |
| `DELETE` | `/messages/:id`    | Delete message                      |

---

## 10. How Redis Is Used

Redis serves **three distinct purposes** in this application:

1. **Socket.IO Adapter (Pub/Sub):** When you run multiple backend instances, the Redis adapter ensures that a `server.emit()` on one instance reaches clients connected to other instances. The `ChatGateway.afterInit()` method creates a pub and sub client and wires them into Socket.IO's adapter system.

2. **Online User Tracking:** A Redis Hash (`online:users`) maps `userId → socketId`. This is the source of truth for who is currently online and is used to calculate `onlineCount`.

3. **Message Caching:** Recent messages are stored in a Redis List (`messages:recent`) so that when a new user joins, the backend can serve the last 50 messages from Redis instead of hitting MongoDB. Each new message is also pushed to this list.

---

## 11. Docker Setup

The `docker-compose.prod.yml` orchestrates three containers:

| Container       | Image                                  | Port  | Notes                                |
| --------------- | -------------------------------------- | ----- | ------------------------------------ |
| `chat-backend`  | Built from `./socketsphere/Dockerfile` | 3000  | Depends on `mongo`, has health check |
| `chat-frontend` | Built from `./frontend/Dockerfile`     | 3001  | Depends on backend being healthy     |
| `chat-mongodb`  | `mongo:7-jammy`                        | 27017 | Persistent volumes for data          |

> **Note:** Redis is NOT included in the current docker-compose file. For production with Redis, you would need to add a Redis service.

Both Dockerfiles use **multi-stage builds** (deps → builder → runner) to keep images small and secure (non-root users).

---

## 12. Key Design Decisions

1. **Client-generated user IDs:** The frontend generates a `user_<timestamp>_<random>` ID on every session. This is separate from the MongoDB `_id`. The backend reconciles them — it looks up or creates a MongoDB user by username and stores both IDs.

2. **Dual message storage:** Messages go to both MongoDB (permanent) and Redis (cache). This gives fast reads for recent messages and durability for the full history.

3. **Global Redis module:** The `RedisModule` is decorated with `@Global()` so every module can inject `RedisService` without explicitly importing it.

4. **Graceful degradation:** If Redis is unavailable, the `ChatGateway.afterInit()` catches the error and continues in single-server mode (no pub/sub, no caching — but the app still works with MongoDB).

5. **No authentication:** There is no login or password system. Any user can join by typing any username. This is a deliberate simplification.

---

## 13. What's NOT Implemented (Potential Enhancements)

- Authentication / authorization (JWT, OAuth, etc.)
- Private messaging / rooms
- File / image uploads
- Message editing or reactions
- Rate limiting
- Read receipts
- User avatars / profiles
- Redis in docker-compose
- Production deployment configuration (TLS, reverse proxy, etc.)
