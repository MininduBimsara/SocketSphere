import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, RedisClientType } from 'redis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: RedisClientType;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    const redisHost = this.configService.get<string>('REDIS_HOST', 'localhost');
    const redisPort = this.configService.get<number>('REDIS_PORT', 6379);
    const redisPassword = this.configService.get<string>('REDIS_PASSWORD', '');

    const redisUrl = redisPassword
      ? `redis://:${redisPassword}@${redisHost}:${redisPort}`
      : `redis://${redisHost}:${redisPort}`;

    this.client = createClient({
      url: redisUrl,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            this.logger.error('Max Redis reconnection attempts reached');
            return new Error('Max reconnection attempts reached');
          }
          const delay = Math.min(retries * 50, 2000);
          this.logger.warn(
            `Redis reconnecting in ${delay}ms... (attempt ${retries})`,
          );
          return delay;
        },
      },
    });

    this.client.on('error', (err) => {
      this.logger.error('Redis Client Error:', err.message);
    });

    this.client.on('connect', () => {
      this.logger.log('🔗 Connecting to Redis...');
    });

    this.client.on('ready', () => {
      this.logger.log('✅ Redis client is ready');
    });

    this.client.on('reconnecting', () => {
      this.logger.warn('⚠️ Redis client reconnecting...');
    });

    this.client.on('end', () => {
      this.logger.warn('❌ Redis connection closed');
    });

    try {
      await this.client.connect();
      this.logger.log(
        `✅ Successfully connected to Redis at ${redisHost}:${redisPort}`,
      );
    } catch (error) {
      this.logger.error('Failed to connect to Redis:', error.message);
      throw error;
    }
  }

  async onModuleDestroy() {
    if (this.client && this.client.isOpen) {
      await this.client.quit();
      this.logger.log('Redis connection closed');
    }
  }

  getClient(): RedisClientType {
    return this.client;
  }

  // ==================== USER SESSION MANAGEMENT ====================

  /**
   * Store user session data in Redis
   * @param userId - Unique user identifier
   * @param data - User session data (username, socketId, etc.)
   * @param ttl - Time to live in seconds (default: 1 hour)
   */
  async setUserSession(userId: string, data: any, ttl = 3600): Promise<void> {
    try {
      await this.client.setEx(`user:${userId}`, ttl, JSON.stringify(data));
      this.logger.debug(`User session saved: ${userId}`);
    } catch (error) {
      this.logger.error(
        `Failed to set user session for ${userId}:`,
        error.message,
      );
      throw error;
    }
  }

  /**
   * Retrieve user session data from Redis
   * @param userId - Unique user identifier
   * @returns User session data or null if not found
   */
  async getUserSession(userId: string): Promise<any> {
    try {
      const data = await this.client.get(`user:${userId}`);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      this.logger.error(
        `Failed to get user session for ${userId}:`,
        error.message,
      );
      return null;
    }
  }

  /**
   * Delete user session from Redis
   * @param userId - Unique user identifier
   */
  async deleteUserSession(userId: string): Promise<void> {
    try {
      await this.client.del(`user:${userId}`);
      this.logger.debug(`User session deleted: ${userId}`);
    } catch (error) {
      this.logger.error(
        `Failed to delete user session for ${userId}:`,
        error.message,
      );
    }
  }

  /**
   * Update user session TTL
   * @param userId - Unique user identifier
   * @param ttl - Time to live in seconds
   */
  async refreshUserSession(userId: string, ttl = 3600): Promise<void> {
    try {
      await this.client.expire(`user:${userId}`, ttl);
    } catch (error) {
      this.logger.error(
        `Failed to refresh user session for ${userId}:`,
        error.message,
      );
    }
  }

  // ==================== ONLINE USERS TRACKING ====================

  /**
   * Add user to online users hash
   * @param userId - Unique user identifier
   * @param socketId - Socket connection ID
   */
  async addOnlineUser(userId: string, socketId: string): Promise<void> {
    try {
      await this.client.hSet('online:users', userId, socketId);
      this.logger.debug(`User ${userId} marked as online`);
    } catch (error) {
      this.logger.error(`Failed to add online user ${userId}:`, error.message);
    }
  }

  /**
   * Remove user from online users hash
   * @param userId - Unique user identifier
   */
  async removeOnlineUser(userId: string): Promise<void> {
    try {
      await this.client.hDel('online:users', userId);
      this.logger.debug(`User ${userId} marked as offline`);
    } catch (error) {
      this.logger.error(
        `Failed to remove online user ${userId}:`,
        error.message,
      );
    }
  }

  /**
   * Get all online user IDs
   * @returns Array of online user IDs
   */
  async getOnlineUsers(): Promise<string[]> {
    try {
      return await this.client.hKeys('online:users');
    } catch (error) {
      this.logger.error('Failed to get online users:', error.message);
      return [];
    }
  }

  /**
   * Get socket ID for a specific user
   * @param userId - Unique user identifier
   * @returns Socket ID or null
   */
  async getUserSocketId(userId: string): Promise<string | null> {
    try {
      return await this.client.hGet('online:users', userId);
    } catch (error) {
      this.logger.error(
        `Failed to get socket ID for ${userId}:`,
        error.message,
      );
      return null;
    }
  }

  /**
   * Get total count of online users
   * @returns Number of online users
   */
  async getOnlineCount(): Promise<number> {
    try {
      return await this.client.hLen('online:users');
    } catch (error) {
      this.logger.error('Failed to get online count:', error.message);
      return 0;
    }
  }

  /**
   * Check if user is online
   * @param userId - Unique user identifier
   * @returns Boolean indicating online status
   */
  async isUserOnline(userId: string): Promise<boolean> {
    try {
       await this.client.hExists('online:users', userId)
       return true;
    } catch (error) {
      this.logger.error(
        `Failed to check if user ${userId} is online:`,
        error.message,
      );
      return false;
    }
  }

  // ==================== MESSAGE CACHING (OPTIONAL) ====================

  /**
   * Cache recent messages
   * @param messages - Array of messages to cache
   * @param limit - Maximum number of messages to keep
   */
  async cacheRecentMessages(messages: any[], limit = 50): Promise<void> {
    try {
      // Store as a list, keeping only the most recent
      const pipeline = this.client.multi();
      pipeline.del('messages:recent');

      messages.slice(-limit).forEach((msg) => {
        pipeline.rPush('messages:recent', JSON.stringify(msg));
      });

      await pipeline.exec();
      this.logger.debug(`Cached ${messages.length} recent messages`);
    } catch (error) {
      this.logger.error('Failed to cache messages:', error.message);
    }
  }

  /**
   * Get cached recent messages
   * @param limit - Number of messages to retrieve
   * @returns Array of cached messages
   */
  async getCachedMessages(limit = 50): Promise<any[]> {
    try {
      const messages = await this.client.lRange('messages:recent', -limit, -1);
      return messages.map((msg) => JSON.parse(msg));
    } catch (error) {
      this.logger.error('Failed to get cached messages:', error.message);
      return [];
    }
  }

  /**
   * Add a single message to cache
   * @param message - Message object to cache
   * @param maxLength - Maximum cache size
   */
  async addMessageToCache(message: any, maxLength = 50): Promise<void> {
    try {
      await this.client.rPush('messages:recent', JSON.stringify(message));
      await this.client.lTrim('messages:recent', -maxLength, -1);
    } catch (error) {
      this.logger.error('Failed to add message to cache:', error.message);
    }
  }

  // ==================== GENERIC KEY-VALUE OPERATIONS ====================

  /**
   * Set a key-value pair
   * @param key - Redis key
   * @param value - Value to store
   * @param ttl - Optional time to live in seconds
   */
  async set(key: string, value: string, ttl?: number): Promise<void> {
    try {
      if (ttl) {
        await this.client.setEx(key, ttl, value);
      } else {
        await this.client.set(key, value);
      }
    } catch (error) {
      this.logger.error(`Failed to set key ${key}:`, error.message);
      throw error;
    }
  }

  /**
   * Get value by key
   * @param key - Redis key
   * @returns Value or null
   */
  async get(key: string): Promise<string | null> {
    try {
      return await this.client.get(key);
    } catch (error) {
      this.logger.error(`Failed to get key ${key}:`, error.message);
      return null;
    }
  }

  /**
   * Delete a key
   * @param key - Redis key
   */
  async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch (error) {
      this.logger.error(`Failed to delete key ${key}:`, error.message);
    }
  }

  /**
   * Check if key exists
   * @param key - Redis key
   * @returns Boolean indicating existence
   */
  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      this.logger.error(
        `Failed to check existence of key ${key}:`,
        error.message,
      );
      return false;
    }
  }

  /**
   * Set expiration on a key
   * @param key - Redis key
   * @param seconds - Seconds until expiration
   */
  async expire(key: string, seconds: number): Promise<void> {
    try {
      await this.client.expire(key, seconds);
    } catch (error) {
      this.logger.error(
        `Failed to set expiration on key ${key}:`,
        error.message,
      );
    }
  }
}
