// script.js
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const startButton = document.getElementById('startButton');
const hangupButton = document.getElementById('hangupButton');

let localStream;
let peerConnection;
let websocket;

// Configuration for the RTCPeerConnection
// For a local demo, STUN servers might not be strictly necessary
// but are good practice. Using public Google STUN servers.
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// --- Signaling (WebSocket) ---
function setupWebSocket() {
    websocket = new WebSocket('ws://192.168.1.108:8080');

    websocket.onopen = () => {
        console.log('WebSocket connection established');
        startButton.disabled = false;
    };

    websocket.onmessage = async (event) => {
        const message = JSON.parse(event.data);
        console.log('Received message:', message);

        if (message.offer) {
            await handleOffer(message.offer);
        } else if (message.answer) {
            await handleAnswer(message.answer);
        } else if (message.candidate) {
            await handleCandidate(message.candidate);
        } else if (message.hangup) {
            handleHangupSignal();
        }
    };

    websocket.onclose = () => {
        console.log('WebSocket connection closed');
        startButton.disabled = true;
        hangupButton.disabled = true;
        // alert("WebSocket connection closed. Please refresh the page or restart the server.");
    };

    websocket.onerror = (error) => {
        console.error('WebSocket error:', error);
        // alert("WebSocket error. Check the console and ensure the server is running.");
    };
}

function sendMessage(message) {
    if (websocket.readyState === WebSocket.OPEN) {
        console.log('Sending message:', message);
        websocket.send(JSON.stringify(message));
    } else {
        console.error('WebSocket is not open. readyState: ' + websocket.readyState);
    }
}

// --- WebRTC Logic ---
async function startCall() {
    console.log('Starting call...');
    startButton.disabled = true;
    hangupButton.disabled = false;

    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
    } catch (error) {
        console.error('Error accessing media devices.', error);
        alert('Error accessing media devices: ' + error.message);
        startButton.disabled = false; // Re-enable start button if media access fails
        return;
    }

    createPeerConnection();

    // Add local stream tracks to the peer connection
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    // Create offer
    try {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        sendMessage({ offer: offer });
    } catch (error) {
        console.error('Error creating offer:', error);
    }
}

function createPeerConnection() {
    peerConnection = new RTCPeerConnection(configuration);

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            sendMessage({ candidate: event.candidate });
        }
    };

    peerConnection.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
            remoteVideo.srcObject = event.streams[0];
        } else {
            // Fallback for older browsers
            let inboundStream = new MediaStream(event.track);
            remoteVideo.srcObject = inboundStream;
        }
    };

    // Optional: Listen for connection state changes
    peerConnection.oniceconnectionstatechange = () => {
        console.log(`ICE connection state change: ${peerConnection.iceConnectionState}`);
        if (peerConnection.iceConnectionState === 'failed' ||
            peerConnection.iceConnectionState === 'disconnected' ||
            peerConnection.iceConnectionState === 'closed') {
            // Handle connection failure
            console.error('Connection failed or disconnected.');
            // You might want to attempt to restart ICE or close the call
        }
    };
}

async function handleOffer(offer) {
    if (!peerConnection) {
        createPeerConnection();
    }

    // If we haven't started our local media yet, start it now
    if (!localStream) {
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            localVideo.srcObject = localStream;
            localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
        } catch (error) {
            console.error('Error accessing media devices when handling offer.', error);
            return; // Cannot proceed without local media
        }
    }

    // Ensure local tracks are added if peerConnection was just created
    if (localStream && peerConnection.getLocalStreams().length === 0) {
         localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
    }


    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        sendMessage({ answer: answer });
        hangupButton.disabled = false; // Enable hangup as we are now in a call
    } catch (error) {
        console.error('Error handling offer:', error);
    }
}

async function handleAnswer(answer) {
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        console.log("Call established!");
    } catch (error) {
        console.error('Error handling answer:', error);
    }
}

async function handleCandidate(candidate) {
    try {
        if (candidate) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        }
    } catch (error) {
        console.error('Error adding ICE candidate:', error);
    }
}

function hangUp() {
    console.log('Hanging up...');
    sendMessage({ hangup: true });
    closeConnection();
}

function handleHangupSignal() {
    console.log('Received hangup signal.');
    closeConnection();
}

function closeConnection() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    localVideo.srcObject = null;
    remoteVideo.srcObject = null;

    startButton.disabled = false;
    hangupButton.disabled = true;
    console.log('Call ended and resources cleaned up.');
    // Optionally, re-initialize WebSocket if it was closed by server logic on peer disconnect
    // Or prompt user to refresh. For now, we assume WebSocket stays open or user refreshes.
}

// --- Event Listeners ---
startButton.addEventListener('click', startCall);
hangupButton.addEventListener('click', hangUp);

// Initialize WebSocket connection when the script loads
setupWebSocket();

// Clean up on page unload
window.addEventListener('beforeunload', () => {
    if (websocket && websocket.readyState === WebSocket.OPEN) {
        sendMessage({ hangup: true }); // Attempt to notify other peer
        websocket.close();
    }
    closeConnection(); // Clean up local resources
});
