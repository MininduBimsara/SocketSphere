import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { MessageService } from '../message/message.service';
import { UserService } from '../user/user.service';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  transports: ['websocket', 'polling'],
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);
  private userSockets = new Map<string, string>();
  private socketUsers = new Map<string, string>();
  private connectedUsers = new Map<string, any>();

  constructor(
    private readonly messageService: MessageService,
    private readonly userService: UserService,
  ) {}

  async handleConnection(client: Socket) {
    this.logger.log(`✅ Client connected: ${client.id}`);

    // Send connection confirmation immediately
    client.emit('connected', {
      message: 'Successfully connected to chat server',
      socketId: client.id,
      timestamp: new Date(),
    });

    // Send online count
    const onlineCount = this.userSockets.size;
    client.emit('onlineCount', onlineCount);

    this.logger.log(`📤 Sent 'connected' event to client ${client.id}`);
  }

  async handleDisconnect(client: Socket) {
    this.logger.log(`❌ Client disconnected: ${client.id}`);

    const disconnectedUserId = this.socketUsers.get(client.id);

    if (disconnectedUserId) {
      this.userSockets.delete(disconnectedUserId);
      this.socketUsers.delete(client.id);
      const userData = this.connectedUsers.get(disconnectedUserId);
      this.connectedUsers.delete(disconnectedUserId);

      try {
        if (userData?._id) {
          await this.userService.updateStatus(userData._id, 'offline');
        }

        this.server.emit('userLeft', {
          userId: disconnectedUserId,
          username: userData?.username,
          timestamp: new Date(),
        });

        const onlineCount = this.userSockets.size;
        this.server.emit('onlineCount', onlineCount);

        this.logger.log(`👋 User ${userData?.username} left`);
      } catch (error) {
        this.logger.error(`Error in disconnect: ${error.message}`);
      }
    }
  }

  @SubscribeMessage('join')
  async handleJoin(
    @MessageBody() payload: { userId: string; username: string },
    @ConnectedSocket() client: Socket,
  ) {
    this.logger.log(`🚪 Join request received: ${JSON.stringify(payload)}`);

    try {
      const { userId, username } = payload;

      if (!userId || !username) {
        const error = { message: 'userId and username are required' };
        this.logger.error(`❌ Join failed: Missing fields`);
        client.emit('error', error);
        return { success: false, error: error.message };
      }

      this.userSockets.set(userId, client.id);
      this.socketUsers.set(client.id, userId);

      let dbUser: any = null;
      try {
        dbUser = await this.userService.findByUsername(username);

        if (!dbUser) {
          this.logger.log(`Creating new user: ${username}`);
          dbUser = await this.userService.createUser({ username });
          this.logger.log(`✅ User created with ID: ${dbUser._id}`);
        }

        if (dbUser && dbUser._id) {
          await this.userService.updateStatus(dbUser._id.toString(), 'online');
        }
      } catch (error) {
        this.logger.warn(`⚠️ DB error (continuing anyway): ${error.message}`);
      }

      const userInfo = {
        userId,
        username,
        _id: dbUser?._id?.toString() || undefined,
      };
      this.connectedUsers.set(userId, userInfo);

      // Emit to ALL clients including sender
      this.server.emit('userJoined', {
        userId,
        username,
        timestamp: new Date(),
      });

      // Emit to joining client
      client.emit('joinSuccess', {
        user: userInfo,
        message: 'Successfully joined chat',
      });

      // Update online count
      const onlineCount = this.userSockets.size;
      this.server.emit('onlineCount', onlineCount);

      this.logger.log(`✅ User ${username} joined successfully`);
      this.logger.log(`📤 Emitted: joinSuccess, userJoined, onlineCount`);

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

  @SubscribeMessage('sendMessage')
  async handleSendMessage(
    @MessageBody() payload: { userId: string; text: string },
    @ConnectedSocket() client: Socket,
  ) {
    this.logger.log(`💬 Message received: ${JSON.stringify(payload)}`);

    try {
      const { userId, text } = payload;

      if (!userId || !text) {
        const error = { message: 'userId and text are required' };
        this.logger.error(`❌ Message failed: Missing fields`);
        client.emit('error', error);
        return { success: false, error: error.message };
      }

      const userData = this.connectedUsers.get(userId);
      if (!userData) {
        const error = { message: 'You must join the chat first' };
        this.logger.error(`❌ Message failed: User ${userId} not joined`);
        client.emit('error', error);
        return { success: false, error: error.message };
      }

      this.logger.log(`💾 Saving message to DB...`);

      let savedMessage: any = null;
      if (userData._id) {
        try {
          savedMessage = await this.messageService.createMessage({
            userId: userData._id,
            text,
          });
          if (savedMessage && savedMessage._id) {
            this.logger.log(`✅ Message saved with ID: ${savedMessage._id}`);
          }
        } catch (error) {
          this.logger.error(`❌ DB save failed: ${error.message}`);
        }
      } else {
        this.logger.warn(`⚠️ User has no DB ID, message won't persist`);
      }

      const messageToSend = {
        _id: savedMessage?._id?.toString() || `temp_${Date.now()}`,
        userId: userId,
        username: userData.username,
        text: text,
        timestamp: new Date(),
        createdAt: savedMessage?.createdAt || new Date(),
      };

      // Broadcast to ALL clients (including sender)
      this.server.emit('newMessage', messageToSend);

      this.logger.log(`📤 Broadcast newMessage to all clients`);
      this.logger.log(`Message content: ${JSON.stringify(messageToSend)}`);

      return { success: true, message: messageToSend };
    } catch (error) {
      this.logger.error(`❌ Send message error: ${error.message}`, error.stack);
      client.emit('error', {
        message: 'Failed to send message',
        error: error.message,
      });
      return { success: false, error: error.message };
    }
  }

  @SubscribeMessage('getRecentMessages')
  async handleGetRecentMessages(
    @MessageBody() payload: { limit?: number },
    @ConnectedSocket() client: Socket,
  ) {
    this.logger.log(`📨 Get recent messages request`);

    try {
      const limit = payload?.limit || 50;
      const messages = await this.messageService.getRecentMessages(limit);

      client.emit('recentMessages', {
        success: true,
        data: messages,
        count: messages.length,
      });

      this.logger.log(`✅ Sent ${messages.length} recent messages`);

      return { success: true };
    } catch (error) {
      this.logger.error(`❌ Get messages error: ${error.message}`);
      client.emit('error', {
        message: 'Failed to get recent messages',
        error: error.message,
      });
      return { success: false, error: error.message };
    }
  }

  @SubscribeMessage('typing')
  handleTyping(
    @MessageBody() payload: { userId: string; username: string },
    @ConnectedSocket() client: Socket,
  ) {
    this.logger.log(`⌨️ User ${payload.username} is typing`);
    client.broadcast.emit('userTyping', {
      userId: payload.userId,
      username: payload.username,
    });
    return { success: true };
  }

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

  @SubscribeMessage('getOnlineUsers')
  async handleGetOnlineUsers(@ConnectedSocket() client: Socket) {
    this.logger.log(`👥 Get online users request`);

    try {
      const onlineUsers = Array.from(this.connectedUsers.values());

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

  @SubscribeMessage('leave')
  async handleLeave(
    @MessageBody() payload: { userId: string },
    @ConnectedSocket() client: Socket,
  ) {
    this.logger.log(`👋 Leave request from ${payload.userId}`);

    try {
      const { userId } = payload;

      this.userSockets.delete(userId);
      this.socketUsers.delete(client.id);

      const userData = this.connectedUsers.get(userId);
      this.connectedUsers.delete(userId);

      if (userData?._id) {
        await this.userService.updateStatus(userData._id, 'offline');
      }

      this.server.emit('userLeft', {
        userId,
        username: userData?.username,
        timestamp: new Date(),
      });

      const onlineCount = this.userSockets.size;
      this.server.emit('onlineCount', onlineCount);

      this.logger.log(`✅ User ${userData?.username} left successfully`);

      return { success: true };
    } catch (error) {
      this.logger.error(`❌ Leave error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
}
