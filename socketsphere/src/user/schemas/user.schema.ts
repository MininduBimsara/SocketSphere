import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class User {
  @Prop({
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 30,
  })
  username: string;

  @Prop({ default: 'offline', enum: ['online', 'offline'] })
  status: string;
}

export type UserDocument = User & Document;
export const UserSchema = SchemaFactory.createForClass(User);
