const express = require("express");
const socket = require("socket.io");
const { ExpressPeerServer } = require("peer");
const groupCallHandler = require("./groupCallHandler");
const { v4: uuidv4 } = require("uuid");
const PORT = process.env.PORT || 5000;

const app = express();

const server = app.listen(PORT, () => {
  console.log(`server is listening on port ${PORT}`);
  console.log(`http://localhost:${PORT}`);
});

const peerServer = ExpressPeerServer(server, {
  debug: true,
});

// tao group call vs thu vien peerjs 
app.use('/peerjs', peerServer);

groupCallHandler.createPeerServerListeners(peerServer);

const io = socket(server, {
  cors: {
    origin: "*",
    method: ["GET", "POST"],
  },
});

let peers = [];
let groupCallRooms = [];

const broadcastEventTypes = {
  ACTIVE_USERS: 'ACTIVE_USERS',
  GROUP_CALL_ROOMS: 'GROUP_CALL_ROOMS'
}

io.on("connection", (socket) => {
  socket.emit("connection", null);
  console.log("new user connected");
  console.log(socket.id);

  socket.on('register-new-user', (data) => {
    peers.push({
      username: data?.username,
      // lọc những user # thằng trên server đang join
      socketId: data?.socketId
    })
    console.log('registed new user');
    console.log(peers);

    io.sockets.emit('broadcast', {
      event: broadcastEventTypes.ACTIVE_USERS,
      activeUsers: peers
    });

    io.sockets.emit("broadcast", {
      event: broadcastEventTypes.GROUP_CALL_ROOMS,
      groupCallRooms,
    });
  });

  socket.on('disconnect', () => {
    console.log("user disconnected");
    peers = peers.filter((peer) => peer.socketId !== socket.id);
    io.sockets.emit("broadcast", {
      event: broadcastEventTypes.ACTIVE_USERS,
      activeUsers: peers,
    });

    groupCallRooms = groupCallRooms.filter(
      (room) => room.peerId !== data.peerId
    );

    io.sockets.emit("broadcast", {
      event: broadcastEventTypes.GROUP_CALL_ROOMS,
      groupCallRooms,
    });
  }
  )

  // listeners related with direct call
  socket.on('pre-offer', (data) => {
    console.log('pre-offer-handled');
    io.to(data.callee.socketId).emit('pre-offer', {
      callerUserName: data.caller.username,
      callerSocketId: socket.id
    })
  })

  // call pre offer
  socket.on("pre-offer-answer", (data) => {
    console.log("handling pre offer answer");
    io.to(data.callerSocketId).emit("pre-offer-answer", {
      answer: data.answer,
    });
  });

  socket.on("webRTC-offer", (data) => {
    console.log("handling webRTC offer");
    io.to(data.calleeSocketId).emit("webRTC-offer", {
      offer: data.offer,
    });
  });

  socket.on("webRTC-answer", (data) => {
    console.log("handling webRTC answer");
    io.to(data.callerSocketId).emit("webRTC-answer", {
      answer: data.answer,
    });
  });

  socket.on("webRTC-candidate", (data) => {
    console.log("handling ice candidate");
    io.to(data.connectedUserSocketId).emit("webRTC-candidate", {
      candidate: data.candidate,
    });
  });

  // api hang up when call user ( stop call)
  socket.on("user-hanged-up", (data) => {
    io.to(data.connectedUserSocketId).emit("user-hanged-up");
  });

  // Envent related with group call
  socket.on("group-call-register", (data) => {
    const roomId = uuidv4();
    socket.join(roomId);

    const newGroupCallRoom = {
      peerId: data.peerId,
      hostName: data.username,
      socketId: socket.id,
      roomId: roomId,
      password: data.password,
      roomName: data.roomName
    };

    groupCallRooms.push(newGroupCallRoom);
    console.log(groupCallRooms)
    io.sockets.emit("broadcast", {
      event: broadcastEventTypes.GROUP_CALL_ROOMS,
      groupCallRooms,
    });
  });

  socket.on("group-call-join-request", (data) => {
    io.to(data.roomId).emit("group-call-join-request", {
      peerId: data.peerId,
      streamId: data.streamId,
    });

    socket.join(data.roomId);
  });

  socket.on("group-call-user-left", (data) => {
    socket.leave(data.roomId);

    io.to(data.roomId).emit("group-call-user-left", {
      streamId: data.streamId,
    });
  });

  socket.on("group-call-closed-by-host", (data) => {
    groupCallRooms = groupCallRooms.filter(
      (room) => room.peerId !== data.peerId
    );

    io.sockets.emit("broadcast", {
      event: broadcastEventTypes.GROUP_CALL_ROOMS,
      groupCallRooms,
    });
  });

  // white board data
  socket.on('canvas-data', (data) => {
    socket.broadcast.emit('canvas-data', data);
  })

  // messsage
  io.on('connection', socket => {
    socket.on('message', ({ name, message, timeSend, roomId }) => {
      io.emit('message', { name, message, timeSend, roomId })
    })
  })
});
