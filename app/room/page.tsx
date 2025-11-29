"use client";

import React, { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Phone,
  Share2,
  MoreVertical,
  Copy,
  Settings,
  Users,
} from "lucide-react";

export default function RoomPage() {
  const [isMicOn, setIsMicOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [roomCode] = useState("ABC123");

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const socketRef = useRef<any>(null);
  const remoteSocketIdRef = useRef<string | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(roomCode);
    alert("Room code copied to clipboard!");
  };

  const handleEndCall = () => {
    if (confirm("Are you sure you want to end the call?")) {
      window.history.back();
    }
  };

  // ===== 1. GET USER MEDIA =====
  const getLocalStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      console.log("✓ Local stream acquired");
      return stream;
    } catch (err) {
      console.error("✗ Could not get user media", err);
      return null;
    }
  };

  // ===== 2. SETUP PEER CONNECTION =====
  const setupPeerConnection = () => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    pcRef.current = pc;
    console.log("✓ Peer connection created");
    return pc;
  };

  // ===== 3. ADD TRACKS TO PEER CONNECTION =====
  const addTracksToPC = (stream: MediaStream, pc: RTCPeerConnection) => {
    stream.getTracks().forEach((track) => {
      pc.addTrack(track, stream);
    });
    console.log("✓ Tracks added to peer connection");
  };

  // ===== 4. HANDLE REMOTE TRACK =====
  const handleRemoteTrack = (pc: RTCPeerConnection) => {
    pc.ontrack = (event) => {
      const [stream] = event.streams;
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = stream;
      }
      console.log("✓ Remote stream received");
    };
  };

  // ===== 5. HANDLE ICE CANDIDATES =====
  const handleICECandidate = (pc: RTCPeerConnection, socket: any) => {
    pc.onicecandidate = (event) => {
      if (event.candidate && remoteSocketIdRef.current) {
        socket.emit("ice-candidate", {
          to: remoteSocketIdRef.current,
          candidate: event.candidate,
        });
        console.log("→ ICE candidate sent");
      }
    };
  };

  // ===== 6. CREATE AND SEND OFFER =====
  const createAndSendOffer = async (
    pc: RTCPeerConnection,
    socket: any,
    remoteId: string
  ) => {
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("offer", { to: remoteId, sdp: offer });
      console.log("→ Offer sent to", remoteId);
    } catch (err) {
      console.error("✗ Error creating offer", err);
    }
  };

  // ===== 7. HANDLE INCOMING OFFER =====
  const handleIncomingOffer = async (
    data: { from: string; sdp: RTCSessionDescriptionInit },
    pc: RTCPeerConnection,
    socket: any
  ) => {
    try {
      const { from, sdp } = data;
      remoteSocketIdRef.current = from;
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("answer", { to: from, sdp: answer });
      console.log("→ Answer sent to", from);
    } catch (err) {
      console.error("✗ Error handling offer", err);
    }
  };

  // ===== 8. HANDLE INCOMING ANSWER =====
  const handleIncomingAnswer = async (
    data: { from: string; sdp: RTCSessionDescriptionInit },
    pc: RTCPeerConnection
  ) => {
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      console.log("✓ Answer received from", data.from);
    } catch (err) {
      console.error("✗ Error handling answer", err);
    }
  };

  // ===== 9. HANDLE INCOMING ICE CANDIDATE =====
  const handleIncomingICECandidate = async (
    data: { from: string; candidate: RTCIceCandidateInit },
    pc: RTCPeerConnection
  ) => {
    try {
      if (data.candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        console.log("← ICE candidate received");
      }
    } catch (err) {
      console.error("✗ Error adding ICE candidate", err);
    }
  };

  // ===== 10. SETUP SOCKET LISTENERS =====
  const setupSocketListeners = (
    socket: any,
    pc: RTCPeerConnection,
    roomCode: string
  ) => {
    // Connect to server
    socket.on("connect", () => {
      console.log("✓ Connected to signaling server:", socket.id);
      socket.emit("join-room", { room: roomCode });
    });

    // Server responds with users in room
    socket.on("users-in-room", async (data: { users: string[] }) => {
      const others = data.users.filter((id) => id !== socket.id);
      if (others.length > 0) {
        const otherId = others[0];
        remoteSocketIdRef.current = otherId;
        console.log("✓ Other users in room:", others);
        // We're the newcomer, send offer
        await createAndSendOffer(pc, socket, otherId);
      } else {
        console.log("✓ Waiting for other participants...");
      }
    });

    // Another user joined
    socket.on("user-joined", (data: { id: string }) => {
      console.log("✓ User joined:", data.id);
      remoteSocketIdRef.current = data.id;
    });

    // Handle incoming offer
    socket.on(
      "offer",
      (data: { from: string; sdp: RTCSessionDescriptionInit }) => {
        console.log("← Offer received from", data.from);
        handleIncomingOffer(data, pc, socket);
      }
    );

    // Handle incoming answer
    socket.on(
      "answer",
      (data: { from: string; sdp: RTCSessionDescriptionInit }) => {
        console.log("← Answer received from", data.from);
        handleIncomingAnswer(data, pc);
      }
    );

    // Handle incoming ICE candidate
    socket.on(
      "ice-candidate",
      (data: { from: string; candidate: RTCIceCandidateInit }) => {
        handleIncomingICECandidate(data, pc);
      }
    );
  };

  // ===== 11. MAIN INITIALIZATION EFFECT =====
  useEffect(() => {
    const initializeConnection = async () => {
      // 1. Get local stream
      const stream = await getLocalStream();
      if (!stream) return;

      // 2. Setup peer connection
      const pc = setupPeerConnection();

      // 3. Add tracks to PC
      addTracksToPC(stream, pc);

      // 4. Handle remote track
      handleRemoteTrack(pc);

      // 5. Connect socket
      const SOCKET_URL =
        process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:8000";
      const socket = io(SOCKET_URL);
      socketRef.current = socket;
      console.log("✓ Socket initialized");

      // 6. Setup ICE candidate handling
      handleICECandidate(pc, socket);

      // 7. Setup socket listeners
      setupSocketListeners(socket, pc, roomCode);

      // Cleanup
      return () => {
        console.log("Cleaning up connection...");
        socket.disconnect();
        pc.close();
        localStreamRef.current?.getTracks().forEach((track) => track.stop());
      };
    };

    initializeConnection();
  }, [roomCode]);

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-blue-400">StreamRTC</h1>
          <div className="flex items-center gap-2 bg-gray-700 px-4 py-2 rounded-lg">
            <span className="text-sm text-gray-300">Room Code:</span>
            <span className="font-mono font-bold text-white">{roomCode}</span>
            <button
              onClick={handleCopyCode}
              className="ml-2 p-1 hover:bg-gray-600 rounded transition-colors"
              title="Copy room code"
            >
              <Copy size={16} />
            </button>
          </div>
        </div>
        <button
          onClick={() => setShowParticipants(!showParticipants)}
          className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
        >
          <Users size={20} />
          <span>2 Participants</span>
        </button>
      </div>

      {/* Main Video Area */}
      <div className="flex-1 flex gap-4 p-6 overflow-hidden">
        {/* Primary Video (Local) */}
        <div className="flex-1 relative bg-gray-950 rounded-xl overflow-hidden shadow-lg">
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full object-cover bg-black"
          />

          {!isVideoOn && (
            <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-70">
              <div className="text-center">
                <div className="w-24 h-24 mx-auto mb-4 rounded-full bg-linear-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                  <span className="text-4xl">👤</span>
                </div>
                <p className="text-gray-300">Camera Off</p>
              </div>
            </div>
          )}

          {/* Video Label */}
          <div className="absolute top-4 left-4 bg-black bg-opacity-60 px-3 py-1 rounded-full text-sm font-semibold">
            You (Local)
          </div>

          {/* Status Indicators */}
          <div className="absolute bottom-4 left-4 flex gap-2">
            {isMicOn && (
              <div className="bg-green-500 bg-opacity-80 px-2 py-1 rounded text-xs flex items-center gap-1">
                <Mic size={14} />
                Mic On
              </div>
            )}
            {isVideoOn && (
              <div className="bg-green-500 bg-opacity-80 px-2 py-1 rounded text-xs flex items-center gap-1">
                <Video size={14} />
                Video On
              </div>
            )}
          </div>
        </div>

        {/* Secondary Video (Remote) */}
        <div className="flex-1 relative bg-gray-950 rounded-xl overflow-hidden shadow-lg">
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover bg-black"
          />

          {/* placeholder when no remote stream */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center opacity-90">
              <div className="w-24 h-24 mx-auto mb-4 rounded-full bg-linear-to-br from-green-500 to-teal-600 flex items-center justify-center">
                <span className="text-4xl">👥</span>
              </div>
              <p className="text-gray-400">Waiting for participant...</p>
              <p className="text-sm text-gray-500 mt-2">
                Share your room code to invite
              </p>
            </div>
          </div>

          {/* Video Label */}
          <div className="absolute top-4 left-4 bg-black bg-opacity-60 px-3 py-1 rounded-full text-sm font-semibold">
            Guest (Remote)
          </div>

          {/* Status Indicators */}
          <div className="absolute bottom-4 left-4 flex gap-2">
            <div className="bg-gray-600 bg-opacity-80 px-2 py-1 rounded text-xs flex items-center gap-1">
              <MicOff size={14} />
              Awaiting
            </div>
          </div>
        </div>
      </div>

      {/* Control Bar */}
      <div className="bg-gray-800 border-t border-gray-700 px-6 py-6">
        <div className="flex justify-center items-center gap-4">
          {/* Microphone Toggle */}
          <button
            onClick={() => setIsMicOn(!isMicOn)}
            className={`p-4 rounded-full transition-all transform hover:scale-110 ${
              isMicOn
                ? "bg-gray-700 hover:bg-gray-600 text-white"
                : "bg-red-600 hover:bg-red-700 text-white"
            }`}
            title={isMicOn ? "Turn off microphone" : "Turn on microphone"}
          >
            {isMicOn ? <Mic size={24} /> : <MicOff size={24} />}
          </button>

          {/* Video Toggle */}
          <button
            onClick={() => setIsVideoOn(!isVideoOn)}
            className={`p-4 rounded-full transition-all transform hover:scale-110 ${
              isVideoOn
                ? "bg-gray-700 hover:bg-gray-600 text-white"
                : "bg-red-600 hover:bg-red-700 text-white"
            }`}
            title={isVideoOn ? "Turn off camera" : "Turn on camera"}
          >
            {isVideoOn ? <Video size={24} /> : <VideoOff size={24} />}
          </button>

          {/* Screen Share */}
          <button
            onClick={() => setIsScreenSharing(!isScreenSharing)}
            className={`p-4 rounded-full transition-all transform hover:scale-110 ${
              isScreenSharing
                ? "bg-green-600 hover:bg-green-700 text-white"
                : "bg-gray-700 hover:bg-gray-600 text-white"
            }`}
            title={isScreenSharing ? "Stop sharing screen" : "Share screen"}
          >
            <Share2 size={24} />
          </button>

          {/* Settings */}
          <button
            className="p-4 rounded-full bg-gray-700 hover:bg-gray-600 text-white transition-all transform hover:scale-110"
            title="Settings"
          >
            <Settings size={24} />
          </button>

          {/* More Options */}
          <button
            className="p-4 rounded-full bg-gray-700 hover:bg-gray-600 text-white transition-all transform hover:scale-110"
            title="More options"
          >
            <MoreVertical size={24} />
          </button>

          {/* End Call */}
          <button
            onClick={handleEndCall}
            className="p-4 rounded-full bg-red-600 hover:bg-red-700 text-white transition-all transform hover:scale-110 ml-4"
            title="End call"
          >
            <Phone size={24} />
          </button>
        </div>
      </div>
    </div>
  );
}
