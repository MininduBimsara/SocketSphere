import { Module } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { MessageModule } from '../message/message.module';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    MessageModule, // Import to use MessageService
    UserModule, // Import to use UserService
  ],
  providers: [ChatGateway],
})
export class ChatModule {}
