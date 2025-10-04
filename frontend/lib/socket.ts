import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export const initSocket = (): Socket => {
  if (!socket) {
    // Connect to your NestJS backend (default port 3000)
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

    socket = io(apiUrl, {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      transports: ["websocket", "polling"],
    });

    // Add connection event listeners for debugging
    socket.on("connect", () => {
      console.log("✅ Socket connected:", socket?.id);
    });

    socket.on("connect_error", (error) => {
      console.error("❌ Socket connection error:", error);
    });

    socket.on("disconnect", (reason) => {
      console.log("🔌 Socket disconnected:", reason);
    });
  }

  return socket;
};

export const getSocket = (): Socket | null => {
  return socket;
};

export const disconnectSocket = (): void => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};
