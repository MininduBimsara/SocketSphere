import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true, trim: true })
  username: string;

  @Prop({ default: 'offline', enum: ['online', 'offline'] })
  status: string;

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export type UserDocument = User & Document;
export const UserSchema = SchemaFactory.createForClass(User);

// Add indexes for better query performance
UserSchema.index({ username: 1 }); // Already has unique index, this is for faster lookups
UserSchema.index({ status: 1 }); // For filtering by online/offline status
UserSchema.index({ createdAt: -1 }); // For sorting by creation date
UserSchema.index({ updatedAt: -1 }); // For sorting by last update date
