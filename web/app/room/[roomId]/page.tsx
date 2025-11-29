"use client";

import React, { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { io } from "socket.io-client";
import {
  Copy,
  Mic,
  MicOff,
  Video,
  VideoOff,
  Phone,
  Share2,
  Settings,
  Users,
} from "lucide-react";

export default function RoomMain() {
  const params = useParams();
  const roomId = params?.roomId || "unknown-room";

  const [isHost, setIsHost] = useState(false);
  const [localReady, setLocalReady] = useState(false);
  const [connectedPeer, setConnectedPeer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const socketRef = useRef<any>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const preparedOfferRef = useRef<RTCSessionDescriptionInit | null>(null);

  const SOCKET_URL =
    process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:8000";

  // 1) getUserMedia
  const getLocalStream = async () => {
    try {
      // Check if we're in a browser and mediaDevices is available
      if (
        typeof window === "undefined" ||
        !navigator.mediaDevices?.getUserMedia
      ) {
        throw new Error(
          "getUserMedia not available - ensure you are using HTTPS or localhost"
        );
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      console.log("✓ Local stream ready");
      setLocalReady(true);
      setError(null);
      return stream;
    } catch (err: any) {
      const errorMsg = err?.message || "Unknown error";
      console.error("✗ getUserMedia failed:", errorMsg);

      if (err?.name === "NotAllowedError") {
        setPermissionDenied(true);
        setError(
          "Camera/Microphone access denied. Please allow permissions in browser settings."
        );
      } else if (err?.name === "NotFoundError") {
        setError("No camera or microphone found. Check your devices.");
      } else {
        setError(`Camera/Mic access failed: ${errorMsg}`);
      }
      return null;
    }
  };

  // 2) setup RTCPeerConnection
  const setupPeerConnection = () => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    pc.ontrack = (event) => {
      const [stream] = event.streams;
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = stream;
      setConnectedPeer(true);
      console.log("Remote track attached");
    };
    pc.oniceconnectionstatechange = () => {
      console.log("ICE state:", pc.iceConnectionState);
    };
    pcRef.current = pc;
    return pc;
  };

  // 3) add local tracks to PC
  const addTracks = (stream: MediaStream, pc: RTCPeerConnection) => {
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));
    console.log("Local tracks added to PC");
  };

  // 4) prepare offer (host creates offer but does not send until someone joins)
  const prepareOffer = async (pc: RTCPeerConnection) => {
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      preparedOfferRef.current = offer;
      console.log("Offer prepared (host) — waiting to send");
    } catch (err) {
      console.error("prepareOffer error", err);
    }
  };

  // 5) send prepared offer to newly joined peer
  const sendPreparedOffer = (userSocketId: string) => {
    console.log("Sending prepared offer to", userSocketId);
    const socket = socketRef.current;
    const offer = preparedOfferRef.current;
    if (!socket || !offer) return;
    socket.emit("offer", { to: userSocketId, sdp: offer });
    console.log("Host sent offer to", userSocketId);
  };

  // 6) handle incoming offer (for the joining client)
  const handleIncomingOffer = async (data: {
    from: string;
    sdp: RTCSessionDescriptionInit;
  }) => {
    try {
      const pc = pcRef.current || setupPeerConnection();
      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      // create answer
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socketRef.current.emit("answer", { to: data.from, sdp: answer });
      console.log("Sent answer to host", data.from);
    } catch (err) {
      console.error("Error handling incoming offer", err);
    }
  };

  // 7) handle incoming answer (host receives)
  const handleIncomingAnswer = async (data: {
    from: string;
    sdp: RTCSessionDescriptionInit;
  }) => {
    try {
      const pc = pcRef.current;
      if (!pc) return;
      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      console.log("Host set remote description from answer", data.from);
    } catch (err) {
      console.error("Error handling incoming answer", err);
    }
  };

  // 8) ICE candidate handlers
  const setupICEHandling = (pc: RTCPeerConnection, socket: any) => {
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        // if host preparedOffer but hasn't sent yet, candidates will be buffered on host side — we still send to remote when we know their id
        socket.emit("ice-candidate", { to: null, candidate: event.candidate });
      }
    };
    socket.on(
      "ice-candidate",
      async (data: { from: string; candidate: RTCIceCandidateInit }) => {
        try {
          if (data.candidate) {
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
            console.log("Added remote ICE candidate");
          }
        } catch (err) {
          console.error("Error adding remote ICE");
        }
      }
    );
  };

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      // 1. Local media
      const stream = await getLocalStream();
      if (!stream || !mounted) return;

      // 2. Create PC and add tracks
      const pc = setupPeerConnection();
      addTracks(stream, pc);

      // 3. Prepare offer immediately if host (we will determine host by server reply)
      // 4. Setup socket and listeners
      const socket = io(SOCKET_URL);
      socketRef.current = socket;

      socket.on("connect", () => {
        console.log("connected to signaling server", socket.id);
        socket.emit("join-room", { room: roomId });
      });

      // server returns current users in the room
      socket.on("users-in-room", async (data: { users: string[] }) => {
        const others = data.users.filter((id) => id !== socket.id);
        if (others.length === 0) {
          // I'm the first — I'm host
          setIsHost(true);
          // prepare offer so host is ready
          await prepareOffer(pc);
          console.log("You are host — share invite link");
        } else {
          // there's already someone: we'll act as joiner — do nothing until offer arrives
          console.log("Joining existing room, waiting for offer from host");
        }
      });

      // when another user joins, server notifies others
      socket.on("user-joined", ({ userSocketId }: { userSocketId: string }) => {
        console.log("User joined room:", userSocketId);
        // if I'm host and prepared offer exists, send it
        console.log(
          "Is host?",
          isHost,
          "Prepared offer?",
          preparedOfferRef.current
        );
        if (preparedOfferRef.current) {
          console.log("Is this working");
          sendPreparedOffer(userSocketId);
        }
      });

      // incoming offer (for joiner)
      socket.on(
        "offer",
        (data: { from: string; sdp: RTCSessionDescriptionInit }) => {
          console.log("Offer received from host", data.from);
          handleIncomingOffer(data);
        }
      );

      // incoming answer (for host)
      socket.on(
        "answer",
        (data: { from: string; sdp: RTCSessionDescriptionInit }) => {
          console.log("Answer received", data.from);
          handleIncomingAnswer(data);
        }
      );

      // ICE candidate events
      setupICEHandling(pc, socket);

      // cleanup on unmount
      return () => {
        mounted = false;
        socket.disconnect();
        pc.close();
        localStreamRef.current?.getTracks().forEach((t) => t.stop());
      };
    };

    init();
  }, [roomId]);

  const copyInvite = () => {
    const link =
      typeof window !== "undefined"
        ? window.location.href
        : `https://yourdomain/room/${roomId}`;
    navigator.clipboard.writeText(link);
    alert("Invite link copied");
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 bg-gray-800 flex items-center justify-between border-b border-gray-700">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-bold">Room: {roomId}</h2>
          <button
            onClick={copyInvite}
            className="ml-2 px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded transition-colors flex items-center gap-2"
          >
            <Copy size={16} /> Copy Invite
          </button>
        </div>
        <div>
          {isHost ? (
            <span className="text-sm bg-blue-600 px-3 py-1 rounded">Host</span>
          ) : (
            <span className="text-sm bg-purple-600 px-3 py-1 rounded">
              Participant
            </span>
          )}
        </div>
      </div>

      {/* Error/Permission Alert */}
      {error && (
        <div className="bg-red-900 border-l-4 border-red-600 text-red-100 p-4 m-4 rounded">
          <p className="font-bold">⚠️ Access Issue</p>
          <p className="text-sm mt-1">{error}</p>
          {permissionDenied && (
            <p className="text-xs mt-2 opacity-75">
              To fix: In your browser address bar, click the camera/mic icon and
              select "Allow"
            </p>
          )}
        </div>
      )}

      {/* Video Area */}
      <div className="flex-1 p-6 flex gap-4 overflow-hidden">
        {/* Local Video */}
        <div className="flex-1 rounded-lg bg-black overflow-hidden shadow-lg relative">
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full object-cover"
          />
          {!localReady && (
            <div className="absolute inset-0 bg-black bg-opacity-70 flex items-center justify-center flex-col gap-4">
              <div className="animate-spin">
                <div className="w-12 h-12 border-4 border-blue-500 border-t-blue-200 rounded-full"></div>
              </div>
              <p className="text-center">
                Requesting camera & microphone access...
              </p>
              <p className="text-xs text-gray-400 text-center max-w-xs">
                If you don't see a permission prompt, check your browser's
                address bar
              </p>
            </div>
          )}
          <div className="absolute bottom-4 left-4 bg-black bg-opacity-60 px-3 py-1 rounded text-sm">
            You (Local)
          </div>
        </div>

        {/* Remote Video */}
        <div className="flex-1 rounded-lg bg-black overflow-hidden shadow-lg relative">
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover"
          />
          {!connectedPeer && (
            <div className="absolute inset-0 bg-black bg-opacity-70 flex items-center justify-center flex-col gap-2">
              <p className="text-gray-300">Waiting for remote peer...</p>
              <p className="text-xs text-gray-500">
                {isHost
                  ? "Share the invite link to connect"
                  : "Waiting for host to accept..."}
              </p>
            </div>
          )}
          <div className="absolute bottom-4 left-4 bg-black bg-opacity-60 px-3 py-1 rounded text-sm">
            Remote
          </div>
        </div>
      </div>

      {/* Control Bar */}
      <div className="p-4 bg-gray-800 border-t border-gray-700 flex items-center justify-center gap-6">
        <button
          className="px-6 py-3 bg-red-600 hover:bg-red-700 rounded-lg flex items-center gap-2 transition-colors"
          onClick={() => window.history.back()}
        >
          <Phone size={18} /> End Call
        </button>
        <div className="flex-1 flex gap-8 justify-center">
          <div className="text-center">
            <div
              className={`w-3 h-3 rounded-full mx-auto mb-1 ${
                localReady ? "bg-green-500" : "bg-red-500"
              }`}
            ></div>
            <span className="text-xs">
              {localReady ? "Camera On" : "Camera Off"}
            </span>
          </div>
          <div className="text-center">
            <div
              className={`w-3 h-3 rounded-full mx-auto mb-1 ${
                connectedPeer ? "bg-green-500" : "bg-yellow-500"
              }`}
            ></div>
            <span className="text-xs">
              {connectedPeer ? "Connected" : "Connecting..."}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
