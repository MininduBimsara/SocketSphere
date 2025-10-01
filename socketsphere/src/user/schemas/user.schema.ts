import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true })
  username: string;

  @Prop()
  avatar?: string;

  @Prop()
  status?: string; // e.g. 'online' / 'offline'
}

export type UserDocument = User & Document;
export const UserSchema = SchemaFactory.createForClass(User);
