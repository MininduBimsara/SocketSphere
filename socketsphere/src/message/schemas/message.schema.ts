import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class Message {
  @Prop({ type: Types.ObjectId, ref: 'User', required: false })
  userId?: Types.ObjectId;

  @Prop({ required: false, trim: true })
  username?: string;

  @Prop({ required: false })
  customUserId?: string;

  @Prop({ required: true, trim: true })
  text: string;

  @Prop({ default: Date.now })
  timestamp: Date;

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export type MessageDocument = Message & Document;
export const MessageSchema = SchemaFactory.createForClass(Message);

// Enhanced indexes for better query performance
MessageSchema.index({ timestamp: -1 }); // Already exists - for sorting
MessageSchema.index({ userId: 1 }); // Already exists - for user messages
MessageSchema.index({ customUserId: 1 }); // Already exists - for WebSocket users

// Compound indexes for common query patterns
MessageSchema.index({ userId: 1, timestamp: -1 }); // User messages sorted by time
MessageSchema.index({ timestamp: -1, userId: 1 }); // Recent messages with user info
MessageSchema.index({ text: 'text' }); // Text search index
