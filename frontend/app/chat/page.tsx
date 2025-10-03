"use client";

import { useState, useEffect, useRef, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { initSocket, disconnectSocket } from "@/lib/socket";
import { Message } from "@/types/chat";
import { Socket } from "socket.io-client";

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [username, setUsername] = useState("");
  const [userId, setUserId] = useState("");
  const [isConnected, setIsConnected] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const router = useRouter();

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    // Get username from localStorage
    const storedUsername = localStorage.getItem("chatUsername");

    if (!storedUsername) {
      // Redirect to home if no username
      router.push("/");
      return;
    }

    setUsername(storedUsername);

    // Generate unique userId (in production, use proper UUID)
    const generatedUserId = `user_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;
    setUserId(generatedUserId);

    // Initialize Socket.IO
    const socket = initSocket();
    socketRef.current = socket;

    // Connect to server
    socket.connect();

    // Socket event listeners
    socket.on("connect", () => {
      console.log("Connected to server");
      setIsConnected(true);
    });

    socket.on("disconnect", () => {
      console.log("Disconnected from server");
      setIsConnected(false);
    });

    socket.on("newMessage", (message: Message) => {
      console.log("Received message:", message);
      setMessages((prev) => [...prev, message]);
    });

    socket.on("connect_error", (error) => {
      console.error("Connection error:", error);
      setIsConnected(false);
    });

    // Cleanup on unmount
    return () => {
      disconnectSocket();
    };
  }, [router]);

  const handleSendMessage = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!inputText.trim() || !socketRef.current || !isConnected) {
      return;
    }

    const messagePayload = {
      userId,
      username,
      text: inputText.trim(),
    };

    // Emit message to server
    socketRef.current.emit("sendMessage", messagePayload);

    // Clear input
    setInputText("");
  };

  const formatTime = (timestamp: Date) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
              <span className="text-white font-bold text-lg">
                {username.charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-800">{username}</h1>
              <div className="flex items-center space-x-2">
                <div
                  className={`w-2 h-2 rounded-full ${
                    isConnected ? "bg-green-500" : "bg-red-500"
                  }`}
                />
                <span className="text-sm text-gray-600">
                  {isConnected ? "Connected" : "Disconnected"}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={() => {
              localStorage.removeItem("chatUsername");
              router.push("/");
            }}
            className="text-sm text-gray-600 hover:text-gray-800 font-medium"
          >
            Leave Chat
          </button>
        </div>
      </header>

      {/* Messages Container */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-6 overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto space-y-4 mb-4">
          {messages.length === 0 ? (
            <div className="text-center text-gray-500 mt-10">
              <p className="text-lg">No messages yet</p>
              <p className="text-sm">Be the first to say hello! 👋</p>
            </div>
          ) : (
            messages.map((message, index) => {
              const isOwnMessage = message.userId === userId;

              return (
                <div
                  key={`${message.id}-${index}`}
                  className={`flex ${
                    isOwnMessage ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-xs lg:max-w-md ${
                      isOwnMessage ? "order-2" : "order-1"
                    }`}
                  >
                    {!isOwnMessage && (
                      <p className="text-xs font-semibold text-gray-700 mb-1 px-1">
                        {message.username}
                      </p>
                    )}
                    <div
                      className={`rounded-2xl px-4 py-2 ${
                        isOwnMessage
                          ? "bg-blue-600 text-white rounded-tr-none"
                          : "bg-white text-gray-800 rounded-tl-none shadow"
                      }`}
                    >
                      <p className="break-words">{message.text}</p>
                    </div>
                    <p
                      className={`text-xs text-gray-500 mt-1 px-1 ${
                        isOwnMessage ? "text-right" : "text-left"
                      }`}
                    >
                      {formatTime(message.timestamp)}
                    </p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Form */}
        <form
          onSubmit={handleSendMessage}
          className="bg-white rounded-2xl shadow-lg p-4 flex items-center space-x-3"
        >
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 px-4 py-2 border border-gray-300 rounded-full focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            disabled={!isConnected}
          />
          <button
            type="submit"
            disabled={!inputText.trim() || !isConnected}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold px-6 py-2 rounded-full transition duration-200 transform hover:scale-105 disabled:transform-none disabled:cursor-not-allowed"
          >
            Send
          </button>
        </form>
      </main>
    </div>
  );
}
