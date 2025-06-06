// script.js
// This script handles the WebRTC logic for the web browser client.

// DOM elements
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const startButton = document.getElementById('startButton');
const hangupButton = document.getElementById('hangupButton');
const statusDiv = document.getElementById('status'); // Element to display connection status updates

// WebRTC and WebSocket global variables
let localStream; // Represents the local camera and microphone stream
let peerConnection; // RTCPeerConnection object for WebRTC communication
let websocket; // WebSocket for signaling messages
let pendingCandidates = []; // Buffer for ICE candidates received before remoteDescription is set
let isOfferer = false; // Flag to indicate if this peer initiated the call (created the offer)

// WebRTC PeerConnection configuration, including STUN servers for NAT traversal
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

/**
 * Updates the status message displayed on the UI and logs it to the console.
 * @param {string} message - The status message to display.
 */
function updateStatus(message) {
    if (statusDiv) {
        statusDiv.textContent = `Status: ${message}`;
    }
    console.log(`[Status] ${message}`);
}

// --- Signaling (WebSocket) ---

/**
 * Initializes and sets up the WebSocket connection to the signaling server.
 * Handles WebSocket lifecycle events (open, message, error, close).
 */
function setupWebSocket() {
    websocket = new WebSocket('ws://192.168.1.108:8080');
    updateStatus('Connecting to signaling server...');

    websocket.onopen = () => {
        console.log('[WebSocket] Connection established');
        updateStatus('Connected to signaling server');
        startButton.disabled = false; // Enable start button once connected
        hangupButton.disabled = true; // Hangup button is disabled initially
    };

    websocket.onmessage = async (event) => {
        const message = JSON.parse(event.data);
        console.log('[WebSocket] Received message:', message);

        // If peerConnection is not yet established and an offer or candidate is received,
        // it means this peer is the answering party. Initialize media and peer connection.
        if (!peerConnection && (message.offer || message.candidate)) {
            console.log("[WebRTC Setup] PeerConnection not active, initializing for incoming message (answerer role).");
            // Await this call to ensure media and PC are ready BEFORE processing offer/candidate
            const ready = await getLocalMediaAndCreatePeerConnection(false); // 'false' indicates we are the answerer.
            if (!ready) {
                console.error("[WebRTC Setup] Failed to initialize for incoming call. Aborting message handling.");
                updateStatus("Failed to initialize for incoming call.");
                return;
            }
        }

        try {
            if (message.offer) {
                await handleOffer(message.offer);
            } else if (message.answer) {
                await handleAnswer(message.answer);
            } else if (message.candidate) {
                await handleCandidate(message.candidate);
            } else if (message.hangup) {
                handleHangupSignal();
            }
        } catch (error) {
            console.error('[WebSocket Message Handler] Error processing message:', error, message);
            updateStatus(`Error processing message: ${error.message}`);
        }
    };

    websocket.onclose = () => {
        console.log('[WebSocket] Connection closed');
        updateStatus('Disconnected from signaling server. Please refresh or restart server.');
        startButton.disabled = true;
        hangupButton.disabled = true;
        closeConnection(); // Clean up WebRTC resources if WebSocket closes unexpectedly
        alert("WebSocket connection closed. Please refresh the page or restart the server."); // User notification
    };

    websocket.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
        updateStatus('WebSocket error. Check console and server.');
        alert("WebSocket error. Check the console and ensure the server is running."); // User notification
    };
}

/**
 * Sends a message to the signaling server via WebSocket.
 * @param {object} message - The message object to send (e.g., offer, answer, candidate).
 */
function sendMessage(message) {
    if (websocket && websocket.readyState === WebSocket.OPEN) {
        console.log('[WebSocket] Sending message:', message);
        websocket.send(JSON.stringify(message));
    } else {
        console.error('[WebSocket] WebSocket is not open. readyState: ' + (websocket ? websocket.readyState : 'null') + '. Message not sent:', message);
        updateStatus('Error: Not connected to signaling server. Message not sent.');
    }
}

// --- WebRTC Logic ---

/**
 * Acquires the local media stream (camera and microphone) and creates/configures
 * the RTCPeerConnection. This function is called by both the offerer and answerer.
 * @param {boolean} offerer - True if this client is initiating the call (creating an offer).
 * @returns {Promise<boolean>} - True if successful, false otherwise.
 */
async function getLocalMediaAndCreatePeerConnection(offerer) {
    isOfferer = offerer; // Set the global flag to track role
    try {
        // Acquire local media stream if not already obtained
        if (!localStream) {
            updateStatus('Requesting camera and microphone access...');
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            localVideo.srcObject = localStream; // Display local video in the UI
            updateStatus('Local media obtained.');
            console.log('Local stream tracks:', localStream.getTracks().map(t => ({ id: t.id, kind: t.kind, enabled: t.enabled, readyState: t.readyState })));
        }

        // Create RTCPeerConnection if not already created
        if (!peerConnection) {
            createPeerConnection();
        }

        // Add local stream tracks to the peer connection if they haven't been added yet.
        // This is crucial for sending our media to the remote peer.
        const existingSenders = peerConnection.getSenders();
        const hasVideoSender = existingSenders.some(sender => sender.track && sender.track.kind === 'video');
        const hasAudioSender = existingSenders.some(sender => sender.track && sender.track.kind === 'audio');

        if (localStream && peerConnection) {
            // Add tracks only if they are not already present as senders
            if (!hasVideoSender || !hasAudioSender) {
                console.log('[WebRTC] Adding local stream tracks to peer connection...');
                localStream.getTracks().forEach(track => {
                    // Prevent re-adding the same track to avoid errors
                    if (!existingSenders.some(sender => sender.track === track)) {
                        console.log(`[WebRTC] Adding track: ${track.kind} - ${track.id} (enabled: ${track.enabled}, readyState: ${track.readyState})`);
                        peerConnection.addTrack(track, localStream);
                    } else {
                        console.log(`[WebRTC] Track ${track.kind} - ${track.id} already associated with a sender, skipping re-add.`);
                    }
                });
                console.log('[WebRTC] Finished adding tracks. Current senders count:', peerConnection.getSenders().length);
            } else {
                console.log('[WebRTC] All required tracks already appear to be added. Senders count:', peerConnection.getSenders().length);
            }
        } else {
            console.warn('[WebRTC] Cannot add tracks: localStream or peerConnection not ready.');
        }
        return true; // Indicate success
    } catch (error) {
        console.error('[WebRTC] Error accessing media devices or setting up peer connection:', error);
        alert('Error accessing media devices: ' + error.message + '\nPlease check your camera/microphone permissions and browser settings.');
        startButton.disabled = false;
        hangupButton.disabled = true;
        updateStatus('Failed to get media or create peer connection.');
        return false; // Indicate failure
    }
}

/**
 * Initiates the WebRTC call as the offerer.
 */
async function startCall() {
    console.log('[Call] Starting call...');
    startButton.disabled = true; // Disable start button during call setup
    hangupButton.disabled = false; // Enable hangup button
    updateStatus('Initializing call...');

    // Get local media and create peer connection (as offerer)
    const mediaAndPcReady = await getLocalMediaAndCreatePeerConnection(true);
    if (!mediaAndPcReady) {
        console.error('[Call] Failed to prepare for call. Aborting startCall.');
        startButton.disabled = false; // Re-enable start button if setup fails
        return;
    }

    try {
        updateStatus('Creating offer...');
        // Create an offer, explicitly requesting to receive audio and video from the remote peer
        const offer = await peerConnection.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
        });
        await peerConnection.setLocalDescription(offer); // Set local description
        sendMessage({ offer: offer }); // Send offer to signaling server
        updateStatus('Offer sent, waiting for answer...');
    } catch (error) {
        console.error('[Call] Error creating offer:', error);
        updateStatus('Error creating offer.');
        startButton.disabled = false;
        hangupButton.disabled = true;
    }
}

/**
 * Creates and configures a new RTCPeerConnection object, setting up event handlers.
 */
function createPeerConnection() {
    console.log('[WebRTC] Creating new RTCPeerConnection...');
    peerConnection = new RTCPeerConnection(configuration);

    // Event handler for when ICE candidates are generated
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            console.log('[WebRTC] ICE candidate generated:', event.candidate);
            sendMessage({ candidate: event.candidate }); // Send candidate to remote peer
        } else {
            console.log('[WebRTC] ICE candidate gathering finished.');
        }
    };

    // Event handler for when a remote track is received
    peerConnection.ontrack = (event) => {
        console.log('--- [WebRTC] Remote track received:', event);
        if (event.streams && event.streams[0]) {
            console.log('[WebRTC] Setting remoteVideo.srcObject from event.streams[0].');
            remoteVideo.srcObject = event.streams[0]; // Set the first stream as the remote video source
            updateStatus('Remote stream received.');
        } else if (event.track) {
            // Fallback for cases where tracks are received individually or streams array is not immediately populated
            console.log('[WebRTC] Received individual track, adding to MediaStream for remoteVideo.');
            // Create a new MediaStream if one doesn't exist, or add the track to the existing one
            if (!remoteVideo.srcObject) {
                remoteVideo.srcObject = new MediaStream();
            }
            // Add track only if it's not already in the stream (prevents duplicates)
            if (!remoteVideo.srcObject.getTrackById(event.track.id)) {
                remoteVideo.srcObject.addTrack(event.track);
            }
            updateStatus('Remote track received (individual track).');
        } else {
            console.warn('[WebRTC] Ontrack event fired, but no streams or tracks found. Event:', event);
        }
    };

    // Listen for ICE connection state changes to provide feedback and handle disconnections
    peerConnection.oniceconnectionstatechange = () => {
        console.log(`[WebRTC State] ICE connection state change: ${peerConnection.iceConnectionState}`);
        updateStatus(`ICE state: ${peerConnection.iceConnectionState}`);
        if (['failed', 'disconnected', 'closed'].includes(peerConnection.iceConnectionState)) {
            console.error('[WebRTC State] Connection failed or disconnected. Attempting to clean up.');
            alert(`Call connection state: ${peerConnection.iceConnectionState}. The call might have ended unexpectedly.`);
            closeConnection();
        } else if (peerConnection.iceConnectionState === 'connected') {
            updateStatus('Call connected!');
        }
    };

    // Listen for overall peer connection state changes
    peerConnection.onconnectionstatechange = () => {
        console.log(`[WebRTC State] Peer connection state change: ${peerConnection.connectionState}`);
        updateStatus(`Connection state: ${peerConnection.connectionState}`);
    };

    // Listen for signaling state changes
    peerConnection.onsignalingstatechange = () => {
        console.log(`[WebRTC State] Signaling state change: ${peerConnection.signalingState}`);
        updateStatus(`Signaling state: ${peerConnection.signalingState}`);
    };

    console.log('[WebRTC] Peer connection created successfully.');
}

/**
 * Handles an incoming WebRTC offer from the remote peer.
 * @param {RTCSessionDescriptionInit} offer - The offer received from the remote peer.
 */
async function handleOffer(offer) {
    updateStatus('Received offer, setting remote description...');
    // `getLocalMediaAndCreatePeerConnection` should have already prepared local media and PC if this is the answerer.

    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        console.log('[WebRTC] Remote description (offer) set.');

        // Apply any buffered ICE candidates that arrived before the remote description was set
        console.log(`[WebRTC] Applying ${pendingCandidates.length} buffered ICE candidates (after offer).`);
        for (const candidate of pendingCandidates) {
            try {
                await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (e) {
                console.error('[WebRTC] Error adding buffered ICE candidate (offer phase):', e, candidate);
            }
        }
        pendingCandidates = []; // Clear the buffer after applying all candidates

        updateStatus('Creating answer...');
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer); // Set local description for the answer
        sendMessage({ answer: answer }); // Send the answer to the signaling server
        hangupButton.disabled = false; // Enable hangup as we are now in a call
        updateStatus('Answer sent, call established.');
    } catch (error) {
        console.error('[WebRTC] Error handling offer:', error);
        updateStatus('Error handling offer.');
    }
}

/**
 * Handles an incoming WebRTC answer from the remote peer.
 * @param {RTCSessionDescriptionInit} answer - The answer received from the remote peer.
 */
async function handleAnswer(answer) {
    updateStatus('Received answer...');
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        console.log("[WebRTC] Remote description (answer) set. Call established!");

        // Apply any buffered ICE candidates that arrived before the remote description was set
        console.log(`[WebRTC] Applying ${pendingCandidates.length} buffered ICE candidates (after answer).`);
        for (const candidate of pendingCandidates) {
            try {
                await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (e) {
                console.error('[WebRTC] Error adding buffered ICE candidate (answer phase):', e, candidate);
            }
        }
        pendingCandidates = []; // Clear the buffer after applying all candidates

        updateStatus('Call established!');
        hangupButton.disabled = false;
    } catch (error) {
        console.error('[WebRTC] Error handling answer:', error);
        updateStatus('Error handling answer.');
    }
}

/**
 * Handles an incoming ICE candidate from the remote peer.
 * Candidates are buffered if remoteDescription is not yet set.
 * @param {RTCIceCandidateInit} candidate - The ICE candidate received.
 */
async function handleCandidate(candidate) {
    // Ensure peerConnection exists before trying to use it
    if (!peerConnection) {
        console.warn('[WebRTC] Candidate received before peerConnection is initialized. Buffering.');
        pendingCandidates.push(candidate);
        return;
    }

    try {
        if (candidate) {
            // Add candidate immediately only if remoteDescription is set and signaling state is 'stable'
            // This prevents "InvalidStateError: setRemoteDescription has not been called"
            if (peerConnection.remoteDescription && peerConnection.remoteDescription.type && peerConnection.signalingState === 'stable') {
                console.log('[WebRTC] Adding immediate ICE candidate (stable state):', candidate);
                await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            } else {
                console.log('[WebRTC] Buffering ICE candidate (signaling state not stable or remoteDescription not fully set):', candidate);
                pendingCandidates.push(candidate);
            }
        }
    } catch (error) {
        console.error('[WebRTC] Error adding ICE candidate:', error, candidate);
    }
}

/**
 * Initiates the hangup process, notifying the remote peer and cleaning up local resources.
 */
function hangUp() {
    console.log('[Call] Hanging up...');
    sendMessage({ hangup: true }); // Notify the other peer about the hangup
    closeConnection(); // Clean up local resources
}

/**
 * Handles a hangup signal received from the remote peer.
 */
function handleHangupSignal() {
    console.log('[Call] Received hangup signal.');
    updateStatus('Call ended by peer.');
    closeConnection(); // Clean up local resources
    alert("The other party has ended the call."); // Inform the user
}

/**
 * Cleans up all WebRTC and media-related resources.
 */
function closeConnection() {
    console.log('[Cleanup] Closing WebRTC connection and cleaning up resources...');
    if (peerConnection) {
        // Clear all event listeners to prevent memory leaks or unexpected behavior
        peerConnection.onicecandidate = null;
        peerConnection.ontrack = null;
        peerConnection.oniceconnectionstatechange = null;
        peerConnection.onconnectionstatechange = null;
        peerConnection.onsignalingstatechange = null;
        peerConnection.close(); // Close the peer connection
        peerConnection = null;
    }
    if (localStream) {
        localStream.getTracks().forEach(track => {
            console.log(`[Cleanup] Stopping local track: ${track.kind} - ${track.id}`);
            track.stop(); // Stop all tracks to release camera/microphone
        });
        localStream = null;
    }

    // Clear video elements' sources
    if (localVideo) localVideo.srcObject = null;
    if (remoteVideo) remoteVideo.srcObject = null;

    // Reset UI buttons and internal state
    startButton.disabled = false;
    hangupButton.disabled = true;
    pendingCandidates = []; // Clear the buffered candidates
    isOfferer = false; // Reset offerer flag

    updateStatus('Call ended and resources cleaned up.');
    console.log('[Cleanup] Call ended and resources cleaned up.');
}

// --- Event Listeners ---
startButton.addEventListener('click', startCall);
hangupButton.addEventListener('click', hangUp);

// Initialize WebSocket connection when the script loads
setupWebSocket();

// Clean up resources when the page is unloaded (e.g., user closes tab/browser)
window.addEventListener('beforeunload', () => {
    if (websocket && websocket.readyState === WebSocket.OPEN) {
        sendMessage({ hangup: true }); // Attempt to notify other peer before closing
        websocket.close();
    }
    closeConnection(); // Ensure local WebRTC resources are cleaned up
});
