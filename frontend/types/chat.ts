export interface Message {
  _id: string;
  userId: string;
  username: string;
  text: string;
  timestamp: Date;
  createdAt: Date;
}

export interface SendMessagePayload {
  userId: string;
  text: string;
}

export interface JoinPayload {
  userId: string;
  username: string;
}

export interface UserInfo {
  userId: string;
  username: string;
  _id?: string;
}

export interface SocketResponse {
  success: boolean;
  message?: string;
  data?: any;
  error?: string;
}
