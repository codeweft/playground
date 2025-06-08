// client/main.js
// This is the main JavaScript file for the client-side application.
// Save this as `main.js` in your `client` directory.

document.addEventListener('DOMContentLoaded', () => {
    // UI Elements
    const roomIdInput = document.getElementById('roomIdInput');
    const joinRoomBtn = document.getElementById('joinRoomBtn');
    const startWebcamBtn = document.getElementById('startWebcamBtn');
    const stopWebcamBtn = document.getElementById('stopWebcamBtn');
    const toggleMicBtn = document.getElementById('toggleMicBtn');
    const localVideo = document.getElementById('localVideo');
    const videoContainer = document.getElementById('videoContainer');
    const statusMessage = document.getElementById('statusMessage');

    // Socket.IO connection
    const socket = io('https://localhost:3000', {
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        randomizationFactor: 0.5
    });

    // Mediasoup-client variables
    let device;
    let rtpCapabilities;
    let producerTransport; // For sending local media
    let consumerTransport; // For receiving remote media
    let videoProducer;
    let audioProducer;
    let localStream; // Local MediaStream from getUserMedia

    // Store remote consumers
    // Map<consumerId, { consumer: MediasoupConsumer, videoElement: HTMLVideoElement }>
    const remoteConsumers = new Map();
    // Map<producerId, socketId> to track which socket owns which producer
    const remoteProducersInfo = new Map();

    // --- Utility Functions ---

    /**
     * Displays a temporary status message to the user.
     * @param {string} message The message to display.
     * @param {string} type 'success' (green) or 'error' (red)
     */
    function showStatusMessage(message, type = 'success') {
        statusMessage.textContent = message;
        statusMessage.className = 'status-message show'; // Reset classes
        if (type === 'error') {
            statusMessage.style.backgroundColor = '#f44336'; // Red for error
        } else {
            statusMessage.style.backgroundColor = '#4CAF50'; // Green for success
        }
        setTimeout(() => {
            statusMessage.classList.remove('show');
        }, 3000); // Message disappears after 3 seconds
    }

    /**
     * Adds a new video element for a remote stream.
     * @param {string} id The ID for the video element (often producerId).
     * @param {string} label A label to display on the video.
     * @returns {HTMLVideoElement} The created video element.
     */
    function addVideoElement(id, label) {
        const videoWrapper = document.createElement('div');
        videoWrapper.id = `videoWrapper-${id}`;
        videoWrapper.className = 'relative';

        const video = document.createElement('video');
        video.id = `video-${id}`;
        video.autoplay = true;
        video.playsInline = true;
        video.className = 'block w-full h-auto rounded-lg'; // Tailwind classes for styling

        const videoLabel = document.createElement('p');
        videoLabel.className = 'absolute bottom-2 left-2 bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded';
        videoLabel.textContent = label;

        videoWrapper.appendChild(video);
        videoWrapper.appendChild(videoLabel);
        videoContainer.appendChild(videoWrapper);
        return video;
    }

    /**
     * Removes a video element from the DOM.
     * @param {string} id The ID of the producer associated with the video element to remove.
     */
    function removeVideoElement(id) {
        const videoWrapper = document.getElementById(`videoWrapper-${id}`);
        if (videoWrapper) {
            videoWrapper.remove();
        }
    }

    // --- Mediasoup Client Logic ---

    /**
     * Initializes the mediasoup Device with the router's RTP capabilities.
     */
    async function loadDevice() {
        try {
            device = new mediasoupClient.Device();
            await device.load({ routerRtpCapabilities });
            showStatusMessage('Mediasoup device loaded successfully!');
            console.log('Mediasoup Device loaded:', device);
            startWebcamBtn.disabled = false; // Enable webcam button once device is ready
        } catch (error) {
            console.error('Error loading mediasoup device:', error);
            if (error.name === 'UnsupportedError') {
                showStatusMessage('Browser not supported for WebRTC.', 'error');
            } else {
                showStatusMessage(`Failed to load device: ${error.message}`, 'error');
            }
        }
    }

    /**
     * Creates a WebRTC Transport for producing (sending) media to the server.
     */
    async function createProducerTransport() {
        console.log('Creating producer transport...');
        return new Promise((resolve, reject) => {
            socket.emit('createWebRtcTransport', { isProducer: true }, ({ id, iceParameters, iceCandidates, dtlsParameters, error }) => {
                if (error) {
                    console.error('Error from server creating producer transport:', error);
                    reject(error);
                    return;
                }

                producerTransport = device.createSendTransport({
                    id,
                    iceParameters,
                    iceCandidates,
                    dtlsParameters,
                    // If you have STUN/TURN servers, configure them here:
                    // iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
                });

                // 'connect' event for the producer transport: server needs DTLS parameters
                producerTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
                    socket.emit('connectWebRtcTransport', { transportId: producerTransport.id, dtlsParameters }, () => {
                        callback(); // Inform mediasoup-client that DTLS handshake is complete
                    });
                });

                // 'produce' event for the producer transport: client is ready to send a track
                producerTransport.on('produce', async ({ kind, rtpParameters, appData }, callback, errback) => {
                    try {
                        socket.emit('produce', { transportId: producerTransport.id, kind, rtpParameters, appData }, ({ id, error }) => {
                            if (error) {
                                console.error('Error from server producing:', error);
                                errback(error);
                                return;
                            }
                            callback({ id }); // Inform mediasoup-client of the producer ID
                        });
                    } catch (error) {
                        console.error('Error on producerTransport produce event:', error);
                        errback(error);
                    }
                });

                // 'connectionstatechange' event for the producer transport
                producerTransport.on('connectionstatechange', (state) => {
                    console.log('Producer transport connection state:', state);
                    if (state === 'failed') {
                        producerTransport.close();
                        showStatusMessage('Producer transport failed. Please refresh.', 'error');
                    }
                });

                console.log('Producer transport created.');
                resolve(producerTransport);
            });
        });
    }

    /**
     * Creates a WebRTC Transport for consuming (receiving) media from the server.
     */
    async function createConsumerTransport() {
        console.log('Creating consumer transport...');
        return new Promise((resolve, reject) => {
            socket.emit('createWebRtcTransport', { isProducer: false }, ({ id, iceParameters, iceCandidates, dtlsParameters, error }) => {
                if (error) {
                    console.error('Error from server creating consumer transport:', error);
                    reject(error);
                    return;
                }

                consumerTransport = device.createRecvTransport({
                    id,
                    iceParameters,
                    iceCandidates,
                    dtlsParameters,
                    // iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
                });

                // 'connect' event for the consumer transport
                consumerTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
                    socket.emit('connectWebRtcTransport', { transportId: consumerTransport.id, dtlsParameters }, () => {
                        callback();
                    });
                });

                // 'connectionstatechange' event for the consumer transport
                consumerTransport.on('connectionstatechange', (state) => {
                    console.log('Consumer transport connection state:', state);
                    if (state === 'failed') {
                        consumerTransport.close();
                        showStatusMessage('Consumer transport failed. Please refresh.', 'error');
                    }
                });

                console.log('Consumer transport created.');
                resolve(consumerTransport);
            });
        });
    }

    /**
     * Starts producing local audio/video streams (webcam and microphone).
     */
    async function startProducing() {
        try {
            // Request local media stream
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            localVideo.srcObject = localStream; // Display local video in the UI

            // Create producer transport if not already created
            if (!producerTransport) {
                await createProducerTransport();
            }

            // Produce video track
            const videoTrack = localStream.getVideoTracks()[0];
            if (videoTrack) {
                videoProducer = await producerTransport.produce({
                    track: videoTrack,
                    encodings: [
                        { scalabilityMode: 'S3T3', dtx: true }, // Example encodings for simulcast
                    ],
                    codecOptions: {
                        videoGoogleStartBitrate: 1000
                    },
                    appData: { type: 'video' } // Custom data associated with this producer
                });
                console.log('Video producer created:', videoProducer.id);
            }

            // Produce audio track
            const audioTrack = localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioProducer = await producerTransport.produce({
                    track: audioTrack,
                    appData: { type: 'audio' } // Custom data associated with this producer
                });
                console.log('Audio producer created:', audioProducer.id);
                toggleMicBtn.disabled = false;
                toggleMicBtn.textContent = 'Toggle Mic (On)';
            }

            // Update UI buttons
            startWebcamBtn.disabled = true;
            stopWebcamBtn.disabled = false;
            showStatusMessage('Webcam and mic started!');

            // After starting local production, request existing producers in the room
            getExistingProducers();

        } catch (error) {
            console.error('Error starting webcam and mic:', error);
            showStatusMessage(`Failed to start webcam: ${error.message}`, 'error');
            startWebcamBtn.disabled = false; // Re-enable button on failure
        }
    }

    /**
     * Stops producing local audio/video streams and closes related producers.
     */
    function stopProducing() {
        // Close Mediasoup producers
        if (videoProducer) {
            videoProducer.close();
            videoProducer = null;
            console.log('Video producer closed.');
        }
        if (audioProducer) {
            audioProducer.close();
            audioProducer = null;
            console.log('Audio producer closed.');
            toggleMicBtn.disabled = true;
            toggleMicBtn.textContent = 'Toggle Mic (Off)';
        }

        // Stop local MediaStream tracks
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            localStream = null;
            localVideo.srcObject = null;
            console.log('Local stream stopped.');
        }

        // Close producer transport (optional, but good practice if no more media is sent)
        // This will also implicitly close any remaining producers associated with it
        if (producerTransport && producerTransport.connectionState !== 'closed') {
            producerTransport.close();
            producerTransport = null;
            console.log('Producer transport closed.');
        }

        // Update UI buttons
        startWebcamBtn.disabled = false;
        stopWebcamBtn.disabled = true;
        showStatusMessage('Webcam and mic stopped.');
    }

    /**
     * Consumes a remote producer's stream (receives media from another peer via SFU).
     * @param {string} producerId The ID of the producer on the server to consume.
     * @param {string} producerSocketId The socket ID of the peer owning this producer.
     * @param {string} kind 'audio' or 'video'.
     */
    async function consumeProducer(producerId, producerSocketId, kind) {
        try {
            // Check if the device can consume this producer given its RTP capabilities
            if (!device.canConsume({ producerId, rtpCapabilities })) {
                console.warn(`Cannot consume producer ${producerId} (kind: ${kind}) from ${producerSocketId} due to RTP capabilities mismatch.`);
                return;
            }

            // Create consumer transport if not already created
            if (!consumerTransport) {
                await createConsumerTransport();
            }

            console.log(`Attempting to consume producer ${producerId} (kind: ${kind}) from peer ${producerSocketId}`);

            // Request consumer parameters from the server
            socket.emit('consume', {
                consumerTransportId: consumerTransport.id,
                producerId: producerId,
                rtpCapabilities: device.rtpCapabilities
            }, async ({ id, producerId: serverProducerId, kind: serverKind, rtpParameters, type, appData, producerPaused, error }) => {
                if (error) {
                    console.error('Error from server consuming:', error);
                    showStatusMessage(`Failed to consume ${kind} from ${producerSocketId}: ${error}`, 'error');
                    return;
                }

                // Create a Mediasoup Consumer on the client side
                const consumer = await consumerTransport.consume({
                    id,
                    producerId: serverProducerId,
                    kind: serverKind,
                    rtpParameters,
                    appData,
                    paused: producerPaused // Start paused if the producer is already paused
                });
                console.log(`Consumer for producer ${producerId} created:`, consumer);

                // Create a new MediaStream and add the consumer's track to it
                const stream = new MediaStream();
                stream.addTrack(consumer.track);

                let videoElement;
                if (consumer.kind === 'video') {
                    // Create and add a video element for the remote video stream
                    videoElement = addVideoElement(producerId, `Peer: ${producerSocketId.substring(0, 5)}...`);
                    videoElement.srcObject = stream;
                    console.log(`Remote video for producer ${producerId} attached.`);
                } else if (consumer.kind === 'audio') {
                    // For audio, we can create a hidden audio element or attach to an existing video element
                    // For simplicity, if there's a video stream from the same peer, attach audio to that video element.
                    // Otherwise, create a separate hidden audio element.
                    let targetVideo = document.getElementById(`video-${producerId}`); // Look for video from same producerId
                    if (targetVideo) {
                        targetVideo.srcObject.addTrack(consumer.track);
                    } else {
                        // If only audio is sent, create a dedicated audio element (hidden)
                        videoElement = document.createElement('audio');
                        videoElement.autoplay = true;
                        videoElement.playsInline = true;
                        videoElement.srcObject = stream;
                        videoElement.style.display = 'none'; // Hide audio elements
                        document.body.appendChild(videoElement);
                    }
                    console.log(`Remote audio for producer ${producerId} attached.`);
                }

                // Store the consumer and its associated video element
                remoteConsumers.set(consumer.id, { consumer, videoElement });

                // Event listeners for consumer state changes
                consumer.on('trackended', () => {
                    console.log(`Consumer track ended for producer ${producerId}`);
                    // Remove the associated video/audio element if the track ends
                    if (consumer.kind === 'video') {
                        removeVideoElement(producerId);
                    } else if (videoElement && consumer.kind === 'audio') {
                        videoElement.remove();
                    }
                    remoteConsumers.delete(consumer.id);
                    remoteProducersInfo.delete(producerId); // Also clean up info map
                });

                consumer.on('transportclose', () => {
                    console.log(`Consumer transport closed for producer ${producerId}`);
                    if (consumer.kind === 'video') {
                        removeVideoElement(producerId);
                    } else if (videoElement && consumer.kind === 'audio') {
                        videoElement.remove();
                    }
                    remoteConsumers.delete(consumer.id);
                    remoteProducersInfo.delete(producerId);
                });

                consumer.on('producerclose', () => {
                    console.log(`Consumer producer closed for producer ${producerId}`);
                    if (consumer.kind === 'video') {
                        removeVideoElement(producerId);
                    } else if (videoElement && consumer.kind === 'audio') {
                        videoElement.remove();
                    }
                    remoteConsumers.delete(consumer.id);
                    remoteProducersInfo.delete(producerId);
                    showStatusMessage(`Stream from ${producerSocketId.substring(0, 5)}... ended.`, 'error');
                });

                // Resume the consumer on the server side if it was paused initially
                if (consumer.paused) {
                    socket.emit('resumeConsumer', { consumerId: consumer.id });
                }
            });
        } catch (error) {
            console.error('Error consuming producer:', producerId, error);
            showStatusMessage(`Error consuming remote stream: ${error.message}`, 'error');
        }
    }

    /**
     * Requests existing producers in the room from the server after joining.
     */
    function getExistingProducers() {
        socket.emit('getProducers', ({ producers }) => {
            console.log('Existing producers in room:', producers);
            producers.forEach(({ producerId, producerSocketId, kind }) => {
                // Store mapping of producerId to owner socketId
                remoteProducersInfo.set(producerId, producerSocketId);
                // Attempt to consume each existing producer
                consumeProducer(producerId, producerSocketId, kind);
            });
        });
    }

    // --- Event Listeners ---

    joinRoomBtn.addEventListener('click', () => {
        const roomId = roomIdInput.value.trim();
        if (roomId) {
            socket.emit('joinRoom', { roomId }, ({ routerRtpCapabilities: serverRtpCapabilities, error }) => {
                if (error) {
                    showStatusMessage(`Failed to join room: ${error}`, 'error');
                    return;
                }
                rtpCapabilities = serverRtpCapabilities;
                console.log('Joined room. Router RTP Capabilities received:', rtpCapabilities);
                showStatusMessage(`Joined room: ${roomId}`);
                joinRoomBtn.disabled = true;
                roomIdInput.disabled = true;
                loadDevice(); // Load mediasoup-client device after getting capabilities
            });
        } else {
            showStatusMessage('Please enter a Room ID.', 'error');
        }
    });

    startWebcamBtn.addEventListener('click', startProducing);
    stopWebcamBtn.addEventListener('click', stopProducing);

    toggleMicBtn.addEventListener('click', () => {
        if (audioProducer) {
            if (audioProducer.paused) {
                audioProducer.resume();
                socket.emit('resumeProducer', { producerId: audioProducer.id });
                toggleMicBtn.textContent = 'Toggle Mic (On)';
                showStatusMessage('Microphone resumed.');
            } else {
                audioProducer.pause();
                socket.emit('pauseProducer', { producerId: audioProducer.id });
                toggleMicBtn.textContent = 'Toggle Mic (Off)';
                showStatusMessage('Microphone paused.');
            }
        }
    });

    // --- Socket.IO Event Handlers ---

    socket.on('connect', () => {
        console.log('Connected to socket.io server:', socket.id);
        showStatusMessage('Connected to server.');
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from socket.io server.');
        showStatusMessage('Disconnected from server.', 'error');
        // Reset UI and state on disconnect
        joinRoomBtn.disabled = false;
        roomIdInput.disabled = false;
        startWebcamBtn.disabled = true;
        stopWebcamBtn.disabled = true;
        toggleMicBtn.disabled = true;
        localVideo.srcObject = null;
        // Clear all remote videos
        videoContainer.querySelectorAll('.relative:not(#localVideoWrapper)').forEach(el => el.remove());
        remoteConsumers.clear();
        remoteProducersInfo.clear();
        // Close transports if they exist and are not already closed
        if (producerTransport && producerTransport.connectionState !== 'closed') {
            producerTransport.close();
            producerTransport = null;
        }
        if (consumerTransport && consumerTransport.connectionState !== 'closed') {
            consumerTransport.close();
            consumerTransport = null;
        }
        videoProducer = null;
        audioProducer = null;
        localStream = null;
        device = null; // Device needs to be reloaded as well if reconnecting
    });

    // A new peer has joined the room (informational)
    socket.on('newPeer', ({ socketId }) => {
        console.log(`New peer joined: ${socketId}`);
        showStatusMessage(`Peer ${socketId.substring(0, 5)}... joined!`);
    });

    // A new producer has become available from another peer
    socket.on('newProducer', ({ producerId, producerSocketId, kind }) => {
        console.log(`New producer from ${producerSocketId} (kind: ${kind}, id: ${producerId})`);
        remoteProducersInfo.set(producerId, producerSocketId);
        consumeProducer(producerId, producerSocketId, kind); // Attempt to consume this new producer
    });

    // A producer has been closed by its owner (e.g., owner stopped webcam)
    socket.on('producerClosed', ({ producerId, producerSocketId }) => {
        console.log(`Producer ${producerId} closed by owner ${producerSocketId}.`);
        // Find and close the corresponding consumer on this client
        const consumerEntry = Array.from(remoteConsumers.values()).find(entry => entry.consumer.producerId === producerId);
        if (consumerEntry) {
            consumerEntry.consumer.close(); // Close the client-side consumer
            remoteConsumers.delete(consumerEntry.consumer.id); // Remove from map
            // Remove the associated video element
            if (consumerEntry.consumer.kind === 'video') {
                removeVideoElement(producerId);
            }
        }
        remoteProducersInfo.delete(producerId); // Clean up info map
        showStatusMessage(`Stream from ${producerSocketId.substring(0, 5)}... ended.`, 'error');
    });

    // A remote peer has disconnected from the room
    socket.on('peerDisconnected', ({ socketId }) => {
        console.log(`Peer ${socketId} disconnected.`);
        // Find and remove all producers owned by this disconnected peer
        const producersToRemove = Array.from(remoteProducersInfo.entries())
            .filter(([, ownerSocketId]) => ownerSocketId === socketId)
            .map(([producerId]) => producerId);

        producersToRemove.forEach(producerId => {
            // This will trigger 'producerClosed' event from the server, which handles cleanup
            // but we can also manually ensure cleanup here if needed.
            const consumerEntry = Array.from(remoteConsumers.values()).find(entry => entry.consumer.producerId === producerId);
            if (consumerEntry) {
                consumerEntry.consumer.close();
                remoteConsumers.delete(consumerEntry.consumer.id);
                if (consumerEntry.consumer.kind === 'video') {
                    removeVideoElement(producerId);
                }
            }
            remoteProducersInfo.delete(producerId);
        });
        showStatusMessage(`Peer ${socketId.substring(0, 5)}... left the room.`, 'error');
    });


    // Initial state setup for UI buttons
    stopWebcamBtn.disabled = true;
    toggleMicBtn.disabled = true;
});