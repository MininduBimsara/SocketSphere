import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  /**
   * POST /users
   * Create a new user
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createUser(@Body() createUserDto: CreateUserDto) {
    const user = await this.userService.createUser(createUserDto);
    return {
      success: true,
      message: 'User created successfully',
      data: user,
    };
  }

  /**
   * GET /users
   * Get all users
   */
  @Get()
  async getAllUsers() {
    const users = await this.userService.findAll();
    return {
      success: true,
      data: users,
      count: users.length,
    };
  }

  /**
   * GET /users/online
   * Get all online users
   */
  @Get('online')
  async getOnlineUsers() {
    const users = await this.userService.getOnlineUsers();
    return {
      success: true,
      data: users,
      count: users.length,
    };
  }

  /**
   * GET /users/count
   * Get total user count
   */
  @Get('count')
  async getUserCount() {
    const count = await this.userService.getUserCount();
    return {
      success: true,
      count,
    };
  }

  /**
   * GET /users/:id
   * Get user by ID
   */
  @Get(':id')
  async getUserById(@Param('id') id: string) {
    const user = await this.userService.findById(id);
    return {
      success: true,
      data: user,
    };
  }

  /**
   * PATCH /users/:id/status
   * Update user status (online/offline)
   */
  @Patch(':id/status')
  async updateUserStatus(
    @Param('id') id: string,
    @Body('status') status: 'online' | 'offline',
  ) {
    const user = await this.userService.updateStatus(id, status);
    return {
      success: true,
      message: 'Status updated successfully',
      data: user,
    };
  }

  /**
   * DELETE /users/:id
   * Delete user by ID
   */
  @Delete(':id')
  async deleteUser(@Param('id') id: string) {
    const user = await this.userService.deleteUser(id);
    return {
      success: true,
      message: 'User deleted successfully',
      data: user,
    };
  }
}
