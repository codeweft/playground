const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { RTCPeerConnection, RTCSessionDescription } = require('wrtc');
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
const audioStreams = {}; // Store audio streams per client
const recordedFiles = {}; // Store recorded file paths per client

// Create recordings directory if it doesn't exist
const recordingsDir = path.join(__dirname, 'recordings');
if (!fs.existsSync(recordingsDir)) {
  fs.mkdirSync(recordingsDir, { recursive: true });
}

// Serve recorded audio files
app.get('/audio/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(recordingsDir, filename);
  
  if (fs.existsSync(filePath)) {
    console.log('Streaming recorded audio file:', filePath);
    res.setHeader('Content-Type', 'audio/opus');
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  } else {
    console.log('Recorded audio file not found:', filePath);
    res.status(404).send('Audio file not found.');
  }
});

// Helper function to generate unique filename
function generateAudioFilename(socketId) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `recording_${socketId}_${timestamp}.opus`;
}

// Helper function to write audio data to file
function writeAudioToFile(socketId, audioData) {
  if (!recordedFiles[socketId]) {
    const filename = generateAudioFilename(socketId);
    recordedFiles[socketId] = {
      filename: filename,
      filepath: path.join(recordingsDir, filename),
      writeStream: fs.createWriteStream(path.join(recordingsDir, filename))
    };
    console.log(`Created new recording file for ${socketId}: ${filename}`);
  }
  
  // Write audio data to file
  recordedFiles[socketId].writeStream.write(audioData);
}

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('signal', async (message) => {
    console.log('Received signal from', socket.id, ':', message);

    if (!peerConnections[socket.id]) {
      if (message.offer) {
        peerConnections[socket.id] = new RTCPeerConnection({
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' }
          ]
        });
        console.log('Created RTCPeerConnection for', socket.id);
        
        // Handle incoming audio track
        peerConnections[socket.id].ontrack = (event) => {
          console.log(`Audio track received from ${socket.id}. Track kind: ${event.track.kind}`);
          
          if (event.track.kind === 'audio') {
            const stream = event.streams[0];
            audioStreams[socket.id] = stream;
            
            // Create MediaRecorder to capture audio data
            // Note: This is a simplified approach. In a real implementation,
            // you might need to use a more sophisticated method to capture
            // and encode the audio data properly.
            
            // For demonstration, we'll simulate receiving audio chunks
            // In practice, you'd need to implement proper audio capture
            // using MediaRecorder or similar WebRTC audio processing
            
            console.log(`Started recording audio for ${socket.id}`);
            
            // Simulate receiving audio data (in practice, this would come from MediaRecorder)
            const simulateAudioData = () => {
              if (audioStreams[socket.id]) {
                // This is where you'd get actual audio data from the stream
                // For now, we'll create a placeholder that indicates recording is active
                const audioChunk = Buffer.from(`Audio data chunk at ${Date.now()}\n`);
                writeAudioToFile(socket.id, audioChunk);
              }
            };
            
            // Simulate periodic audio data (replace with actual MediaRecorder data handling)
            const recordingInterval = setInterval(simulateAudioData, 1000);
            
            // Store interval reference for cleanup
            if (!audioStreams[socket.id].recordingInterval) {
              audioStreams[socket.id].recordingInterval = recordingInterval;
            }
          }
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
    
    // Stop recording and close file stream
    if (audioStreams[socket.id] && audioStreams[socket.id].recordingInterval) {
      clearInterval(audioStreams[socket.id].recordingInterval);
      delete audioStreams[socket.id];
    }
    
    if (recordedFiles[socket.id]) {
      recordedFiles[socket.id].writeStream.end();
      console.log(`Recording saved for ${socket.id}: ${recordedFiles[socket.id].filename}`);
    }
    
    if (peerConnections[socket.id]) {
      peerConnections[socket.id].close();
      delete peerConnections[socket.id];
      console.log('PeerConnection closed for', socket.id);
    }
  });

  socket.on('requestPlayback', () => {
    console.log('Client requested playback:', socket.id);
    
    if (recordedFiles[socket.id] && fs.existsSync(recordedFiles[socket.id].filepath)) {
      const filename = recordedFiles[socket.id].filename;
      console.log(`Informing client about playback availability at /audio/${filename}`);
      socket.emit('playbackReady', { 
        streamUrl: `/audio/${filename}`, 
        fileName: filename 
      });
    } else {
      console.log(`No recorded audio file found for ${socket.id}`);
      socket.emit('playbackError', { 
        message: 'No recorded audio found. Please record some audio first.' 
      });
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    
    // Clean up resources
    if (audioStreams[socket.id] && audioStreams[socket.id].recordingInterval) {
      clearInterval(audioStreams[socket.id].recordingInterval);
      delete audioStreams[socket.id];
    }
    
    if (recordedFiles[socket.id]) {
      recordedFiles[socket.id].writeStream.end();
      console.log(`Recording finalized for disconnected client ${socket.id}: ${recordedFiles[socket.id].filename}`);
      // Keep the recorded file for potential future playback
    }
    
    if (peerConnections[socket.id]) {
      peerConnections[socket.id].close();
      delete peerConnections[socket.id];
    }
  });
});

app.get('/', (req, res) => {
  res.send('Server is running. Connect via Socket.IO for WebRTC. Recorded audio available at /audio/[filename]');
});

// Endpoint to list all recorded files
app.get('/recordings', (req, res) => {
  fs.readdir(recordingsDir, (err, files) => {
    if (err) {
      return res.status(500).json({ error: 'Unable to list recordings' });
    }
    const audioFiles = files.filter(file => file.endsWith('.opus'));
    res.json({ recordings: audioFiles });
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`Recordings will be stored in: ${recordingsDir}`);
});

process.on('SIGINT', () => {
  console.log('Server shutting down...');
  
  // Close all active recordings
  Object.keys(recordedFiles).forEach(socketId => {
    if (recordedFiles[socketId].writeStream) {
      recordedFiles[socketId].writeStream.end();
    }
  });
  
  // Clear all recording intervals
  Object.keys(audioStreams).forEach(socketId => {
    if (audioStreams[socketId].recordingInterval) {
      clearInterval(audioStreams[socketId].recordingInterval);
    }
  });
  
  server.close(() => {
    console.log('Server shut down gracefully.');
    process.exit(0);
  });
});