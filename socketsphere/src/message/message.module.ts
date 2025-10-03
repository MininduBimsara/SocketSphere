import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Message, MessageSchema } from './schemas/message.schema';
import { MessageService } from './message.service';
import { MessageController } from './message.controller'; // Add this import

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Message.name, schema: MessageSchema }]),
  ],
  controllers: [MessageController], // Add this line
  providers: [MessageService],
  exports: [MessageService, MongooseModule],
})
export class MessageModule {}
