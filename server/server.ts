import express from "express";
import { Server } from "socket.io";
import { createServer } from "http";

const app = express();
const PORT = process.env.PORT || 8000;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: [FRONTEND_URL],
    methods: ["GET", "POST"],
    credentials: true,
  },
});

io.on("connection", (socket) => {
  console.log(`New client connected: ${socket.id}`);

  socket.on("join-room", ({ room }: { room: string }) => {
    socket.join(room);
    // list users in room
    const clients = Array.from(io.sockets.adapter.rooms.get(room) || []);
    // send the list back to the joiner
    socket.emit("users-in-room", { users: clients });
    // notify others that a new user joined
    socket.to(room).emit("user-joined", { userSocketId: socket.id });
    console.log(`Socket ${socket.id} joined room ${room}. Clients:`, clients);
  });

  socket.on("offer", ({ to, sdp }) => {
    if (to) io.to(to).emit("offer", { from: socket.id, sdp });
  });

  socket.on("answer", ({ to, sdp }) => {
    if (to) io.to(to).emit("answer", { from: socket.id, sdp });
  });

  socket.on("ice-candidate", ({ to, candidate }) => {
    if (to) {
      io.to(to).emit("ice-candidate", { from: socket.id, candidate });
    } else {
      // broadcast to all other members of rooms this socket is in
      const rooms = Array.from(socket.rooms).filter((r) => r !== socket.id);
      rooms.forEach((room) => {
        socket.to(room).emit("ice-candidate", { from: socket.id, candidate });
      });
    }
  });

  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Server is running on port:${PORT}`);
});
