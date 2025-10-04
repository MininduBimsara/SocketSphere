"use client";

import { useState, useEffect, useRef, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { initSocket, disconnectSocket } from "@/lib/socket";
import { Message, JoinPayload } from "@/types/chat";
import { Socket } from "socket.io-client";

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [username, setUsername] = useState("");
  const [userId, setUserId] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [isJoined, setIsJoined] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const router = useRouter();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const storedUsername = localStorage.getItem("chatUsername");

    if (!storedUsername) {
      router.push("/");
      return;
    }

    setUsername(storedUsername);

    const generatedUserId = `user_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;
    setUserId(generatedUserId);

    const socket = initSocket();
    socketRef.current = socket;

    // Connect to server
    socket.connect();

    // Socket event listeners
    socket.on("connect", () => {
      console.log("Connected to server");
      setIsConnected(true);

      // Auto-join when connected
      const joinPayload: JoinPayload = {
        userId: generatedUserId,
        username: storedUsername,
      };
      socket.emit("join", joinPayload);
    });

    socket.on("disconnect", () => {
      console.log("Disconnected from server");
      setIsConnected(false);
      setIsJoined(false);
    });

    socket.on("connected", (data) => {
      console.log("Server acknowledged connection:", data);
    });

    socket.on("joinSuccess", (data) => {
      console.log("Join successful:", data);
      setIsJoined(true);

      // Request recent messages after joining
      socket.emit("getRecentMessages", { limit: 50 });
    });

    socket.on("recentMessages", (data) => {
      console.log("Received recent messages:", data);
      if (data.success && data.data) {
        setMessages(data.data.reverse());
      }
    });

    socket.on("newMessage", (message: Message) => {
      console.log("Received new message:", message);
      setMessages((prev) => [...prev, message]);
    });

    socket.on("userJoined", (data) => {
      console.log("User joined:", data);
    });

    socket.on("userLeft", (data) => {
      console.log("User left:", data);
    });

    socket.on("onlineCount", (count) => {
      console.log("Online users:", count);
    });

    socket.on("connect_error", (error) => {
      console.error("Connection error:", error);
      setIsConnected(false);
      setIsJoined(false);
    });

    socket.on("error", (error) => {
      console.error("Socket error:", error);
    });

    // Cleanup on unmount
    return () => {
      if (socketRef.current && isJoined) {
        socketRef.current.emit("leave", { userId: generatedUserId });
      }
      disconnectSocket();
    };
  }, [router]);

  const handleSendMessage = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!inputText.trim() || !socketRef.current || !isConnected || !isJoined) {
      return;
    }

    const messagePayload = {
      userId,
      text: inputText.trim(),
    };

    // Emit message to server
    socketRef.current.emit("sendMessage", messagePayload);

    // Clear input
    setInputText("");
  };

  const formatTime = (timestamp: Date | string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="min-h-screen bg-white flex">
      {/* Left Side - Branding Section */}
      <div className="w-1/2 flex flex-col justify-center items-start px-16 py-12">
        <div className="max-w-lg">
          {/* Logo */}
          <div className="flex items-center space-x-2 mb-12">
            <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center">
              <svg
                className="w-6 h-6 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
            </div>
            <span className="text-xl font-bold text-gray-800">Anychat</span>
          </div>

          {/* Main Heading */}
          <h1 className="text-6xl font-bold text-gray-900 mb-8 leading-tight">
            Chat
            <br />
            anywhere
            <br />
            with anyone
          </h1>

          {/* CTA Button */}
          <button className="bg-blue-500 hover:bg-blue-600 text-white font-semibold px-8 py-3 rounded-lg transition duration-200">
            Start chatting
          </button>
        </div>
      </div>

      {/* Right Side - Chat Interface */}
      <div className="w-1/2 flex flex-col bg-white">
        {/* Chat Header */}
        <header className="border-b border-gray-200 px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-full flex items-center justify-center">
                <span className="text-white font-bold text-xl">
                  {username.charAt(0).toUpperCase()}
                </span>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {username}
                </h2>
                <div className="flex items-center space-x-2">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      isConnected && isJoined ? "bg-green-500" : "bg-red-500"
                    }`}
                  />
                  <span className="text-sm text-gray-600">
                    {isConnected && isJoined ? "Online" : "Connecting..."}
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={() => {
                if (socketRef.current && isJoined) {
                  socketRef.current.emit("leave", { userId });
                }
                localStorage.removeItem("chatUsername");
                router.push("/");
              }}
              className="text-sm text-gray-600 hover:text-gray-900 font-medium"
            >
              Leave
            </button>
          </div>
        </header>

        {/* Messages Container */}
        <main className="flex-1 overflow-y-auto px-8 py-6">
          {messages.length === 0 ? (
            <div className="text-center text-gray-400 mt-20">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-blue-100 rounded-full mb-4">
                <svg
                  className="w-10 h-10 text-blue-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
              </div>
              <p className="text-lg font-medium text-gray-600">
                Let's Chat Together
              </p>
              <p className="text-sm text-gray-500 mt-1">
                Start a conversation now
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message, index) => {
                const isOwnMessage = message.userId === userId;

                return (
                  <div
                    key={`${message._id}-${index}`}
                    className={`flex ${
                      isOwnMessage ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div className="max-w-xs">
                      {!isOwnMessage && (
                        <p className="text-xs font-semibold text-gray-700 mb-1 px-1">
                          {message.username}
                        </p>
                      )}
                      <div
                        className={`rounded-2xl px-4 py-3 ${
                          isOwnMessage
                            ? "bg-blue-500 text-white rounded-tr-sm"
                            : "bg-gray-100 text-gray-900 rounded-tl-sm"
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
              })}
              <div ref={messagesEndRef} />
            </div>
          )}
        </main>

        {/* Input Form */}
        <div className="px-8 py-6 border-t border-gray-200">
          <form
            onSubmit={handleSendMessage}
            className="flex items-center space-x-3"
          >
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={isJoined ? "Type a message..." : "Connecting..."}
              className="flex-1 px-4 py-3 border border-gray-300 rounded-full focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900"
              disabled={!isConnected || !isJoined}
            />
            <button
              type="submit"
              disabled={!inputText.trim() || !isConnected || !isJoined}
              className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white font-semibold px-8 py-3 rounded-full transition duration-200 disabled:cursor-not-allowed"
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
