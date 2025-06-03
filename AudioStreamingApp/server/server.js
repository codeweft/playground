const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { RTCPeerConnection, RTCSessionDescription } = require('wrtc'); // Using wrtc
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
  }
});

const PORT = process.env.PORT || 3000;
const peerConnections = {};
// const audioFileToSave = path.join(__dirname, 'audio_stream.opus'); // Path for incoming stream (currently placeholder)
const samplePlaybackFile = path.join(__dirname, 'sample.opus'); // File to stream back for testing

// Serve the sample audio file
app.get('/audio/playback.opus', (req, res) => {
  if (fs.existsSync(samplePlaybackFile)) {
    console.log('Streaming sample audio file:', samplePlaybackFile);
    res.setHeader('Content-Type', 'audio/opus');
    const stream = fs.createReadStream(samplePlaybackFile);
    stream.pipe(res);
  } else {
    console.log('Sample playback file not found:', samplePlaybackFile);
    res.status(404).send('Sample audio file not found.');
  }
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('signal', async (message) => {
    console.log('Received signal from', socket.id, ':', message);

    if (!peerConnections[socket.id]) {
      if (message.offer) {
        peerConnections[socket.id] = new RTCPeerConnection({});
        console.log('Created RTCPeerConnection for', socket.id);
        // Placeholder for handling incoming track and "saving" it
        peerConnections[socket.id].ontrack = (event) => {
          console.log(`Audio track received from ${socket.id}. Track kind: ${event.track.kind}`);
          // In a real scenario, this track would be processed and saved.
          // For now, we just log it. The playback will use a pre-existing sample file.
        };
      } else {
        console.log('Signal received without offer for non-existent PC from', socket.id);
        return;
      }
    }

    const pc = peerConnections[socket.id];

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('signal', { candidate: event.candidate });
      }
    };

    pc.oniceconnectionstatechange = () => {
        console.log(`ICE connection state for ${socket.id}: ${pc.iceConnectionState}`);
    };

    try {
      if (message.offer) {
        await pc.setRemoteDescription(new RTCSessionDescription(message.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('signal', { answer: pc.localDescription });
      } else if (message.answer) {
        await pc.setRemoteDescription(new RTCSessionDescription(message.answer));
      } else if (message.candidate) {
        await pc.addIceCandidate(message.candidate);
      }
    } catch (error) {
      console.error('Error processing signal for', socket.id, ':', error);
    }
  });

  socket.on('stopStream', () => {
    console.log('Client requested to stop stream:', socket.id);
    if (peerConnections[socket.id]) {
      peerConnections[socket.id].close();
      delete peerConnections[socket.id];
      console.log('PeerConnection closed for', socket.id);
    }
    // Logic for finalizing saved audio (if any) would go here
  });

  socket.on('requestPlayback', (req) => { // Added req to access headers if needed, though not used in this simplified version
    console.log('Client requested playback:', socket.id);
    if (fs.existsSync(samplePlaybackFile)) {
        // const playbackUrl = `http://${req.headers.host || 'localhost:3000'}/audio/playback.opus`; // Construct URL dynamically
        // It's better if the client knows the base URL and we just send the path
        // Or the client constructs the full URL based on its server connection info.
        // For now, let's send a relative path or a pre-agreed filename.
        // Client will construct: SERVER_URL + /audio/playback.opus
        console.log(`Informing client about playback availability at /audio/playback.opus`);
        socket.emit('playbackReady', { streamUrl: '/audio/playback.opus', fileName: 'sample.opus' });
    } else {
        console.log(`Sample audio file ${samplePlaybackFile} does not exist.`);
        socket.emit('playbackError', { message: 'Sample audio file not found to play.' });
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    if (peerConnections[socket.id]) {
      peerConnections[socket.id].close();
      delete peerConnections[socket.id];
    }
  });
});

app.get('/', (req, res) => {
  res.send('Server is running. Connect via Socket.IO for WebRTC. Playback at /audio/playback.opus');
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  if (!fs.existsSync(samplePlaybackFile)) {
    console.warn(`Warning: Sample playback file ${samplePlaybackFile} does not exist. Playback will fail.`);
    // Attempt to create a dummy one if it's missing, for fallback.
    fs.writeFile(samplePlaybackFile, "Dummy Opus Data", (err) => {
        if (err) console.error("Failed to create dummy sample.opus:", err);
        else console.log("Created dummy sample.opus for playback testing.");
    });
  } else {
    console.log(`Sample playback file found: ${samplePlaybackFile}`);
  }
});

process.on('SIGINT', () => {
    console.log('Server shutting down...');
    server.close(() => {
        console.log('Server shut down gracefully.');
        process.exit(0);
    });
});
