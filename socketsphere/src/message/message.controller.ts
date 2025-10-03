import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { MessageService } from './message.service';
import { CreateMessageDto } from './dto/create-message.dto';

@Controller('messages')
export class MessageController {
  constructor(private readonly messageService: MessageService) {}

  /**
   * POST /messages
   * Create a new message
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createMessage(@Body() createMessageDto: CreateMessageDto) {
    const message = await this.messageService.createMessage(createMessageDto);
    return {
      success: true,
      message: 'Message created successfully',
      data: message,
    };
  }

  /**
   * GET /messages
   * Get all messages with optional limit
   */
  @Get()
  async getAllMessages(@Query('limit') limit?: string) {
    const limitNumber = limit ? parseInt(limit, 10) : 100;
    const messages = await this.messageService.findAll(limitNumber);
    return {
      success: true,
      data: messages,
      count: messages.length,
    };
  }

  /**
   * GET /messages/recent
   * Get recent messages
   */
  @Get('recent')
  async getRecentMessages(@Query('limit') limit?: string) {
    const limitNumber = limit ? parseInt(limit, 10) : 50;
    const messages = await this.messageService.getRecentMessages(limitNumber);
    return {
      success: true,
      data: messages,
      count: messages.length,
    };
  }

  /**
   * GET /messages/count
   * Get total message count
   */
  @Get('count')
  async getMessageCount() {
    const count = await this.messageService.getMessageCount();
    return {
      success: true,
      count,
    };
  }

  /**
   * GET /messages/:id
   * Get message by ID
   */
  @Get(':id')
  async getMessageById(@Param('id') id: string) {
    const message = await this.messageService.findById(id);
    return {
      success: true,
      data: message,
    };
  }

  /**
   * DELETE /messages/:id
   * Delete message by ID
   */
  @Delete(':id')
  async deleteMessage(@Param('id') id: string) {
    const message = await this.messageService.deleteMessage(id);
    return {
      success: true,
      message: 'Message deleted successfully',
      data: message,
    };
  }
}
