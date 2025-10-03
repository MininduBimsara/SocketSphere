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
import { Logger, UsePipes, ValidationPipe } from '@nestjs/common';
import { CreateMessageDto } from '../message/dto/create-message.dto';

@WebSocketGateway({
  cors: {
    origin: ['http://localhost:3001', 'http://localhost:3000'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);

  // Store userId -> socketId mapping
  private userSockets = new Map<string, string>();

  constructor(
    private readonly messageService: MessageService,
    private readonly userService: UserService,
  ) {}

  /**
   * Handle client connection
   */
  async handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);

    // Send connection confirmation
    client.emit('connected', {
      message: 'Successfully connected to chat server',
      socketId: client.id,
      timestamp: new Date(),
    });

    // Send online users count
    const onlineCount = this.userSockets.size;
    this.server.emit('onlineCount', onlineCount);
  }

  /**
   * Handle client disconnection
   */
  async handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);

    // Find and remove user from online list
    let disconnectedUserId: string | null = null;
    for (const [userId, socketId] of this.userSockets) {
      if (socketId === client.id) {
        disconnectedUserId = userId;
        break;
      }
    }

    if (disconnectedUserId) {
      this.userSockets.delete(disconnectedUserId);

      try {
        // Update user status to offline
        await this.userService.updateStatus(disconnectedUserId, 'offline');

        // Broadcast to all clients that user left
        this.server.emit('userLeft', {
          userId: disconnectedUserId,
          timestamp: new Date(),
        });

        // Send updated online count
        const onlineCount = this.userSockets.size;
        this.server.emit('onlineCount', onlineCount);

        this.logger.log(`User ${disconnectedUserId} disconnected`);
      } catch (error) {
        this.logger.error(
          `Error handling disconnect for user ${disconnectedUserId}: ${error.message}`,
        );
      }
    }
  }

  /**
   * Handle user joining the chat
   * Client sends: { userId: string, username: string }
   */
  @SubscribeMessage('join')
  async handleJoin(
    @MessageBody() payload: { userId: string; username: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const { userId, username } = payload;

      if (!userId || !username) {
        client.emit('error', {
          message: 'userId and username are required',
        });
        return { success: false, error: 'Missing required fields' };
      }

      // Store socket mapping
      this.userSockets.set(userId, client.id);

      // Get or create user
      let user = await this.userService.findById(userId).catch(() => null);

      if (!user) {
        // Create new user if doesn't exist
        user = await this.userService.createUser({ username });
      }

      // Update user status to online
      await this.userService.updateStatus(userId, 'online');

      // Broadcast to all clients that user joined
      this.server.emit('userJoined', {
        userId,
        username,
        timestamp: new Date(),
      });

      // Send to the joining user their info
      client.emit('joinSuccess', {
        user: {
          _id: user._id,
          username: user.username,
          status: 'online',
        },
      });

      // Send updated online count
      const onlineCount = this.userSockets.size;
      this.server.emit('onlineCount', onlineCount);

      this.logger.log(`User ${username} (${userId}) joined the chat`);

      return { success: true, user };
    } catch (error) {
      this.logger.error(`Join error: ${error.message}`, error.stack);
      client.emit('error', {
        message: 'Failed to join chat',
        error: error.message,
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle sending a message
   * Client sends: { userId: string, text: string }
   */
  @SubscribeMessage('sendMessage')
  @UsePipes(new ValidationPipe({ transform: true }))
  async handleSendMessage(
    @MessageBody() createMessageDto: CreateMessageDto,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      if (!createMessageDto.userId || !createMessageDto.text) {
        client.emit('error', {
          message: 'userId and text are required',
        });
        return { success: false, error: 'Missing required fields' };
      }

      // Save message to database
      const message = await this.messageService.createMessage(createMessageDto);

      // Broadcast message to ALL connected clients
      this.server.emit('newMessage', {
        _id: message._id,
        userId: message.userId,
        text: message.text,
        timestamp: message.timestamp,
        createdAt: message.createdAt,
      });

      this.logger.log(`Message sent by user ${createMessageDto.userId}`);

      return { success: true, message };
    } catch (error) {
      this.logger.error(`Send message error: ${error.message}`, error.stack);
      client.emit('error', {
        message: 'Failed to send message',
        error: error.message,
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle getting recent messages
   * Client sends: { limit?: number }
   */
  @SubscribeMessage('getRecentMessages')
  async handleGetRecentMessages(
    @MessageBody() payload: { limit?: number },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const limit = payload?.limit || 50;
      const messages = await this.messageService.getRecentMessages(limit);

      client.emit('recentMessages', {
        success: true,
        data: messages,
        count: messages.length,
      });

      return { success: true };
    } catch (error) {
      this.logger.error(
        `Get recent messages error: ${error.message}`,
        error.stack,
      );
      client.emit('error', {
        message: 'Failed to get recent messages',
        error: error.message,
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle typing indicator
   * Client sends: { userId: string, username: string }
   */
  @SubscribeMessage('typing')
  handleTyping(
    @MessageBody() payload: { userId: string; username: string },
    @ConnectedSocket() client: Socket,
  ) {
    // Broadcast to everyone except the sender
    client.broadcast.emit('userTyping', {
      userId: payload.userId,
      username: payload.username,
    });

    return { success: true };
  }

  /**
   * Handle stop typing indicator
   * Client sends: { userId: string }
   */
  @SubscribeMessage('stopTyping')
  handleStopTyping(
    @MessageBody() payload: { userId: string },
    @ConnectedSocket() client: Socket,
  ) {
    client.broadcast.emit('userStoppedTyping', {
      userId: payload.userId,
    });

    return { success: true };
  }

  /**
   * Handle getting online users
   */
  @SubscribeMessage('getOnlineUsers')
  async handleGetOnlineUsers(@ConnectedSocket() client: Socket) {
    try {
      const onlineUsers = await this.userService.getOnlineUsers();

      client.emit('onlineUsers', {
        success: true,
        data: onlineUsers,
        count: onlineUsers.length,
      });

      return { success: true };
    } catch (error) {
      this.logger.error(
        `Get online users error: ${error.message}`,
        error.stack,
      );
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle user leaving the chat
   * Client sends: { userId: string }
   */
  @SubscribeMessage('leave')
  async handleLeave(
    @MessageBody() payload: { userId: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const { userId } = payload;

      // Remove from socket mapping
      this.userSockets.delete(userId);

      // Update user status to offline
      await this.userService.updateStatus(userId, 'offline');

      // Broadcast to all clients that user left
      this.server.emit('userLeft', {
        userId,
        timestamp: new Date(),
      });

      // Broadcast user status changed
      this.server.emit('userStatusChanged', {
        userId,
        status: 'offline',
      });

      // Send updated online count
      const onlineCount = this.userSockets.size;
      this.server.emit('onlineCount', onlineCount);

      this.logger.log(`User ${userId} left the chat`);

      return { success: true };
    } catch (error) {
      this.logger.error(`Leave error: ${error.message}`, error.stack);
      return { success: false, error: error.message };
    }
  }
}
