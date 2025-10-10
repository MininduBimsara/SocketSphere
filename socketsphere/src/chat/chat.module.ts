import { Module } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { MessageModule } from '../message/message.module';
import { UserModule } from '../user/user.module';
// RedisModule is global, so no need to import it here

@Module({
  imports: [MessageModule, UserModule],
  providers: [ChatGateway],
  exports: [ChatGateway],
})
export class ChatModule {}
