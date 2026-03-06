# SocketSphere — Backend Deep Dive

> **Stack:** NestJS 11.1.6, Socket.IO, Mongoose 8.18, Redis 5.8, TypeScript 5  
> **Directory:** `socketsphere/`

---

## 1. What the Backend Does

The backend is a **NestJS** application that serves two purposes simultaneously:

1. **WebSocket Gateway** — Handles real-time events (join, send message, leave, etc.) via Socket.IO. This is the primary communication channel the frontend uses.
2. **REST API** — Provides traditional HTTP endpoints for users (`/users`) and messages (`/messages`). These exist for administrative use, debugging, or potential future integrations (the frontend chat does NOT use the REST API).

The backend connects to **MongoDB** for persistent storage and **Redis** for caching, session management, and cross-instance pub/sub.

---

## 2. Entry Point — `src/main.ts`

```ts
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: ["http://localhost:3001", "http://localhost:3000"],
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strip unknown properties from request bodies
      transform: true, // Auto-transform payloads to DTO class instances
      forbidNonWhitelisted: false,
    }),
  );

  const port = process.env.PORT || 3000;
  await app.listen(port);
}
```

**What happens at startup:**

1. NestJS creates the application from `AppModule`.
2. CORS is enabled for the frontend origins (ports 3000 and 3001).
3. A global `ValidationPipe` is applied so all incoming HTTP request bodies are automatically validated against their DTOs using `class-validator` decorators.
4. The server listens on the port from the `.env` file (default `5000` in the checked-in `.env`, fallback `3000` in code).

> **Note on ports:** The `.env` file sets `PORT=5000`, so in local development the backend actually runs on port 5000, not 3000. The frontend's `.env.local` is configured to match (`NEXT_PUBLIC_API_URL=http://localhost:5000`).

---

## 3. Module Architecture — `src/app.module.ts`

```ts
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ".env" }),
    RedisModule, // Global — available everywhere
    DatabaseModule, // Mongoose connection
    UserModule, // User CRUD
    MessageModule, // Message CRUD
    ChatModule, // WebSocket gateway
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```

**Module loading order matters:**

1. `ConfigModule` is loaded first with `isGlobal: true` so any module can inject `ConfigService` to read `.env` variables.
2. `RedisModule` is `@Global()` — it provides `RedisService` to all modules without explicit imports.
3. `DatabaseModule` establishes the MongoDB connection.
4. Feature modules (`UserModule`, `MessageModule`, `ChatModule`) load next.

**Module dependency graph:**

```
AppModule
├── ConfigModule (global)
├── RedisModule (global) → provides RedisService
├── DatabaseModule → provides MongooseModule connection
├── UserModule → provides UserService, UserController
├── MessageModule → provides MessageService, MessageController
└── ChatModule → depends on UserModule, MessageModule
    └── ChatGateway (injects MessageService, UserService, RedisService)
```

---

## 4. Database Module — `src/database/database.module.ts`

```ts
MongooseModule.forRootAsync({
  useFactory: (configService: ConfigService) => ({
    uri:
      configService.get<string>("MONGO_URI") ||
      "mongodb://127.0.0.1:27017/nest-chat",
    maxPoolSize: 50,
    minPoolSize: 10,
    maxIdleTimeMS: 30000,
    waitQueueTimeoutMS: 10000,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    family: 4, // IPv4 only
    retryWrites: true,
    retryReads: true,
  }),
});
```

**What this configures:**

- Connects to MongoDB using the `MONGO_URI` env var (default: `mongodb://127.0.0.1:27017/nest-chat`).
- Maintains a **connection pool** of 10-50 connections — this means multiple queries can run simultaneously without waiting.
- Sets timeouts to prevent hanging connections (5s for server selection, 45s for operations).
- Forces IPv4 to avoid IPv6 resolution issues on some systems.

---

## 5. User Module — `src/user/`

### 5.1 Schema — `schemas/user.schema.ts`

```ts
@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true, trim: true })
  username: string;

  @Prop({ default: "offline", enum: ["online", "offline"] })
  status: string;
}
```

- **`username`** — Required, unique, trimmed of whitespace. The unique constraint means Mongoose will throw error code `11000` if a duplicate is inserted.
- **`status`** — Either `"online"` or `"offline"`. Defaults to `"offline"`.
- **`timestamps: true`** — Mongoose automatically manages `createdAt` and `updatedAt` fields.

**Indexes:**

```ts
UserSchema.index({ username: 1 }); // Fast username lookups
UserSchema.index({ status: 1 }); // Filter by online/offline
UserSchema.index({ createdAt: -1 }); // Sort by newest
UserSchema.index({ updatedAt: -1 }); // Sort by recently active
```

### 5.2 DTO — `dto/create-user.dto.ts`

```ts
export class CreateUserDto {
  @IsNotEmpty({ message: "Username is required" })
  @IsString({ message: "Username must be a string" })
  @Length(3, 30, { message: "Username must be between 3 and 30 characters" })
  username: string;
}
```

This DTO is used by the `ValidationPipe` to validate incoming `POST /users` requests. If the username is missing, not a string, or outside 3-30 characters, NestJS returns a 400 error with the custom message.

### 5.3 Service — `user.service.ts`

The service contains all the database logic for users:

| Method                     | What it does                                                                                                    |
| -------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `createUser(dto)`          | Creates a new user in MongoDB. Catches duplicate username errors (code 11000) and throws a `ConflictException`. |
| `findAll()`                | Returns all users.                                                                                              |
| `findById(id)`             | Finds one user by MongoDB `_id`. Validates the ID format first. Throws `NotFoundException` if not found.        |
| `findByUsername(username)` | Finds one user by username. Returns `null` if not found (no exception).                                         |
| `updateStatus(id, status)` | Changes a user's status to `"online"` or `"offline"`.                                                           |
| `deleteUser(id)`           | Deletes a user by ID.                                                                                           |
| `getOnlineUsers()`         | Returns all users where `status === 'online'`.                                                                  |
| `usernameExists(username)` | Returns `true`/`false`.                                                                                         |
| `getUserCount()`           | Returns total count of users.                                                                                   |

**Important:** Every method that takes an `id` parameter validates it against the MongoDB ObjectId regex (`/^[0-9a-fA-F]{24}$/`). Invalid IDs get a `BadRequestException` instead of a Mongoose cast error.

### 5.4 Controller — `user.controller.ts`

Maps HTTP routes to service methods:

| Route                     | Method               | Service Call                           | Response                                |
| ------------------------- | -------------------- | -------------------------------------- | --------------------------------------- |
| `POST /users`             | `createUser()`       | `userService.createUser(dto)`          | `{ success: true, data: user }`         |
| `GET /users`              | `getAllUsers()`      | `userService.findAll()`                | `{ success: true, data: [...], count }` |
| `GET /users/online`       | `getOnlineUsers()`   | `userService.getOnlineUsers()`         | `{ success: true, data: [...], count }` |
| `GET /users/count`        | `getUserCount()`     | `userService.getUserCount()`           | `{ success: true, count }`              |
| `GET /users/:id`          | `getUserById()`      | `userService.findById(id)`             | `{ success: true, data: user }`         |
| `PATCH /users/:id/status` | `updateUserStatus()` | `userService.updateStatus(id, status)` | `{ success: true, data: user }`         |
| `DELETE /users/:id`       | `deleteUser()`       | `userService.deleteUser(id)`           | `{ success: true, data: user }`         |

All responses follow a consistent shape: `{ success: boolean, message?: string, data?: any, count?: number }`.

---

## 6. Message Module — `src/message/`

### 6.1 Schema — `schemas/message.schema.ts`

```ts
@Schema({ timestamps: true })
export class Message {
  @Prop({ type: Types.ObjectId, ref: "User", required: false })
  userId?: Types.ObjectId; // Link to User document (optional)

  @Prop({ required: false, trim: true })
  username?: string; // Denormalized username (for WebSocket messages)

  @Prop({ required: false })
  customUserId?: string; // Client-generated ID (e.g. "user_17601...")

  @Prop({ required: true, trim: true })
  text: string; // The actual message content

  @Prop({ default: Date.now })
  timestamp: Date;
}
```

**Why three user-identifier fields?**

This schema handles two different pathways for creating messages:

1. **REST API path:** `userId` is a MongoDB ObjectId that references the `User` collection. It can be `populate()`-d to get the username.
2. **WebSocket path:** The frontend sends a client-generated ID (like `user_1760127880849_gq2a88d5j`). This is NOT a valid ObjectId, so it goes into `customUserId`. The `username` is stored directly (denormalized) so the message is self-contained.

If the user exists in MongoDB AND connected via WebSocket, the `userId` (ObjectId) may also be set via `userMongoId`.

**Indexes:**

```ts
MessageSchema.index({ timestamp: -1 }); // Sort by time (most used)
MessageSchema.index({ userId: 1 }); // Find messages by user
MessageSchema.index({ customUserId: 1 }); // Find messages by WebSocket user
MessageSchema.index({ userId: 1, timestamp: -1 }); // User's messages by time
MessageSchema.index({ timestamp: -1, userId: 1 }); // Recent messages with user info
MessageSchema.index({ text: "text" }); // Full-text search on message content
```

### 6.2 Service — `message.service.ts`

| Method                                 | What it does                                                                                                                                                                |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createMessage(dto)`                   | **Dual-path creation.** If `dto.userId` is a valid ObjectId → REST API creation (populates user). Otherwise → WebSocket creation (stores username + customUserId directly). |
| `findAll(limit)`                       | Returns messages sorted newest-first, populated with user info.                                                                                                             |
| `getRecentMessages(limit)`             | Same as `findAll` but defaults to 50 messages.                                                                                                                              |
| `findById(id)`                         | Single message lookup with user population.                                                                                                                                 |
| `findByUserId(userId)`                 | All messages from a specific MongoDB user.                                                                                                                                  |
| `findByDateRange(start, end)`          | Messages within a time window.                                                                                                                                              |
| `deleteMessage(id)`                    | Delete one message.                                                                                                                                                         |
| `deleteByUserId(userId)`               | Delete all messages from a user.                                                                                                                                            |
| `getMessageCount()`                    | Total message count.                                                                                                                                                        |
| `getMessageCountByUser(userId)`        | Message count for a specific user.                                                                                                                                          |
| `searchMessages(searchText, limit)`    | Regex-based case-insensitive text search.                                                                                                                                   |
| `getPaginatedMessages(page, pageSize)` | Paginated results with metadata (totalPages, currentPage).                                                                                                                  |

**The `createMessage` dual-path logic explained:**

```ts
async createMessage(createMessageDto) {
  const isValidObjectId = Types.ObjectId.isValid(dto.userId)
    && dto.userId.match(/^[0-9a-fA-F]{24}$/);

  if (isValidObjectId) {
    // REST API: userId is a real MongoDB ObjectId
    // → Store as ObjectId reference, populate user info
  } else {
    // WebSocket: userId is "user_17601..." (not an ObjectId)
    // → Store userId as null, save username + customUserId as strings
    // → If userMongoId provided (user exists in DB), also set userId
  }
}
```

### 6.3 Controller — `message.controller.ts`

| Route                          | Method                  | Description |
| ------------------------------ | ----------------------- | ----------- |
| `POST /messages`               | Create a message (REST) |
| `GET /messages?limit=N`        | Get all messages        |
| `GET /messages/recent?limit=N` | Get recent messages     |
| `GET /messages/count`          | Get total count         |
| `GET /messages/:id`            | Get one message         |
| `DELETE /messages/:id`         | Delete one message      |

---

## 7. Redis Module — `src/redis/`

### 7.1 Module — `redis.module.ts`

```ts
@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
```

The `@Global()` decorator means any module in the app can inject `RedisService` without importing `RedisModule`. This is intentional — Redis is a cross-cutting concern used by the Chat Gateway.

### 7.2 Service — `redis.service.ts`

This is a large service (383 lines) that wraps the `redis` npm package. It connects on module initialization and disconnects on destruction.

**Connection setup (`onModuleInit`):**

```ts
const redisUrl = redisPassword
  ? `redis://:${redisPassword}@${redisHost}:${redisPort}`
  : `redis://${redisHost}:${redisPort}`;

this.client = createClient({
  url: redisUrl,
  socket: {
    reconnectStrategy: (retries) => {
      if (retries > 10) return new Error("Max retries");
      return Math.min(retries * 50, 2000); // Exponential backoff, max 2s
    },
  },
});
```

Reads `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` from env (defaults: `localhost`, `6379`, empty).

**The service provides four categories of operations:**

#### Category 1: User Session Management

| Method                              | Redis Key       | Description                                   |
| ----------------------------------- | --------------- | --------------------------------------------- |
| `setUserSession(userId, data, ttl)` | `user:{userId}` | Store JSON session data with TTL (default 1h) |
| `getUserSession(userId)`            | `user:{userId}` | Retrieve and parse session data               |
| `deleteUserSession(userId)`         | `user:{userId}` | Remove session                                |
| `refreshUserSession(userId, ttl)`   | `user:{userId}` | Reset TTL without changing data               |

Session data typically includes: `{ userId, username, _id, socketId, connectedAt }`.

#### Category 2: Online User Tracking

| Method                            | Redis Key             | Description                             |
| --------------------------------- | --------------------- | --------------------------------------- |
| `addOnlineUser(userId, socketId)` | `online:users` (Hash) | `HSET online:users <userId> <socketId>` |
| `removeOnlineUser(userId)`        | `online:users` (Hash) | `HDEL online:users <userId>`            |
| `getOnlineUsers()`                | `online:users` (Hash) | `HKEYS online:users` → array of userIds |
| `getUserSocketId(userId)`         | `online:users` (Hash) | `HGET online:users <userId>`            |
| `getOnlineCount()`                | `online:users` (Hash) | `HLEN online:users`                     |
| `isUserOnline(userId)`            | `online:users` (Hash) | `HEXISTS online:users <userId>`         |

**Why a Hash?** A Redis Hash maps userId → socketId in a single key. This is memory-efficient and allows O(1) lookups, additions, and removals.

#### Category 3: Message Caching

| Method                                  | Redis Key                | Description                                              |
| --------------------------------------- | ------------------------ | -------------------------------------------------------- |
| `cacheRecentMessages(messages, limit)`  | `messages:recent` (List) | Replaces entire cache with `DEL` + `RPUSH` in a pipeline |
| `getCachedMessages(limit)`              | `messages:recent` (List) | `LRANGE messages:recent -limit -1`                       |
| `addMessageToCache(message, maxLength)` | `messages:recent` (List) | `RPUSH` + `LTRIM` to cap at maxLength                    |

The message cache stores up to 50 serialized JSON messages. When a new user joins and requests recent messages, the backend checks this cache before hitting MongoDB.

#### Category 4: Generic Key-Value Operations

| Method                  | Description             |
| ----------------------- | ----------------------- |
| `set(key, value, ttl?)` | Generic SET / SETEX     |
| `get(key)`              | Generic GET             |
| `del(key)`              | Generic DEL             |
| `exists(key)`           | Generic EXISTS          |
| `expire(key, seconds)`  | Set TTL on existing key |

These are utility methods available for future features.

### 7.3 Config — `config/redis.config.ts`

A helper function that reads Redis env vars and returns a config object:

```ts
export const getRedisConfig = (configService: ConfigService) => ({
  host: configService.get("REDIS_HOST", "localhost"),
  port: configService.get("REDIS_PORT", 6379),
  password: configService.get("REDIS_PASSWORD", ""),
  retryStrategy: (times) => Math.min(times * 50, 2000),
});
```

> **Note:** This config helper is defined but NOT currently used by the `RedisService` (which builds its own URL). It exists as a utility for potential future use (e.g., with ioredis).

---

## 8. Chat Module — `src/chat/` (The Core)

### 8.1 Module — `chat.module.ts`

```ts
@Module({
  imports: [MessageModule, UserModule], // Needs both services
  providers: [ChatGateway],
  exports: [ChatGateway],
})
export class ChatModule {}
```

Note: `RedisModule` is NOT imported here because it's `@Global()`. The `ChatGateway` can still inject `RedisService`.

### 8.2 Gateway — `chat.gateway.ts` (539 lines — the biggest file)

This is the **heart of the entire application**. The `ChatGateway` class implements three NestJS WebSocket lifecycle interfaces:

```ts
@WebSocketGateway({
  cors: { origin: '*', credentials: true },
  transports: ['websocket', 'polling'],
})
export class ChatGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
```

- **`@WebSocketGateway`** decorator tells NestJS this class handles WebSocket connections. CORS is wide open (`origin: '*'`) on the WebSocket side.
- **`OnGatewayInit`** → `afterInit()` — runs once when the server starts.
- **`OnGatewayConnection`** → `handleConnection()` — runs for each new client.
- **`OnGatewayDisconnect`** → `handleDisconnect()` — runs when a client drops.

#### In-Memory State

```ts
private userSockets = new Map<string, string>();    // userId → socketId
private socketUsers = new Map<string, string>();    // socketId → userId
private connectedUsers = new Map<string, any>();    // userId → full user info object
```

These three Maps provide O(1) lookups for the most common operations:

- When a message comes in: look up user info by `userId` → `connectedUsers`.
- When a disconnect happens: look up which user owned that socket → `socketUsers`.
- When checking if a user is connected: look up their socket → `userSockets`.

> **Limitation:** These Maps are local to one server instance. If you scale to multiple backend instances, each has its own Maps. That's why Redis is also used — it's the shared source of truth.

#### `afterInit(server)` — Redis Adapter Setup

This method runs once at startup and sets up the **Socket.IO Redis Adapter**:

```ts
// Create two Redis clients
const pubClient = createClient({ url: redisUrl, ... });
const subClient = pubClient.duplicate();

await Promise.all([pubClient.connect(), subClient.connect()]);

// Wire them into Socket.IO
const redisAdapter = createAdapter(pubClient, subClient);
server.adapter(redisAdapter);
```

**What the Redis Adapter does:** When you call `this.server.emit('newMessage', data)` on Server Instance A, the adapter publishes the event to Redis. Server Instance B subscribes to Redis and re-emits the event to its own connected clients. This is how horizontal scaling works.

**Graceful degradation:** The entire Redis adapter setup is wrapped in try/catch. If Redis is down, the server logs an error and continues with the default in-memory adapter (single-server mode).

#### `handleConnection(client)` — New Client Connects

```ts
async handleConnection(client: Socket) {
  client.emit('connected', {
    message: 'Successfully connected to chat server',
    socketId: client.id,
    timestamp: new Date(),
  });
  client.emit('onlineCount', this.userSockets.size);
}
```

Simply acknowledges the connection and sends the current online user count. No authentication or validation at this stage.

#### `handleDisconnect(client)` — Client Disconnects

```ts
async handleDisconnect(client: Socket) {
  const disconnectedUserId = this.socketUsers.get(client.id);
  if (disconnectedUserId) {
    // 1. Remove from local Maps
    // 2. Remove from Redis (online users + session)
    // 3. Update MongoDB status to 'offline'
    // 4. Broadcast 'userLeft' to all clients
    // 5. Broadcast updated 'onlineCount'
  }
}
```

This handles both intentional navigation away and unexpected disconnects (network drop, tab close, etc.).

#### `@SubscribeMessage('join')` — User Joins Chat

This is the most complex handler. Step by step:

1. **Validate payload** — userId and username must be present.
2. **Store in local Maps** — userSockets, socketUsers.
3. **Find or create MongoDB user:**
   ```ts
   let dbUser = await this.userService.findByUsername(username);
   if (!dbUser) {
     dbUser = await this.userService.createUser({ username });
   }
   await this.userService.updateStatus(dbUser._id.toString(), "online");
   ```
4. **Build user info object:**
   ```ts
   const userInfo = {
     userId, // Client-generated ("user_17601...")
     username,
     _id: dbUser?._id?.toString(), // MongoDB ObjectId
     socketId: client.id,
     connectedAt: new Date(),
   };
   ```
5. **Store in Redis:**
   ```ts
   await this.redisService.addOnlineUser(userId, client.id);
   await this.redisService.setUserSession(userId, userInfo, 7200); // 2-hour TTL
   ```
6. **Broadcast events:**
   ```ts
   this.server.emit("userJoined", { userId, username, timestamp });
   client.emit("joinSuccess", {
     user: userInfo,
     message: "Successfully joined",
   });
   this.server.emit("onlineCount", onlineCount);
   ```

**Error handling:** DB operations are wrapped in try/catch with `warn` logging. If MongoDB is down, the join still succeeds (the user can chat, but their messages won't have a MongoDB user reference).

#### `@SubscribeMessage('sendMessage')` — Send a Message

1. **Validate** — userId and text must be present.
2. **Look up user data** — First checks local `connectedUsers` Map, then Redis session as fallback. If neither has the user, returns an error ("Please join first").
3. **Build message data:**
   ```ts
   const messageData = {
     userId, // Client-generated ID
     username: userData.username,
     text: text.trim(),
     timestamp: new Date(),
     userMongoId: userData._id, // MongoDB ObjectId (if exists)
   };
   ```
4. **Save to MongoDB** via `messageService.createMessage()`.
5. **Cache in Redis** via `redisService.addMessageToCache()`.
6. **Broadcast** via `this.server.emit('newMessage', savedMessage)` — goes to ALL connected clients on ALL server instances (via Redis adapter).

#### `@SubscribeMessage('getRecentMessages')` — Fetch History

```ts
// 1. Try Redis cache first (fast)
let messages = await this.redisService.getCachedMessages(limit);

// 2. Fallback to MongoDB (slower but complete)
if (!messages || messages.length === 0) {
  messages = await this.messageService.getRecentMessages(limit);
  // Re-populate cache for next time
  await this.redisService.cacheRecentMessages(messages, limit);
}

// 3. Send to requesting client only
client.emit("recentMessages", {
  success: true,
  data: messages,
  count: messages.length,
});
```

This is a classic **cache-aside** pattern: check cache → miss → fetch from DB → populate cache.

#### `@SubscribeMessage('typing')` / `@SubscribeMessage('stopTyping')` — Typing Indicators

```ts
handleTyping(payload, client) {
  client.broadcast.emit('userTyping', { userId, username });
}
```

Uses `client.broadcast.emit()` instead of `this.server.emit()` — this sends to everyone EXCEPT the sender (you don't need to see your own typing indicator).

#### `@SubscribeMessage('getOnlineUsers')` — List Online Users

1. Gets online user IDs from Redis (`getOnlineUsers()`).
2. For each ID, looks up user info from local Map or Redis session.
3. Sends the populated list to the requesting client.

#### `@SubscribeMessage('leave')` — User Leaves

Same cleanup as `handleDisconnect` but triggered intentionally by the frontend's "Leave" button. Cleans up local Maps, Redis, MongoDB status, and broadcasts to all.

---

## 9. Environment Variables — `.env`

```dotenv
MONGO_URI=mongodb://127.0.0.1:27017/nest-chat
PORT=5000
NODE_ENV=development
CORS_ORIGIN=http://localhost:3001,http://localhost:3000
LOG_LEVEL=debug
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
```

| Variable         | Used By                                                 | Description                           |
| ---------------- | ------------------------------------------------------- | ------------------------------------- |
| `MONGO_URI`      | DatabaseModule                                          | MongoDB connection string             |
| `PORT`           | main.ts                                                 | HTTP + WebSocket server port          |
| `NODE_ENV`       | DatabaseModule                                          | Enables command monitoring in dev     |
| `CORS_ORIGIN`    | (defined but not read — CORS is hardcoded in main.ts)   |
| `LOG_LEVEL`      | (defined but not read — NestJS Logger doesn't use this) |
| `REDIS_HOST`     | RedisService + ChatGateway                              | Redis server hostname                 |
| `REDIS_PORT`     | RedisService + ChatGateway                              | Redis server port                     |
| `REDIS_PASSWORD` | RedisService + ChatGateway                              | Redis auth password (empty = no auth) |

> **Note:** `CORS_ORIGIN` and `LOG_LEVEL` are defined in `.env` but not actually consumed by any code. The CORS origins are hardcoded in `main.ts`.

---

## 10. Docker Build — `Dockerfile`

Three-stage build:

| Stage     | Purpose                                                                                             |
| --------- | --------------------------------------------------------------------------------------------------- |
| `deps`    | Install production-only dependencies (`npm ci --only=production`)                                   |
| `builder` | Install ALL dependencies, copy source, run `npm run build` (compiles TypeScript to `dist/`)         |
| `runner`  | Copy `dist/` folder + production `node_modules` from previous stages, run as non-root `nestjs` user |

**Final image contents:**

```
/app/
├── dist/          # Compiled JavaScript
├── node_modules/  # Production dependencies only
└── package.json
```

Exposed on port 3000 (the Dockerfile default) with the command `node dist/main`.

---

## 11. Testing

### Unit Tests

- `src/app.controller.spec.ts` — Tests the `AppController.getHello()` method.
- Run with: `npm test`

### E2E Tests

- `test/app.e2e-spec.ts` — Tests the `GET /` HTTP endpoint.
- Config: `test/jest-e2e.json`
- Run with: `npm run test:e2e`

### Manual Testing

- `test-socket.js` — A standalone Socket.IO client script in the project root for manual WebSocket testing.

---

## 12. Flow Summary: What Happens When a Message Is Sent

```
Frontend                          ChatGateway                     Services                Redis              MongoDB
────────                          ───────────                     ────────                ─────              ───────

emit('sendMessage',              @SubscribeMessage('sendMessage')
  {userId, text})  ──────────►   handleSendMessage()
                                  │
                                  ├─ connectedUsers.get(userId)
                                  │   (or redisService             ◄─── getUserSession()
                                  │    .getUserSession())
                                  │
                                  ├─ messageService
                                  │   .createMessage(data) ───────────────────────────────────────► messages.insert()
                                  │       ◄── savedMessage ──────────────────────────────────────── (returns doc)
                                  │
                                  ├─ redisService
                                  │   .addMessageToCache(msg) ──────── RPUSH + LTRIM ───►
                                  │
                                  └─ server.emit('newMessage',
                                       savedMessage)  ──────────────── PUB via adapter ──►
                                        │
     ◄─── newMessage event ─────────────┘ (to ALL clients, ALL server instances)
     setMessages(prev => [...prev, msg])
```

---

## 13. Common Questions

**Q: Why does the Chat Gateway create its own Redis clients separately from RedisService?**  
A: The Socket.IO Redis Adapter requires two dedicated Redis connections (pub + sub) that it manages internally. These are separate from the general-purpose RedisService client. The adapter clients exist solely for Socket.IO's internal pub/sub protocol, while RedisService handles application-level caching and queries.

**Q: Why are there three Maps AND Redis for user tracking?**  
A: In-memory Maps provide microsecond lookups for the hot path (message sending). Redis provides persistence and cross-instance sharing. If a user's data isn't in the local Map (e.g., after a server restart), the gateway falls back to Redis.

**Q: What happens if MongoDB is down?**  
A: The join handler wraps DB operations in try/catch with `warn` logging. The user can still join and chat (messages are broadcast via WebSocket), but messages won't be persisted. The `MessageService.createMessage()` call would throw, causing the `sendMessage` handler to emit an error event to the client.

**Q: What happens if Redis is down?**  
A: The Redis adapter setup fails gracefully (logged as error, server continues). `RedisService` operations will throw errors that propagate up. The gateway's error handling catches most of these, but some features (online tracking, message caching) won't work. Core messaging still works via MongoDB.
