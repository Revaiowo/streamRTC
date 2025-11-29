"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function Home() {
  const router = useRouter();
  const [joinCode, setJoinCode] = useState("");
  const [showJoinInput, setShowJoinInput] = useState(false);

  // Generate random alphanumeric room ID (10 characters)
  const generateRoomId = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let roomId = "";
    for (let i = 0; i < 10; i++) {
      roomId += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return roomId;
  };

  const handleCreateRoom = () => {
    const roomId = generateRoomId();
    router.push(`/room/${roomId}`);
  };

  const handleJoinRoom = () => {
    if (joinCode.trim()) {
      router.push(`/room/${joinCode.toUpperCase()}`);
      setJoinCode("");
    }
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-background via-background to-purple-600 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-white mb-2">StreamRTC</h1>
          <p className="text-blue-100 text-lg">Connect, Share, Collaborate</p>
        </div>

        {/* Main Card */}
        <div className="bg-gray-800 rounded-2xl shadow-2xl p-8">
          {!showJoinInput ? (
            <>
              {/* Create Room Button */}
              <button
                onClick={handleCreateRoom}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-6 rounded-lg mb-4 transition-all duration-200 transform hover:scale-105 hover:cursor-pointer flex items-center justify-center gap-2"
              >
                <span className="text-2xl">➕</span>
                Create New Room
              </button>

              {/* Join Room Button */}
              <button
                onClick={() => setShowJoinInput(true)}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-4 px-6 rounded-lg transition-all duration-200 transform hover:scale-105 hover:cursor-pointer flex items-center justify-center gap-2"
              >
                <span className="text-2xl">🚪</span>
                Join Room
              </button>
            </>
          ) : (
            <>
              {/* Join Input Form */}
              <div className="mb-4">
                <label className="block text-gray-700 text-sm font-bold mb-2">
                  Enter Room Code
                </label>
                <input
                  type="text"
                  placeholder="e.g., ABC123"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  onKeyPress={(e) => e.key === "Enter" && handleJoinRoom()}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-purple-600"
                  autoFocus
                />
              </div>

              {/* Join Button */}
              <button
                onClick={handleJoinRoom}
                disabled={!joinCode.trim()}
                className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white font-bold py-3 px-6 rounded-lg mb-3 transition-all duration-200"
              >
                Join Room
              </button>

              {/* Back Button */}
              <button
                onClick={() => {
                  setShowJoinInput(false);
                  setJoinCode("");
                }}
                className="w-full border-2 border-gray-300 text-gray-700 hover:text-gray-900 font-bold py-3 px-6 rounded-lg transition-all duration-200"
              >
                Back
              </button>
            </>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-blue-100 text-sm mt-8">
          High-quality video conferencing at your fingertips
        </p>
      </div>
    </div>
  );
}
