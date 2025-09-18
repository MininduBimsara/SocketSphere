import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { UserModule } from './user/user.module';
import { MessageModule } from './message/message.module';
import { ChatModule } from './chat/chat.module';

@Module({
  imports: [DatabaseModule, UserModule, MessageModule, ChatModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
