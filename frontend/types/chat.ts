export interface Message {
  id: string;
  userId: string;
  username: string;
  text: string;
  timestamp: Date;
}

export interface SendMessagePayload {
  userId: string;
  text: string;
}
