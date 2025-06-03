import express from 'express';
import http from 'http';
import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';

const PORT = process.env.PORT || 3000;
const MAX_WEBSOCKET_PAYLOAD = 10 * 1024 * 1024; // 10 MB
// For security, consider adding a timeout for connections that don't send metadata.
const METADATA_TIMEOUT_MS = 10000; // 10 seconds, example

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({
  server,
  maxPayload: MAX_WEBSOCKET_PAYLOAD
});

const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  console.log(`Uploads directory created at: ${UPLOADS_DIR}`);
} else {
  console.log(`Uploads directory already exists at: ${UPLOADS_DIR}`);
}

interface StreamMetadata {
  id: string;
  type: 'audio' | 'video';
  fileName: string;
}

const activeStreams = new Map<WebSocket, fs.WriteStream>();
const streamMetadataStore = new Map<WebSocket, StreamMetadata>();
const metadataTimeouts = new Map<WebSocket, NodeJS.Timeout>();


function cleanupConnection(ws: WebSocket, clientDesc: string) {
  const fileStream = activeStreams.get(ws);
  if (fileStream) {
    fileStream.end(() => {
      console.log(`[${clientDesc}] File stream (associated with cleanup) for ${streamMetadataStore.get(ws)?.fileName || 'unknown file'} closed.`);
    });
    fileStream.removeAllListeners('error');
    fileStream.removeAllListeners('finish');
  }
  activeStreams.delete(ws);
  streamMetadataStore.delete(ws);

  const timeoutId = metadataTimeouts.get(ws);
  if (timeoutId) {
    clearTimeout(timeoutId);
    metadataTimeouts.delete(ws);
  }
  console.log(`[${clientDesc}] Cleaned up resources.`);
}

wss.on('connection', (ws) => {
  let clientIP = 'unknown';
  try {
    clientIP = (ws as any)._socket?.remoteAddress || (ws as any).remoteAddress || clientIP;
  } catch (e) { /* ignore, just trying to get IP */ }
  let clientDescription = `Client @ ${clientIP}`;
  console.log(`${clientDescription} connected.`);

  // Set a timeout for receiving metadata
  const timeoutId = setTimeout(() => {
    if (!streamMetadataStore.has(ws)) { // If no metadata received yet
      console.warn(`[${clientDescription}] Metadata timeout. Closing connection.`);
      ws.terminate(); // This will trigger 'close' event for cleanup
    }
  }, METADATA_TIMEOUT_MS);
  metadataTimeouts.set(ws, timeoutId);

  ws.on('message', (message: WebSocket.Data, isBinary: boolean) => {
    try {
      if (!streamMetadataStore.has(ws) && !isBinary && typeof message === 'string') { // First message must be metadata
        // Clear the metadata timeout
        const currentTimeoutId = metadataTimeouts.get(ws);
        if (currentTimeoutId) {
          clearTimeout(currentTimeoutId);
          metadataTimeouts.delete(ws);
        }

        const metadata: StreamMetadata = JSON.parse(message);
        // Update clientDescription once metadata is known
        clientDescription = `Client for stream ${metadata.id} (${metadata.fileName} from ${clientIP})`;
        console.log(`[${clientDescription}] Received metadata:`, metadata);

        if (!metadata.id || !metadata.type || !metadata.fileName) {
          console.error(`[${clientDescription}] Invalid metadata received.`);
          ws.send(JSON.stringify({ error: 'Invalid metadata', streamId: metadata.id }));
          ws.terminate();
          return;
        }

        const safeFileName = path.basename(metadata.fileName);
        // Allow only alphanumeric, dots, hyphens, underscores. Adjust regex as needed.
        if (safeFileName !== metadata.fileName || !safeFileName.match(/^[\w.-]+$/)) {
            console.error(`[${clientDescription}] Unsafe or invalid filename rejected:`, metadata.fileName);
            ws.send(JSON.stringify({ error: 'Invalid filename (unsafe or invalid characters)', streamId: metadata.id }));
            ws.terminate();
            return;
        }
        metadata.fileName = safeFileName;

        const filePath = path.join(UPLOADS_DIR, safeFileName);

        // FILE OVERWRITE STRATEGY: Currently overwrites.
        // For production, consider alternatives:
        // 1. Generate unique names: e.g., append timestamp or UUID.
        // 2. Versioning: Store multiple versions if needed.
        // 3. Error if exists: Refuse to overwrite and send error to client.
        if (fs.existsSync(filePath)) {
            console.warn(`[${clientDescription}] File ${safeFileName} already exists and will be overwritten.`);
        }

        const fileStream = fs.createWriteStream(filePath);

        fileStream.on('error', (err) => {
            console.error(`[${clientDescription}] File stream error for ${safeFileName}:`, err);
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ error: 'File stream write error on server', streamId: metadata.id, fileName: safeFileName, detail: err.message }));
            }
            cleanupConnection(ws, clientDescription);
        });

        fileStream.on('finish', () => {
            console.log(`[${clientDescription}] File stream for ${safeFileName} finished writing successfully.`);
        });

        activeStreams.set(ws, fileStream);
        streamMetadataStore.set(ws, metadata);

        console.log(`[${clientDescription}] Streaming setup complete. File: ${filePath}. Ready for data.`);
        ws.send(JSON.stringify({ status: 'ready_for_data', id: metadata.id, fileName: safeFileName }));

      } else if (streamMetadataStore.has(ws) && isBinary && Buffer.isBuffer(message)) {
        const fileStream = activeStreams.get(ws);
        const metadata = streamMetadataStore.get(ws)!; // Should exist if in streamMetadataStore

        if (fileStream) { // Check if fileStream is still valid (not closed by an error)
          if (!fileStream.write(message)) {
            // Basic backpressure logging; real backpressure needs ws.pause/resume & stream 'drain'
            // console.warn(`[${clientDescription}] High water mark for ${metadata.fileName}. Consider WS flow control.`);
          }
        } else {
          console.warn(`[${clientDescription}] Received binary data but no active file stream (it might have errored out). Ignoring.`);
        }
      } else {
        if (!streamMetadataStore.has(ws) && isBinary) {
            console.warn(`[${clientDescription}] Received binary data before metadata. Ignoring.`);
            ws.send(JSON.stringify({ error: 'Binary data sent before metadata handshake.'}));
            // ws.terminate(); // Optionally terminate
        } else if (typeof message === 'string') {
            console.warn(`[${clientDescription}] Received unexpected string message after streaming started or invalid initial message: ${message.substring(0,100)}...`);
        } else {
            console.warn(`[${clientDescription}] Received unexpected message type. isBinary: ${isBinary}, type: ${typeof message}, metadata received: ${streamMetadataStore.has(ws)}`);
        }
      }
    } catch (e: any) {
      const metadata = streamMetadataStore.get(ws);
      const errorContext = metadata ? `stream ${metadata.id}` : (clientDescription || 'unknown client');
      console.error(`[${errorContext}] Error processing message: ${e.message}`, e);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ error: 'Server error processing message', detail: e.message, streamId: metadata?.id }));
      }
      cleanupConnection(ws, clientDescription || 'error processing client');
      // If metadata parsing failed, ws.terminate() might be appropriate.
      if (!streamMetadataStore.has(ws) && e instanceof SyntaxError) { // Likely JSON.parse error
        console.log(`[${clientDescription}] Terminating due to metadata parse error.`);
        ws.terminate();
      }
    }
  });

  ws.on('close', (code, reason) => {
    const finalClientDesc = streamMetadataStore.get(ws) ?
        `Client for stream ${streamMetadataStore.get(ws)!.id} (${streamMetadataStore.get(ws)!.fileName} from ${clientIP})` :
        clientDescription;
    console.log(`[${finalClientDesc}] WebSocket closed. Code: ${code}, Reason: ${reason ? reason.toString() : 'N/A'}`);
    cleanupConnection(ws, finalClientDesc);
  });

  ws.on('error', (error) => {
    const finalClientDesc = streamMetadataStore.get(ws) ?
        `Client for stream ${streamMetadataStore.get(ws)!.id} (${streamMetadataStore.get(ws)!.fileName} from ${clientIP})` :
        clientDescription;
    console.error(`[${finalClientDesc}] WebSocket error:`, error);
    // 'close' event will follow, which handles cleanup.
  });

  ws.on('unexpected-response', (req, res) => {
    console.warn(`[${clientDescription}] Unexpected WebSocket response during handshake. Status: ${res.statusCode}, Message: ${res.statusMessage}`);
  });

  ws.send(JSON.stringify({ status: 'connected_to_server' }));
});

app.get('/', (req, res) => {
  res.send('Real-time Media Server is running. Connect via WebSocket to / for streaming.');
});

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'UP', message: 'Server is healthy' });
});

const runningServer = server.listen(PORT, () => {
  console.log(`Backend server listening on http://localhost:${PORT}`);
  console.log(`WebSocket server available at ws://localhost:${PORT} (maxPayload: ${MAX_WEBSOCKET_PAYLOAD / 1024 / 1024}MB)`);
  console.log(`Uploads will be saved to: ${UPLOADS_DIR}`);
});

const GShutdown = (signal: string) => {
  console.log(`
${signal} received. Starting graceful shutdown...`);

  console.log("Closing WebSocket server (stop new connections)...");
  wss.close((err) => {
    if (err) console.error("Error closing WebSocket server:", err);
    else console.log("WebSocket server closed.");

    console.log(`Closing ${wss.clients.size} active client connections...`);
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.close(1001, "Server is shutting down.");
      }
    });

    console.log("Closing HTTP server...");
    runningServer.close((err) => {
      if (err) {
        console.error("Error closing HTTP server:", err);
        process.exit(1);
      }
      console.log("HTTP server closed.");
      console.log("Graceful shutdown complete.");
      process.exit(0);
    });

    setTimeout(() => {
      console.error("Graceful shutdown timed out. Forcing exit.");
      process.exit(1);
    }, 10000);
  });
};

process.on('SIGINT', () => GShutdown('SIGINT'));
process.on('SIGTERM', () => GShutdown('SIGTERM'));
process.on('SIGQUIT', () => GShutdown('SIGQUIT'));

export default server;
