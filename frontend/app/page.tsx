"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const [username, setUsername] = useState("");
  const router = useRouter();

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (username.trim()) {
      localStorage.setItem("chatUsername", username.trim());
      router.push("/chat");
    }
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

          {/* Description */}
          <p className="text-gray-600 text-lg mb-8">
            Connect with people instantly. Simple, fast, and secure messaging
            for everyone.
          </p>
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="w-1/2 flex items-center justify-center px-16 py-12 bg-white">
        <div className="w-full max-w-md">
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-2">
              Get Started
            </h2>
            <p className="text-gray-600">
              Enter your username to join the conversation
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label
                htmlFor="username"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Username
              </label>
              <input
                type="text"
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username..."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition text-gray-900"
                required
                minLength={2}
                maxLength={20}
              />
            </div>

            <button
              type="submit"
              className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-3 px-4 rounded-lg transition duration-200"
            >
              Start chatting
            </button>
          </form>

          <div className="mt-8 text-center text-sm text-gray-500">
            <p>Built with Next.js & Socket.IO</p>
          </div>
        </div>
      </div>
    </div>
  );
}
