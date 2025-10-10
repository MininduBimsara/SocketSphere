import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class Message {
  // MongoDB User reference (for REST API - optional for WebSocket messages)
  @Prop({ type: Types.ObjectId, ref: 'User', required: false })
  userId?: Types.ObjectId;

  // Username (required for WebSocket messages, optional for REST API)
  @Prop({ required: false, trim: true })
  username?: string;

  // Custom user ID from WebSocket (e.g., "user_1760127880849_gq2a88d5j")
  @Prop({ required: false })
  customUserId?: string;

  // Message text (always required)
  @Prop({ required: true, trim: true })
  text: string;

  // Timestamp (always required)
  @Prop({ default: Date.now })
  timestamp: Date;

  // Mongoose timestamps
  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export type MessageDocument = Message & Document;
export const MessageSchema = SchemaFactory.createForClass(Message);

// Add index for better query performance
MessageSchema.index({ timestamp: -1 });
MessageSchema.index({ userId: 1 });
MessageSchema.index({ customUserId: 1 });
