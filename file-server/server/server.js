// server/server.js
// This is the main server application file.
// Save this as `server.js` in your `server` directory.

const express = require('express');
const https = require('https'); // Use HTTPS for WebRTC in production
const fs = require('fs');
const { Server } = require('socket.io');
const mediasoup = require('mediasoup');
const path = require('path');

const app = express();
const port = 3000;

// --- HTTPS setup (for local development, self-signed certificate) ---
// In a real application, you'd get proper SSL certificates.
// For testing, you can generate self-signed certs using openssl:
// 1. openssl genrsa -out key.pem 2048
// 2. openssl req -new -key key.pem -out csr.pem
// 3. openssl x509 -req -days 365 -in csr.pem -signkey key.pem -out cert.pem

try {
    const options = {
        key: fs.readFileSync(path.join(__dirname, 'key.pem')),
        cert: fs.readFileSync(path.join(__dirname, 'cert.pem'))
    };
    var server = https.createServer(options, app);
} catch (e) {
    console.error("Error loading SSL certificates. Make sure 'key.pem' and 'cert.pem' are in the server directory.");
    console.error("Generate them using the openssl commands provided in the comments above.");
    process.exit(1); // Exit if certificates are missing
}


const io = new Server(server, {
    cors: {
        origin: "*", // WARNING: For production, restrict this to your client's actual domain(s)
        methods: ["GET", "POST"]
    }
});

// --- Mediasoup Worker and Router global variables ---
let worker;

// --- Mediasoup state storage ---
// Stores active WebRTC transports, producers, and consumers for each client.
// Structure: { roomId: { router: MediasoupRouter, peers: { socketId: { transports: Map, producers: Map, consumers: Map, socket: Socket.ioSocket } } } }
const rooms = {};

// --- Mediasoup configuration ---
const config = {
    // Mediasoup Worker settings
    worker: {
        rtcMinPort: 10000,
        rtcMaxPort: 10100,
        logLevel: 'warn',
        logTags: [
            'info',
            'ice',
            'dtls',
            'rtp',
            'srtp',
            'rtcp',
            'rbe',
            'rtx',
            'bwe',
            'score',
            'simulcast',
            'svc',
            'sctp',
        ],
    },
    // Mediasoup Router settings
    router: {
        mediaCodecs: [
            {
                kind: 'audio',
                mimeType: 'audio/opus',
                clockRate: 48000,
                channels: 2
            },
            {
                kind: 'video',
                mimeType: 'video/VP8',
                clockRate: 90000,
                parameters: {
                    'x-google-start-bitrate': 1000
                }
            },
            {
                kind: 'video',
                mimeType: 'video/VP9',
                clockRate: 90000,
                parameters: {
                    'profile-id': 2,
                    'x-google-start-bitrate': 1000
                }
            },
            {
                kind: 'video',
                mimeType: 'video/H264',
                clockRate: 90000,
                parameters: {
                    'packetization-mode': 1,
                    'profile-level-id': '42e01f',
                    'level-asymmetry-allowed': 1,
                    'x-google-start-bitrate': 1000
                }
            }
        ]
    },
    // WebRTC Transport settings
    webRtcTransport: {
        // IMPORTANT: For production, 'announcedIp' should be your server's public IP address.
        // If behind a NAT, 'ip' should be the private IP and 'announcedIp' the public.
        listenIps: [
            { ip: '127.0.0.1', announcedIp: null }
        ],
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
        enableSctp: false, // Set to true if you need WebRTC Data Channels
        initialAvailableOutgoingBitrate: 1000000 // 1 Mbps
    }
};

// --- Mediasoup Worker initialization ---
async function startMediasoupWorker() {
    worker = await mediasoup.createWorker({
        rtcMinPort: config.worker.rtcMinPort,
        rtcMaxPort: config.worker.rtcMaxPort,
        logLevel: config.worker.logLevel,
        logTags: config.worker.logTags,
    });

    // Handle worker errors
    worker.on('died', () => {
        console.error('Mediasoup worker died, exiting in 2 seconds... [pid:%d]', worker.pid);
        setTimeout(() => process.exit(1), 2000);
    });

    console.log('Mediasoup worker started [pid:%d]', worker.pid);
}

// Start the Mediasoup worker when the server initializes
startMediasoupWorker();

// --- Express static files setup (for serving client-side HTML/JS) ---
app.use(express.static(path.join(__dirname, '../client')));

// --- Socket.IO connection handling ---
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // `currentRoomId` will store the room ID this socket is currently in
    let currentRoomId;

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        if (currentRoomId && rooms[currentRoomId]) {
            const room = rooms[currentRoomId];
            const peer = room.peers[socket.id];

            if (peer) {
                // Close all Mediasoup entities associated with this disconnected peer
                peer.producers.forEach(producer => producer.close());
                peer.consumers.forEach(consumer => consumer.close());
                peer.transports.forEach(transport => transport.close());

                // Remove the peer from the room's state
                delete room.peers[socket.id];
                console.log(`Peer ${socket.id} removed from room ${currentRoomId}`);

                // Inform remaining peers in the room that this peer has disconnected
                socket.to(currentRoomId).emit('peerDisconnected', { socketId: socket.id });
            }

            // If no more peers in the room, close the Mediasoup Router and delete the room
            if (Object.keys(room.peers).length === 0) {
                room.router.close();
                delete rooms[currentRoomId];
                console.log(`Room ${currentRoomId} closed due to no active peers.`);
            }
        }
    });

    // Handle 'joinRoom' event from client
    socket.on('joinRoom', async ({ roomId }, callback) => {
        console.log(`Client ${socket.id} attempting to join room ${roomId}`);
        currentRoomId = roomId;

        if (!rooms[roomId]) {
            // Create a new Mediasoup Router for the room if it doesn't exist
            const newRouter = await worker.createRouter({ mediaCodecs: config.router.mediaCodecs });
            rooms[roomId] = {
                router: newRouter,
                peers: {}
            };
            console.log(`New Mediasoup Router created for room: ${roomId}`);
        }

        // Add the peer to the room's state
        rooms[roomId].peers[socket.id] = {
            transports: new Map(), // Map<transportId, MediasoupTransport> for this peer
            producers: new Map(),  // Map<producerId, MediasoupProducer> for this peer
            consumers: new Map(),  // Map<consumerId, MediasoupConsumer> for this peer
            socket: socket         // Reference to the socket for direct emits
        };

        // Send back the router's RTP capabilities to the client for device loading
        callback({
            routerRtpCapabilities: rooms[roomId].router.rtpCapabilities
        });

        // Inform other peers in the room about the newly joined peer (optional, but good for UI)
        socket.to(roomId).emit('newPeer', { socketId: socket.id });

        // Join the socket.io room for easy broadcasting
        socket.join(roomId);
        console.log(`Client ${socket.id} joined socket.io room ${roomId}`);
    });

    // Handle 'createWebRtcTransport' event from client
    socket.on('createWebRtcTransport', async ({ isProducer }, callback) => {
        try {
            const transport = await rooms[currentRoomId].router.createWebRtcTransport(config.webRtcTransport);

            // Event listeners for transport state changes
            transport.on('dtlsstatechange', (dtlsState) => {
                console.log(`Transport ${transport.id} DTLS state changed to: ${dtlsState}`);
                if (dtlsState === 'closed') {
                    console.log('Transport DTLS state closed, closing transport:', transport.id);
                    // transport.close(); // Mediasoup automatically closes on dtls 'closed' in some cases
                }
            });

            transport.on('close', () => {
                console.log('Transport closed:', transport.id);
                // Remove from peer's transports map
                if (rooms[currentRoomId] && rooms[currentRoomId].peers[socket.id]) {
                    rooms[currentRoomId].peers[socket.id].transports.delete(transport.id);
                }
            });

            // Store the transport in the peer's state
            rooms[currentRoomId].peers[socket.id].transports.set(transport.id, transport);

            // Send transport parameters back to the client
            callback({
                id: transport.id,
                iceParameters: transport.iceParameters,
                iceCandidates: transport.iceCandidates,
                dtlsParameters: transport.dtlsParameters
            });
        } catch (error) {
            console.error('Error creating WebRTC transport:', error);
            callback({ error: error.message });
        }
    });

    // Handle 'connectWebRtcTransport' event from client (DTLS handshake)
    socket.on('connectWebRtcTransport', async ({ transportId, dtlsParameters }) => {
        const transport = rooms[currentRoomId].peers[socket.id].transports.get(transportId);
        if (!transport) {
            console.error(`Transport ${transportId} not found for client ${socket.id}.`);
            return;
        }
        try {
            await transport.connect({ dtlsParameters });
            console.log(`Transport ${transportId} connected successfully.`);
        } catch (error) {
            console.error(`Error connecting transport ${transportId}:`, error);
        }
    });

    // Handle 'produce' event from client (client sending media to server)
    socket.on('produce', async ({ transportId, kind, rtpParameters, appData }, callback) => {
        const transport = rooms[currentRoomId].peers[socket.id].transports.get(transportId);
        if (!transport) {
            console.error(`Producer transport ${transportId} not found for client ${socket.id}.`);
            callback({ error: 'Transport not found' });
            return;
        }

        try {
            // Create a Mediasoup Producer on the server
            const producer = await transport.produce({ kind, rtpParameters, appData });

            // Store the producer in the peer's state
            rooms[currentRoomId].peers[socket.id].producers.set(producer.id, producer);

            // Event listener for producer transport closure
            producer.on('transportclose', () => {
                console.log('Producer transport closed, closing producer:', producer.id);
                rooms[currentRoomId].peers[socket.id].producers.delete(producer.id);
            });

            // Event listener for producer closure
            producer.on('close', () => {
                console.log('Producer closed:', producer.id);
                rooms[currentRoomId].peers[socket.id].producers.delete(producer.id);
                // Inform all other clients in the room that this producer is no longer available
                socket.to(currentRoomId).emit('producerClosed', { producerId: producer.id, producerSocketId: socket.id });
            });


            // Notify other peers in the room about the new producer
            // The producing client itself does not need to consume its own stream via the SFU.
            socket.to(currentRoomId).emit('newProducer', {
                producerId: producer.id,
                producerSocketId: socket.id,
                kind: producer.kind
            });

            // Send the producer ID back to the client
            callback({ id: producer.id });
        } catch (error) {
            console.error('Error producing:', error);
            callback({ error: error.message });
        }
    });

    // Handle 'consume' event from client (client requesting to receive media from a remote producer)
    socket.on('consume', async ({ consumerTransportId, producerId, rtpCapabilities }, callback) => {
        try {
            const consumerTransport = rooms[currentRoomId].peers[socket.id].transports.get(consumerTransportId);
            if (!consumerTransport) {
                console.error(`Consumer transport ${consumerTransportId} not found for client ${socket.id}.`);
                callback({ error: 'Consumer transport not found' });
                return;
            }

            // Find the actual producer object across all peers in the room
            let targetProducer = null;
            for (const peerSocketId in rooms[currentRoomId].peers) {
                targetProducer = rooms[currentRoomId].peers[peerSocketId].producers.get(producerId);
                if (targetProducer) break;
            }

            if (!targetProducer) {
                console.error(`Producer ${producerId} not found in room ${currentRoomId}.`);
                callback({ error: 'Producer not found' });
                return;
            }

            // Check if the router can consume this producer's media with the client's RTP capabilities
            if (!rooms[currentRoomId].router.canConsume({ producerId: targetProducer.id, rtpCapabilities })) {
                console.error(`Router cannot consume producer ${targetProducer.id} for client ${socket.id} due to RTP capabilities mismatch.`);
                callback({ error: 'Router cannot consume this producer' });
                return;
            }

            // Create a Mediasoup Consumer on the server
            const consumer = await consumerTransport.consume({
                producerId: targetProducer.id,
                rtpCapabilities,
                paused: false // Start unpaused
            });

            // Store the consumer in the peer's state
            rooms[currentRoomId].peers[socket.id].consumers.set(consumer.id, consumer);

            // Event listeners for consumer state changes
            consumer.on('transportclose', () => {
                console.log('Consumer transport closed:', consumer.id);
                rooms[currentRoomId].peers[socket.id].consumers.delete(consumer.id);
            });

            consumer.on('producerclose', () => {
                console.log('Consumer producer closed:', consumer.id);
                rooms[currentRoomId].peers[socket.id].consumers.delete(consumer.id);
                // Inform the client that the producer is no longer available
                socket.emit('producerClosed', { producerId: consumer.producerId });
            });

            // Send consumer parameters back to the client
            callback({
                id: consumer.id,
                producerId: targetProducer.id,
                kind: consumer.kind,
                rtpParameters: consumer.rtpParameters,
                type: consumer.type,
                appData: consumer.appData,
                producerPaused: consumer.producerPaused // Indicate if the producer is currently paused
            });

        } catch (error) {
            console.error('Error consuming:', error);
            callback({ error: error.message });
        }
    });

    // Socket.IO event to get a list of current producers in the room for a newly joined peer
    socket.on('getProducers', (callback) => {
        if (!currentRoomId || !rooms[currentRoomId]) {
            callback({ producers: [] });
            return;
        }

        const producersInRoom = [];
        const currentRoom = rooms[currentRoomId];
        for (const peerSocketId in currentRoom.peers) {
            if (peerSocketId === socket.id) continue; // Don't send this client's own producers to itself

            const peerProducers = currentRoom.peers[peerSocketId].producers;
            for (const [producerId, producer] of peerProducers.entries()) {
                producersInRoom.push({
                    producerId: producer.id,
                    producerSocketId: peerSocketId, // The socket ID of the peer owning this producer
                    kind: producer.kind
                });
            }
        }
        callback({ producers: producersInRoom });
    });

    // Handle 'resumeConsumer' event from client
    socket.on('resumeConsumer', async ({ consumerId }) => {
        const consumer = rooms[currentRoomId].peers[socket.id].consumers.get(consumerId);
        if (consumer) {
            await consumer.resume();
            console.log('Consumer resumed:', consumerId);
        } else {
            console.warn(`Consumer ${consumerId} not found for client ${socket.id} to resume.`);
        }
    });

    // Handle 'pauseProducer' event from client
    socket.on('pauseProducer', async ({ producerId }) => {
        const producer = rooms[currentRoomId].peers[socket.id].producers.get(producerId);
        if (producer) {
            await producer.pause();
            console.log('Producer paused:', producerId);
        } else {
            console.warn(`Producer ${producerId} not found for client ${socket.id} to pause.`);
        }
    });

    // Handle 'resumeProducer' event from client
    socket.on('resumeProducer', async ({ producerId }) => {
        const producer = rooms[currentRoomId].peers[socket.id].producers.get(producerId);
        if (producer) {
            await producer.resume();
            console.log('Producer resumed:', producerId);
        } else {
            console.warn(`Producer ${producerId} not found for client ${socket.id} to resume.`);
        }
    });

    // Handle 'closeProducer' event initiated by client (e.g., stopping camera/mic)
    socket.on('closeProducer', async ({ producerId }) => {
        const producer = rooms[currentRoomId].peers[socket.id].producers.get(producerId);
        if (producer) {
            producer.close(); // This will trigger the 'close' event on the producer itself
            // No need to delete from map here, as the 'close' event handler will do it.
            console.log(`Producer ${producerId} explicitly closed by client ${socket.id}`);
            // Other peers will be notified via the producer's 'close' event handler.
        } else {
            console.warn(`Producer ${producerId} not found for client ${socket.id} to close.`);
        }
    });
});

// Start the HTTPS server
server.listen(port, () => {
    console.log(`Mediasoup SFU Server listening on https://localhost:${port}`);
    console.log('Ensure self-signed SSL certificates (key.pem, cert.pem) are present in the server directory.');
});
