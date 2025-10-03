import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class Message {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  text: string;

  @Prop({ default: Date.now })
  timestamp: Date;

  @Prop()
  createdAt?: Date; // Add this

  @Prop()
  updatedAt?: Date; // Optional: add this too
}

export type MessageDocument = Message & Document;
export const MessageSchema = SchemaFactory.createForClass(Message);
