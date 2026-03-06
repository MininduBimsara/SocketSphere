# SocketSphere — How to Run Locally

> This guide gets the application running on your local Windows machine from scratch.

---

## Prerequisites

You need these installed before starting:

| Tool        | Minimum Version                | How to Check                       | Install From                                   |
| ----------- | ------------------------------ | ---------------------------------- | ---------------------------------------------- |
| **Node.js** | 18.x or later                  | `node --version`                   | https://nodejs.org                             |
| **npm**     | 9.x or later (comes with Node) | `npm --version`                    | (included with Node.js)                        |
| **MongoDB** | 7.x                            | `mongosh --eval "db.version()"`    | https://www.mongodb.com/try/download/community |
| **Redis**   | 6.x or later                   | `redis-cli ping` (should say PONG) | See Redis section below                        |
| **Git**     | any                            | `git --version`                    | https://git-scm.com                            |

### Installing Redis on Windows

Redis does not officially support Windows. You have three options:

**Option A — WSL2 (Recommended):**

```powershell
# Enable WSL if you haven't
wsl --install

# Inside WSL (Ubuntu):
sudo apt update
sudo apt install redis-server
sudo service redis-server start
redis-cli ping   # Should say PONG
```

**Option B — Docker (if you have Docker Desktop):**

```powershell
docker run -d --name redis -p 6379:6379 redis:latest
```

**Option C — Memurai (Windows-native Redis alternative):**
Download from https://www.memurai.com/ — it's a Redis-compatible server for Windows.

---

## Step 1: Clone the Repository

```powershell
git clone https://github.com/YOUR_USERNAME/SocketSphere.git
cd SocketSphere
```

If you already have the repo, make sure you're in the root `SocketSphere/` directory.

---

## Step 2: Start MongoDB

Make sure MongoDB is running on `localhost:27017`.

**If installed as a Windows service** (default installer option):

```powershell
# Check if it's running
Get-Service MongoDB
# If not running:
Start-Service MongoDB
```

**If installed manually:**

```powershell
mongod --dbpath "C:\data\db"
```

**Verify it's working:**

```powershell
mongosh --eval "db.adminCommand('ping')"
# Should output: { ok: 1 }
```

---

## Step 3: Start Redis

Make sure Redis is running on `localhost:6379`.

**WSL:**

```powershell
wsl -e sudo service redis-server start
```

**Docker:**

```powershell
docker start redis
# Or if the container doesn't exist yet:
docker run -d --name redis -p 6379:6379 redis:latest
```

**Verify it's working:**

```powershell
# WSL:
wsl -e redis-cli ping

# Docker:
docker exec redis redis-cli ping

# Should output: PONG
```

---

## Step 4: Install Backend Dependencies

```powershell
cd socketsphere
npm install
```

This installs all packages listed in `package.json` (NestJS, Mongoose, Socket.IO, Redis, etc.).

---

## Step 5: Configure Backend Environment

The `.env` file should already exist at `socketsphere/.env` with these contents:

```dotenv
MONGO_URI=mongodb://127.0.0.1:27017/nest-chat
PORT=5000
NODE_ENV=development
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
```

**Verify this file exists and has the correct values.** The important ones:

- `PORT=5000` — The backend will listen on port 5000.
- `MONGO_URI` — Points to your local MongoDB.
- `REDIS_HOST=localhost` and `REDIS_PORT=6379` — Points to your local Redis.

> If you don't have Redis running and want to skip it temporarily, the app will still start — the Redis adapter will fail gracefully and the server will run in single-instance mode. However, online user tracking and message caching won't work.

---

## Step 6: Start the Backend

```powershell
# Make sure you're in the socketsphere/ directory
npm run start:dev
```

This runs `nest start --watch`, which:

- Compiles TypeScript to JavaScript.
- Starts the NestJS server.
- Watches for file changes and auto-restarts.

**Expected output:**

```
[Nest] LOG [NestFactory] Starting Nest application...
[Nest] LOG [ChatGateway] 🚀 Initializing Socket.IO Gateway...
[Nest] LOG [RedisService] ✅ Successfully connected to Redis at localhost:6379
[Nest] LOG [ChatGateway] ✅ Socket.IO Redis adapter initialized
[Nest] LOG [ChatGateway] 🎉 Gateway initialization complete!
Server is running on http://localhost:5000
WebSocket server is listening on ws://localhost:5000
```

If you see `❌ Failed to initialize Redis adapter` but the server still starts, Redis is not running — that's okay for basic testing.

**Leave this terminal open.** The backend needs to keep running.

---

## Step 7: Install Frontend Dependencies

Open a **new terminal** and run:

```powershell
cd frontend
npm install
```

---

## Step 8: Configure Frontend Environment

The `.env.local` file should already exist at `frontend/.env.local` with:

```dotenv
NEXT_PUBLIC_API_URL=http://localhost:5000
```

This tells the frontend where the backend is. The port (5000) must match the backend's `PORT` in step 5.

**If this file doesn't exist, create it:**

```powershell
echo "NEXT_PUBLIC_API_URL=http://localhost:5000" > .env.local
```

---

## Step 9: Start the Frontend

```powershell
# Make sure you're in the frontend/ directory
npm run dev
```

This runs `next dev --turbopack`, which starts the Next.js development server with fast refresh.

**Expected output:**

```
  ▲ Next.js 15.5.4 (Turbopack)
  - Local:   http://localhost:3000
  - Network: http://192.168.x.x:3000
```

**Leave this terminal open too.**

---

## Step 10: Open the App

Open your browser and go to:

```
http://localhost:3000
```

You should see the SocketSphere (Anychat) login page:

- Left side: "Chat anywhere with anyone" branding.
- Right side: Username input + "Start chatting" button.

### Test the full flow:

1. **Enter a username** (e.g., "Alice") and click "Start chatting".
2. You'll be redirected to `/chat` and see the chat interface.
3. The status indicator should show a **green dot** with "Online".
4. **Send a message** by typing in the input field and clicking Send.
5. **Open a second browser tab** (or incognito window) to `http://localhost:3000`.
6. **Enter a different username** (e.g., "Bob") and join.
7. Send messages from both tabs — they should appear in real time in both windows.

---

## Quick Reference: Terminal Layout

You need **3 services running simultaneously**. Here's a summary:

| Terminal   | Directory       | Command                 | Port  |
| ---------- | --------------- | ----------------------- | ----- |
| Terminal 1 | (system)        | MongoDB service running | 27017 |
| Terminal 2 | (system)        | Redis service running   | 6379  |
| Terminal 3 | `socketsphere/` | `npm run start:dev`     | 5000  |
| Terminal 4 | `frontend/`     | `npm run dev`           | 3000  |

---

## Troubleshooting

### "Connection error" or "Connecting..." never changes to "Online"

**Cause:** The frontend can't reach the backend.

**Fix:**

1. Check the backend is running: open `http://localhost:5000` in your browser — you should see `"Hello World!"`.
2. Check `.env.local` has the correct URL: `NEXT_PUBLIC_API_URL=http://localhost:5000`.
3. Check the backend's CORS in `main.ts` includes the frontend's origin. The dev server runs on port 3000, and `main.ts` allows `http://localhost:3000`.
4. If you changed `.env.local`, **restart the frontend** (`Ctrl+C` then `npm run dev`). Environment variables are baked in at startup.

### "MongooseServerSelectionError: connect ECONNREFUSED"

**Cause:** MongoDB is not running.

**Fix:** Start MongoDB (see Step 2). Verify with `mongosh --eval "db.adminCommand('ping')"`.

### "Redis Client Error: connect ECONNREFUSED"

**Cause:** Redis is not running.

**Fix:** Start Redis (see Step 3). The backend will continue to work without Redis, but online tracking and message caching won't function.

### Frontend shows blank page or build errors

**Fix:**

```powershell
cd frontend
Remove-Item -Recurse -Force node_modules, .next
npm install
npm run dev
```

### Backend won't compile

**Fix:**

```powershell
cd socketsphere
Remove-Item -Recurse -Force node_modules, dist
npm install
npm run start:dev
```

### Port already in use

**Fix:**

```powershell
# Find what's using port 5000 (backend)
netstat -ano | findstr :5000
# Kill the process
Stop-Process -Id <PID> -Force

# Find what's using port 3000 (frontend)
netstat -ano | findstr :3000
Stop-Process -Id <PID> -Force
```

Or change the ports:

- Backend: Edit `socketsphere/.env` → `PORT=5001`
- Frontend: `NEXT_PUBLIC_API_URL=http://localhost:5001` in `frontend/.env.local`, then also update `main.ts` CORS origins.

---

## Running with Docker (Alternative)

If you prefer Docker over running everything manually:

```powershell
# From the root SocketSphere/ directory
docker-compose -f docker-compose.prod.yml up --build
```

This starts:

- Backend on `http://localhost:3000`
- Frontend on `http://localhost:3001`
- MongoDB on `localhost:27017`

> **Note:** The docker-compose file does NOT include Redis. To add Redis, you'd need to add a Redis service to the compose file. Without it, the backend runs in single-instance mode.

Open `http://localhost:3001` in your browser to use the app.

To stop:

```powershell
docker-compose -f docker-compose.prod.yml down
```

To stop and remove all data (fresh start):

```powershell
docker-compose -f docker-compose.prod.yml down -v
```

---

## Useful Commands Reference

### Backend (from `socketsphere/`)

| Command               | Description                                 |
| --------------------- | ------------------------------------------- |
| `npm run start:dev`   | Start in dev mode (auto-restart on changes) |
| `npm run start:debug` | Start in debug mode (attach debugger)       |
| `npm run build`       | Compile TypeScript to `dist/`               |
| `npm run start:prod`  | Run compiled code from `dist/`              |
| `npm test`            | Run unit tests                              |
| `npm run test:e2e`    | Run end-to-end tests                        |
| `npm run lint`        | Run ESLint                                  |
| `npm run format`      | Run Prettier                                |

### Frontend (from `frontend/`)

| Command         | Description                           |
| --------------- | ------------------------------------- |
| `npm run dev`   | Start dev server with Turbopack       |
| `npm run build` | Create production build               |
| `npm run start` | Start production server (after build) |
| `npm run lint`  | Run ESLint                            |

### Database

| Command                                                                             | Description                 |
| ----------------------------------------------------------------------------------- | --------------------------- |
| `mongosh`                                                                           | Open MongoDB shell          |
| `mongosh --eval "use nest-chat; db.users.find()"`                                   | View all users              |
| `mongosh --eval "use nest-chat; db.messages.find().sort({timestamp: -1}).limit(5)"` | View last 5 messages        |
| `mongosh --eval "use nest-chat; db.dropDatabase()"`                                 | **Delete all data** (reset) |
