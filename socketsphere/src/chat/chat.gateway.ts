import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { MessageService } from '../message/message.service';
import { UserService } from '../user/user.service';
import { RedisService } from '../redis/redis.service';
import { Logger } from '@nestjs/common';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  transports: ['websocket', 'polling'],
})
export class ChatGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);
  private userSockets = new Map<string, string>();
  private socketUsers = new Map<string, string>();
  private connectedUsers = new Map<string, any>();

  constructor(
    private readonly messageService: MessageService,
    private readonly userService: UserService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Initialize Socket.IO with Redis Adapter
   * This runs once when the gateway starts
   */
  async afterInit(server: Server) {
    this.logger.log('🚀 Initializing Socket.IO Gateway...');

    try {
      // Get Redis configuration from environment or use defaults
      const redisHost = process.env.REDIS_HOST || 'localhost';
      const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);
      const redisPassword = process.env.REDIS_PASSWORD || '';

      const redisUrl = redisPassword
        ? `redis://:${redisPassword}@${redisHost}:${redisPort}`
        : `redis://${redisHost}:${redisPort}`;

      this.logger.log(`📡 Connecting to Redis at ${redisHost}:${redisPort}...`);

      // Create two Redis clients: one for publishing, one for subscribing
      const pubClient = createClient({
        url: redisUrl,
        socket: {
          reconnectStrategy: (retries) => {
            if (retries > 10) {
              this.logger.error('❌ Max Redis reconnection attempts reached');
              return new Error('Too many retries');
            }
            return Math.min(retries * 50, 500);
          },
        },
      });

      // Duplicate the client for subscription
      const subClient = pubClient.duplicate();

      // Error handling for pub client
      pubClient.on('error', (err) => {
        this.logger.error('❌ Redis Pub Client Error:', err.message);
      });

      pubClient.on('connect', () => {
        this.logger.log('🔗 Redis Pub Client connecting...');
      });

      pubClient.on('ready', () => {
        this.logger.log('✅ Redis Pub Client ready');
      });

      // Error handling for sub client
      subClient.on('error', (err) => {
        this.logger.error('❌ Redis Sub Client Error:', err.message);
      });

      subClient.on('connect', () => {
        this.logger.log('🔗 Redis Sub Client connecting...');
      });

      subClient.on('ready', () => {
        this.logger.log('✅ Redis Sub Client ready');
      });

      // Connect both clients
      await Promise.all([pubClient.connect(), subClient.connect()]);

      this.logger.log('✅ Both Redis clients connected successfully');

      // Create and set the Redis adapter
      const redisAdapter = createAdapter(pubClient, subClient);
      server.adapter(redisAdapter);

      this.logger.log('✅ Socket.IO Redis adapter initialized');
      this.logger.log('🎉 Gateway initialization complete!');
      this.logger.log(
        '📊 Multiple server instances can now communicate via Redis',
      );
    } catch (error) {
      this.logger.error(
        '❌ Failed to initialize Redis adapter:',
        error.message,
      );
      this.logger.error(
        '⚠️ Continuing with default adapter (single server mode)',
      );
      // Don't throw - allow server to continue without Redis if needed
    }
  }

  /**
   * Handle new client connection
   */
  async handleConnection(client: Socket) {
    this.logger.log(`✅ Client connected: ${client.id}`);
    this.logger.log(`   Remote address: ${client.handshake.address}`);

    // Send connection confirmation immediately
    client.emit('connected', {
      message: 'Successfully connected to chat server',
      socketId: client.id,
      timestamp: new Date(),
    });

    // Send current online count
    const onlineCount = this.userSockets.size;
    client.emit('onlineCount', onlineCount);

    this.logger.log(`📤 Sent 'connected' event to client ${client.id}`);
  }

  /**
   * Handle client disconnection
   */
  async handleDisconnect(client: Socket) {
    this.logger.log(`❌ Client disconnected: ${client.id}`);

    const disconnectedUserId = this.socketUsers.get(client.id);

    if (disconnectedUserId) {
      // Remove from local maps
      this.userSockets.delete(disconnectedUserId);
      this.socketUsers.delete(client.id);
      const userData = this.connectedUsers.get(disconnectedUserId);
      this.connectedUsers.delete(disconnectedUserId);

      try {
        // Remove from Redis
        await this.redisService.removeOnlineUser(disconnectedUserId);
        await this.redisService.deleteUserSession(disconnectedUserId);

        // Update user status in database
        if (userData?._id) {
          await this.userService.updateStatus(userData._id, 'offline');
        }

        // Broadcast user left event to all servers
        this.server.emit('userLeft', {
          userId: disconnectedUserId,
          username: userData?.username,
          timestamp: new Date(),
        });

        // Update and broadcast online count
        const onlineCount = await this.redisService.getOnlineCount();
        this.server.emit('onlineCount', onlineCount);

        this.logger.log(
          `👋 User ${userData?.username} (${disconnectedUserId}) left`,
        );
      } catch (error) {
        this.logger.error(`❌ Error in disconnect handler:`, error.message);
      }
    }
  }

  /**
   * Handle user joining the chat
   */
  @SubscribeMessage('join')
  async handleJoin(
    @MessageBody() payload: { userId: string; username: string },
    @ConnectedSocket() client: Socket,
  ) {
    this.logger.log(`🚪 Join request: ${JSON.stringify(payload)}`);

    try {
      const { userId, username } = payload;

      // Validate payload
      if (!userId || !username) {
        const error = { message: 'userId and username are required' };
        this.logger.error(`❌ Join failed: Missing fields`);
        client.emit('error', error);
        return { success: false, error: error.message };
      }

      // Store in local maps
      this.userSockets.set(userId, client.id);
      this.socketUsers.set(client.id, userId);

      // Find or create user in database
      let dbUser: any = null;
      try {
        dbUser = await this.userService.findByUsername(username);

        if (!dbUser) {
          this.logger.log(`🔨 Creating new user: ${username}`);
          dbUser = await this.userService.createUser({ username });
          this.logger.log(`✅ User created with ID: ${dbUser._id}`);
        }

        // Update user status to online
        if (dbUser && dbUser._id) {
          await this.userService.updateStatus(dbUser._id.toString(), 'online');
        }
      } catch (error) {
        this.logger.warn(`⚠️ DB error (continuing anyway): ${error.message}`);
      }

      // Create user info object
      const userInfo = {
        userId,
        username,
        _id: dbUser?._id?.toString() || undefined,
        socketId: client.id,
        connectedAt: new Date(),
      };

      // Store in local map
      this.connectedUsers.set(userId, userInfo);

      // Store in Redis
      await this.redisService.addOnlineUser(userId, client.id);
      await this.redisService.setUserSession(userId, userInfo, 7200); // 2 hour TTL

      // Broadcast to ALL clients (across all servers via Redis)
      this.server.emit('userJoined', {
        userId,
        username,
        timestamp: new Date(),
      });

      // Send join success to the joining client
      client.emit('joinSuccess', {
        user: userInfo,
        message: 'Successfully joined chat',
      });

      // Get and broadcast online count from Redis
      const onlineCount = await this.redisService.getOnlineCount();
      this.server.emit('onlineCount', onlineCount);

      this.logger.log(`✅ User ${username} (${userId}) joined successfully`);
      this.logger.log(`📊 Online users: ${onlineCount}`);

      return { success: true, user: userInfo };
    } catch (error) {
      this.logger.error(`❌ Join error: ${error.message}`, error.stack);
      client.emit('error', {
        message: 'Failed to join chat',
        error: error.message,
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle sending a message
   */
  @SubscribeMessage('sendMessage')
  async handleSendMessage(
    @MessageBody() payload: { userId: string; text: string },
    @ConnectedSocket() client: Socket,
  ) {
    this.logger.log(`💬 Message received: ${JSON.stringify(payload)}`);

    try {
      const { userId, text } = payload;

      // Validate payload
      if (!userId || !text) {
        const error = { message: 'userId and text are required' };
        this.logger.error(`❌ Message failed: Missing fields`);
        client.emit('error', error);
        return { success: false, error: error.message };
      }

      // Get user data from local map or Redis
      let userData = this.connectedUsers.get(userId);

      if (!userData) {
        // Try to get from Redis if not in local map
        userData = await this.redisService.getUserSession(userId);

        if (!userData) {
          const error = { message: 'User not found. Please join first.' };
          this.logger.error(`❌ Message failed: User ${userId} not found`);
          client.emit('error', error);
          return { success: false, error: error.message };
        }

        // Store in local map for faster access
        this.connectedUsers.set(userId, userData);
      }

      // Prepare message data for WebSocket messages
      const messageData: any = {
        userId, // Custom user ID (e.g., "user_1760127880849_gq2a88d5j")
        username: userData.username, // Include username
        text: text.trim(),
        timestamp: new Date(),
      };

      // Only include MongoDB user ID if it exists and is valid
      if (userData._id) {
        messageData.userMongoId = userData._id;
      }

      const savedMessage = await this.messageService.createMessage(messageData);

      // Cache message in Redis (optional, for quick retrieval)
      await this.redisService.addMessageToCache(savedMessage, 50);

      // Broadcast to ALL clients (across all servers via Redis)
      this.server.emit('newMessage', savedMessage);

      this.logger.log(`✅ Message from ${userData.username} broadcasted`);

      return { success: true, message: savedMessage };
    } catch (error) {
      this.logger.error(`❌ Send message error: ${error.message}`, error.stack);
      client.emit('error', {
        message: 'Failed to send message',
        error: error.message,
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle request for recent messages
   */
  @SubscribeMessage('getRecentMessages')
  async handleGetRecentMessages(
    @MessageBody() payload: { limit?: number },
    @ConnectedSocket() client: Socket,
  ) {
    this.logger.log(`📜 Get recent messages request`);

    try {
      const limit = payload?.limit || 50;

      // Try to get from Redis cache first
      let messages = await this.redisService.getCachedMessages(limit);

      // If not in cache, get from database
      if (!messages || messages.length === 0) {
        this.logger.log('📂 Loading messages from database...');
        messages = await this.messageService.getRecentMessages(limit);

        // Cache for future requests
        if (messages.length > 0) {
          await this.redisService.cacheRecentMessages(messages, limit);
        }
      } else {
        this.logger.log('⚡ Loaded messages from Redis cache');
      }

      client.emit('recentMessages', {
        success: true,
        data: messages,
        count: messages.length,
      });

      this.logger.log(`✅ Sent ${messages.length} recent messages`);

      return { success: true, count: messages.length };
    } catch (error) {
      this.logger.error(`❌ Get recent messages error: ${error.message}`);
      client.emit('error', {
        message: 'Failed to get recent messages',
        error: error.message,
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle typing indicator
   */
  @SubscribeMessage('typing')
  handleTyping(
    @MessageBody() payload: { userId: string; username: string },
    @ConnectedSocket() client: Socket,
  ) {
    this.logger.log(`⌨️ User ${payload.username} is typing`);

    // Broadcast to all other clients (excluding sender)
    client.broadcast.emit('userTyping', {
      userId: payload.userId,
      username: payload.username,
    });

    return { success: true };
  }

  /**
   * Handle stop typing indicator
   */
  @SubscribeMessage('stopTyping')
  handleStopTyping(
    @MessageBody() payload: { userId: string },
    @ConnectedSocket() client: Socket,
  ) {
    this.logger.log(`⌨️ User ${payload.userId} stopped typing`);

    client.broadcast.emit('userStoppedTyping', {
      userId: payload.userId,
    });

    return { success: true };
  }

  /**
   * Handle get online users request
   */
  @SubscribeMessage('getOnlineUsers')
  async handleGetOnlineUsers(@ConnectedSocket() client: Socket) {
    this.logger.log(`👥 Get online users request`);

    try {
      // Get online user IDs from Redis
      const onlineUserIds = await this.redisService.getOnlineUsers();

      // Get user details from local map or Redis
      const onlineUsers: { userId: string; username: string; _id?: string }[] =
        [];

      for (const userId of onlineUserIds) {
        let userData = this.connectedUsers.get(userId);

        if (!userData) {
          userData = await this.redisService.getUserSession(userId);
        }

        if (userData) {
          onlineUsers.push({
            userId: userData.userId,
            username: userData.username,
            _id: userData._id,
          });
        }
      }

      client.emit('onlineUsers', {
        success: true,
        data: onlineUsers,
        count: onlineUsers.length,
      });

      this.logger.log(`✅ Sent ${onlineUsers.length} online users`);

      return { success: true };
    } catch (error) {
      this.logger.error(`❌ Get online users error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle user leaving the chat
   */
  @SubscribeMessage('leave')
  async handleLeave(
    @MessageBody() payload: { userId: string },
    @ConnectedSocket() client: Socket,
  ) {
    this.logger.log(`👋 Leave request from ${payload.userId}`);

    try {
      const { userId } = payload;

      // Remove from local maps
      this.userSockets.delete(userId);
      this.socketUsers.delete(client.id);
      const userData = this.connectedUsers.get(userId);
      this.connectedUsers.delete(userId);

      // Remove from Redis
      await this.redisService.removeOnlineUser(userId);
      await this.redisService.deleteUserSession(userId);

      // Update database
      if (userData?._id) {
        await this.userService.updateStatus(userData._id, 'offline');
      }

      // Broadcast to all servers
      this.server.emit('userLeft', {
        userId,
        username: userData?.username,
        timestamp: new Date(),
      });

      // Update online count
      const onlineCount = await this.redisService.getOnlineCount();
      this.server.emit('onlineCount', onlineCount);

      this.logger.log(`✅ User ${userData?.username} left successfully`);

      return { success: true };
    } catch (error) {
      this.logger.error(`❌ Leave error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
}
