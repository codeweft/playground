const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const socketIO = require('socket.io');
const wrtc = require('wrtc');
const { createFFmpegRecorder } = require('./ffmpegRecorder');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const recordingsDir = path.join(__dirname, 'recordings');
if (!fs.existsSync(recordingsDir)) {
  fs.mkdirSync(recordingsDir, { recursive: true });
}
app.use('/recordings', express.static(recordingsDir));

app.get('/health', (req, res) => {
  res.json({ status: 'Server is running', timestamp: new Date().toISOString() });
});

let lastRecordingPath = null;

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  let peerConnection = null;
  let audioSink = null;
  let recorder = null;
  let isRecording = false;

  const cleanup = async () => {
    console.log('Cleaning up for', socket.id);

    if (audioSink) {
      audioSink.stop();
      audioSink = null;
    }

    if (recorder && isRecording) {
      await recorder.stop();
      recorder = null;
      isRecording = false;
    }

    if (peerConnection) {
      peerConnection.close();
      peerConnection = null;
    }
  };

  socket.on('signal', async (data) => {
    try {
      if (data.offer) {
        console.log('Received offer');

        peerConnection = new wrtc.RTCPeerConnection({
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });

        peerConnection.onicecandidate = (event) => {
          if (event.candidate) {
            socket.emit('signal', { candidate: event.candidate });
          }
        };

        peerConnection.ontrack = async (event) => {
          const [track] = event.streams[0].getAudioTracks();
          if (track) {
            console.log('Audio track received');

            const timestamp = Date.now();
            const outputPath = path.join(recordingsDir, `recording-${timestamp}.webm`);
            lastRecordingPath = `/recordings/recording-${timestamp}.webm`;

            recorder = createFFmpegRecorder(outputPath, {
              sampleRate: 48000,
              channels: 1,
              bitrate: '128k',
              format: 'webm',
              codec: 'libopus'
            });

            await recorder.start();
            isRecording = true;

            console.log('Recording started');

            const audioSink = new wrtc.nonstandard.RTCAudioSink(track);
            audioSink.ondata = ({ samples }) => {
              const buffer = Buffer.from(samples.buffer);
              recorder.writeAudioData(buffer);
            };

            recorder._sink = audioSink; // keep reference for cleanup
            socket.emit('recordingStarted');
          }
        };

        await peerConnection.setRemoteDescription(new wrtc.RTCSessionDescription(data.offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('signal', { answer });

      } else if (data.candidate && peerConnection) {
        await peerConnection.addIceCandidate(new wrtc.RTCIceCandidate(data.candidate));
      }
    } catch (err) {
      console.error('Signal error:', err);
      socket.emit('recordingError', { message: 'Signal error: ' + err.message });
    }
  });

  socket.on('stopStream', async () => {
    console.log('stopStream called by', socket.id);
    await cleanup();
    socket.emit('recordingStopped');
  });

  socket.on('requestPlayback', () => {
    if (!lastRecordingPath) {
      return socket.emit('playbackError', { message: 'No recording available' });
    }

    const fullPath = path.join(__dirname, lastRecordingPath.substring(1));
    if (!fs.existsSync(fullPath)) {
      return socket.emit('playbackError', { message: 'Recording not found' });
    }

    const stats = fs.statSync(fullPath);
    if (stats.size === 0) {
      return socket.emit('playbackError', { message: 'Recording file is empty' });
    }

    socket.emit('playbackReady', { streamUrl: lastRecordingPath });
  });

  socket.on('disconnect', async () => {
    console.log('Client disconnected:', socket.id);
    await cleanup();
  });
});

server.listen(process.env.PORT || 3000, () => {
  console.log('Server listening on port 3000');
});
