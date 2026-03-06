import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        uri:
          configService.get<string>('MONGO_URI') ||
          'mongodb://127.0.0.1:27017/nest-chat',

        // Connection Pool Configuration
        maxPoolSize: 50, // Maximum number of connections in the pool
        minPoolSize: 10, // Minimum number of connections in the pool
        maxIdleTimeMS: 30000, // Close connections after 30 seconds of inactivity
        waitQueueTimeoutMS: 10000, // Wait 10 seconds for a connection from pool

        // Connection Settings
        serverSelectionTimeoutMS: 5000, // Timeout for server selection
        socketTimeoutMS: 45000, // Socket timeout
        family: 4, // Use IPv4

        // Performance Settings
        retryWrites: true, // Retry writes on failure
        retryReads: true, // Retry reads on failure

        // Connection Monitoring
        monitorCommands: process.env.NODE_ENV === 'development', // Monitor commands in dev
      }),
      inject: [ConfigService],
    }),
  ],
  exports: [MongooseModule],
})
export class DatabaseModule {}
