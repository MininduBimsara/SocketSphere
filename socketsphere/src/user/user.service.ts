import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UserService {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  /**
   * Create a new user
   * @param createUserDto - DTO containing username
   * @returns Created user document
   * @throws ConflictException if username already exists
   */
  async createUser(createUserDto: CreateUserDto): Promise<UserDocument> {
    try {
      const newUser = new this.userModel({
        ...createUserDto,
        status: 'offline', // Default status
      });

      return await newUser.save();
    } catch (error) {
      // Handle duplicate username error (MongoDB error code 11000)
      if (error.code === 11000) {
        throw new ConflictException('Username already exists');
      }
      throw error;
    }
  }

  /**
   * Find all users
   * @returns Array of all users
   */
  async findAll(): Promise<UserDocument[]> {
    return await this.userModel.find().exec();
  }

  /**
   * Find user by ID
   * @param id - User's MongoDB ObjectId
   * @returns User document
   * @throws NotFoundException if user not found
   */
  async findById(id: string): Promise<UserDocument> {
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      throw new BadRequestException('Invalid user ID format');
    }

    const user = await this.userModel.findById(id).exec();

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return user;
  }

  /**
   * Find user by username
   * @param username - Username to search for
   * @returns User document or null
   */
  async findByUsername(username: string): Promise<UserDocument | null> {
    return await this.userModel.findOne({ username }).exec();
  }

  /**
   * Update user status (online/offline)
   * @param id - User's MongoDB ObjectId
   * @param status - New status ('online' or 'offline')
   * @returns Updated user document
   * @throws NotFoundException if user not found
   */
  async updateStatus(
    id: string,
    status: 'online' | 'offline',
  ): Promise<UserDocument> {
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      throw new BadRequestException('Invalid user ID format');
    }

    const user = await this.userModel
      .findByIdAndUpdate(id, { status }, { new: true })
      .exec();

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return user;
  }

  /**
   * Delete user by ID
   * @param id - User's MongoDB ObjectId
   * @returns Deleted user document
   * @throws NotFoundException if user not found
   */
  async deleteUser(id: string): Promise<UserDocument> {
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      throw new BadRequestException('Invalid user ID format');
    }

    const user = await this.userModel.findByIdAndDelete(id).exec();

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return user;
  }

  /**
   * Get all online users
   * @returns Array of online users
   */
  async getOnlineUsers(): Promise<UserDocument[]> {
    return await this.userModel.find({ status: 'online' }).exec();
  }

  /**
   * Check if username exists
   * @param username - Username to check
   * @returns boolean indicating if username exists
   */
  async usernameExists(username: string): Promise<boolean> {
    const user = await this.userModel.findOne({ username }).exec();
    return !!user;
  }

  /**
   * Get total user count
   * @returns Number of users
   */
  async getUserCount(): Promise<number> {
    return await this.userModel.countDocuments().exec();
  }
}
