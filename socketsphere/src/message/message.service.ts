import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Message, MessageDocument } from './schemas/message.schema';
import { CreateMessageDto } from './dto/create-message.dto';

@Injectable()
export class MessageService {
  constructor(
    @InjectModel(Message.name) private messageModel: Model<MessageDocument>,
  ) {}

  /**
   * Create and save a new message
   * @param createMessageDto - DTO containing userId and text
   * @returns Created message document with populated user info
   */
  async createMessage(
    createMessageDto: CreateMessageDto,
  ): Promise<MessageDocument> {
    const newMessage = new this.messageModel({
      userId: new Types.ObjectId(createMessageDto.userId),
      text: createMessageDto.text,
      timestamp: new Date(),
    });

    const savedMessage = await newMessage.save();

    // Populate user information before returning
    return await savedMessage.populate('userId', 'username status');
  }

  /**
   * Get all messages (with user info populated)
   * @param limit - Optional limit for number of messages (default: 100)
   * @returns Array of messages with user information
   */
  async findAll(limit: number = 100): Promise<MessageDocument[]> {
    return await this.messageModel
      .find()
      .sort({ timestamp: -1 }) // Most recent first
      .limit(limit)
      .populate('userId', 'username status')
      .exec();
  }

  /**
   * Get recent messages (sorted by timestamp, newest first)
   * @param limit - Number of messages to retrieve (default: 50)
   * @returns Array of recent messages
   */
  async getRecentMessages(limit: number = 50): Promise<MessageDocument[]> {
    return await this.messageModel
      .find()
      .sort({ timestamp: -1 })
      .limit(limit)
      .populate('userId', 'username status')
      .exec();
  }

  /**
   * Find message by ID
   * @param id - Message's MongoDB ObjectId
   * @returns Message document with user info
   * @throws NotFoundException if message not found
   */
  async findById(id: string): Promise<MessageDocument> {
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      throw new BadRequestException('Invalid message ID format');
    }

    const message = await this.messageModel
      .findById(id)
      .populate('userId', 'username status')
      .exec();

    if (!message) {
      throw new NotFoundException(`Message with ID ${id} not found`);
    }

    return message;
  }

  /**
   * Get all messages from a specific user
   * @param userId - User's MongoDB ObjectId
   * @returns Array of messages from that user
   */
  async findByUserId(userId: string): Promise<MessageDocument[]> {
    if (!userId.match(/^[0-9a-fA-F]{24}$/)) {
      throw new BadRequestException('Invalid user ID format');
    }

    return await this.messageModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ timestamp: -1 })
      .populate('userId', 'username status')
      .exec();
  }

  /**
   * Get messages within a time range
   * @param startDate - Start date
   * @param endDate - End date
   * @returns Array of messages in time range
   */
  async findByDateRange(
    startDate: Date,
    endDate: Date,
  ): Promise<MessageDocument[]> {
    return await this.messageModel
      .find({
        timestamp: {
          $gte: startDate,
          $lte: endDate,
        },
      })
      .sort({ timestamp: -1 })
      .populate('userId', 'username status')
      .exec();
  }

  /**
   * Delete a message by ID
   * @param id - Message's MongoDB ObjectId
   * @returns Deleted message document
   * @throws NotFoundException if message not found
   */
  async deleteMessage(id: string): Promise<MessageDocument> {
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      throw new BadRequestException('Invalid message ID format');
    }

    const message = await this.messageModel.findByIdAndDelete(id).exec();

    if (!message) {
      throw new NotFoundException(`Message with ID ${id} not found`);
    }

    return message;
  }

  /**
   * Delete all messages from a specific user
   * @param userId - User's MongoDB ObjectId
   * @returns Number of deleted messages
   */
  async deleteByUserId(userId: string): Promise<number> {
    if (!userId.match(/^[0-9a-fA-F]{24}$/)) {
      throw new BadRequestException('Invalid user ID format');
    }

    const result = await this.messageModel
      .deleteMany({ userId: new Types.ObjectId(userId) })
      .exec();

    return result.deletedCount;
  }

  /**
   * Get total message count
   * @returns Number of messages
   */
  async getMessageCount(): Promise<number> {
    return await this.messageModel.countDocuments().exec();
  }

  /**
   * Get message count for a specific user
   * @param userId - User's MongoDB ObjectId
   * @returns Number of messages from that user
   */
  async getMessageCountByUser(userId: string): Promise<number> {
    if (!userId.match(/^[0-9a-fA-F]{24}$/)) {
      throw new BadRequestException('Invalid user ID format');
    }

    return await this.messageModel
      .countDocuments({ userId: new Types.ObjectId(userId) })
      .exec();
  }

  /**
   * Search messages by text content
   * @param searchText - Text to search for
   * @param limit - Maximum number of results (default: 50)
   * @returns Array of matching messages
   */
  async searchMessages(
    searchText: string,
    limit: number = 50,
  ): Promise<MessageDocument[]> {
    return await this.messageModel
      .find({
        text: { $regex: searchText, $options: 'i' }, // Case-insensitive search
      })
      .sort({ timestamp: -1 })
      .limit(limit)
      .populate('userId', 'username status')
      .exec();
  }

  /**
   * Get messages paginated
   * @param page - Page number (starting from 1)
   * @param pageSize - Number of messages per page
   * @returns Object containing messages and pagination info
   */
  async getPaginatedMessages(
    page: number = 1,
    pageSize: number = 20,
  ): Promise<{
    messages: MessageDocument[];
    totalMessages: number;
    totalPages: number;
    currentPage: number;
  }> {
    const skip = (page - 1) * pageSize;

    const [messages, totalMessages] = await Promise.all([
      this.messageModel
        .find()
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(pageSize)
        .populate('userId', 'username status')
        .exec(),
      this.messageModel.countDocuments().exec(),
    ]);

    return {
      messages,
      totalMessages,
      totalPages: Math.ceil(totalMessages / pageSize),
      currentPage: page,
    };
  }
}
