import React, { useState, useEffect, useRef, useCallback } from 'react';
import { StyleSheet, View, Button, Text, Alert, Platform } from 'react-native';
import {
  RTCPeerConnection,
  RTCView,
  mediaDevices,
  RTCIceCandidate,
  RTCSessionDescription,
  MediaStream, // Import MediaStream for explicit use and manipulation
} from 'react-native-webrtc';
import { Camera } from 'expo-camera'; // For camera permissions
import { Audio } from 'expo-av'; // For microphone permissions

// Replace with your signaling server URL (e.g., your local machine's IP)
const SERVER_URL = 'ws://192.168.1.108:8080';

// WebRTC PeerConnection configuration, including STUN servers for NAT traversal
const configuration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export default function App() {
  // State variables for UI and WebRTC status
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [inCall, setInCall] = useState(false); // True if a call is active
  const [connectedToServer, setConnectedToServer] = useState(false); // True if WebSocket is connected
  const [statusMessage, setStatusMessage] = useState('Initializing...'); // General status updates for UI

  // useRef for WebRTC objects and flags that persist across renders but don't cause re-renders
  const peerConnection = useRef(null);
  const socket = useRef(null);
  const isOfferer = useRef(false); // Flag to determine if this peer initiated the call
  const pendingCandidates = useRef([]); // To buffer ICE candidates that arrive before remoteDescription is set

  /**
   * Updates the status message displayed on the UI and logs it to the console.
   * Wrapped in useCallback to prevent unnecessary re-creations.
   * @param {string} message - The status message to display.
   */
  const updateStatus = useCallback((message) => {
    setStatusMessage(message);
    console.log(`[Status] ${message}`);
  }, []); // Empty dependency array means this function is created once

  // Effect hook for WebSocket setup and cleanup on component mount/unmount
  useEffect(() => {
    initWebSocket(); // Initialize WebSocket connection

    // Cleanup function for component unmount
    return () => {
      console.log('[App Cleanup] Component unmounting. Ending call and closing WebSocket.');
      endCall(true); // Attempt to notify peer and clean up WebRTC resources
      if (socket.current) {
        socket.current.close(); // Close WebSocket connection if it's open
        socket.current = null; // Clear the ref
      }
    };
  }, []); // Empty dependency array ensures this runs once on mount and cleanup on unmount

  /**
   * Requests camera and microphone permissions from the user using Expo Camera and Audio APIs.
   * @returns {Promise<boolean>} - True if permissions are granted, false otherwise.
   */
  const requestPermissions = async () => {
    updateStatus('Requesting permissions...');
    try {
      // Request both camera and microphone permissions concurrently
      const [cameraPermission, audioPermission] = await Promise.all([
        Camera.requestCameraPermissionsAsync(),
        Audio.requestPermissionsAsync(),
      ]);

      const cameraGranted = cameraPermission.status === 'granted';
      const audioGranted = audioPermission.status === 'granted';

      if (!cameraGranted || !audioGranted) {
        Alert.alert(
          'Permissions Required',
          'Camera and Microphone permissions are required to make a video call. Please grant them in app settings if you denied them.',
          [{ text: 'OK' }] // Provide an "OK" button
        );
        console.warn('[Permissions] Camera or Audio permissions denied.');
        updateStatus('Permissions denied.');
        return false;
      }
      console.log('[Permissions] Camera and Audio permissions granted.');
      updateStatus('Permissions granted.');
      return true;
    } catch (error) {
      console.error('[Permissions] Error requesting permissions:', error);
      Alert.alert('Permission Error', 'Failed to request camera and microphone permissions.');
      updateStatus('Permission error.');
      return false;
    }
  };

  /**
   * Initializes the WebSocket connection to the signaling server.
   * Handles WebSocket lifecycle events (onopen, onmessage, onerror, onclose).
   */
  const initWebSocket = () => {
    // Prevent re-initialization if socket already exists
    if (socket.current) {
      console.warn('[WebSocket] WebSocket already initialized. Skipping.');
      return;
    }

    socket.current = new WebSocket(SERVER_URL);
    updateStatus('Connecting to signaling server...');

    socket.current.onopen = () => {
      console.log('[WebSocket] Connection established');
      setConnectedToServer(true); // Update UI state
      updateStatus('Connected to signaling server');
    };

    socket.current.onmessage = async (event) => {
      const message = JSON.parse(event.data);
      console.log('[WebSocket] Message received:', message);

      // Only initialize peer connection and media for an incoming OFFER if not already done.
      // Candidates received before an offer should be buffered without triggering full setup.
      if (message.offer && !peerConnection.current) {
        console.log("[WebRTC Setup] PeerConnection not active, initializing for incoming OFFER (answerer role).");
        // Crucial: Request permissions BEFORE getting media and setting up peer connection
        const permissionsGranted = await requestPermissions();
        if (!permissionsGranted) {
          console.error("[WebRTC Setup] Permissions not granted for incoming call. Aborting setup.");
          updateStatus("Permissions denied for incoming call.");
          return;
        }

        const ready = await initializeMediaAndPeerConnection(false); // `false` indicates we are the answerer.
        if (ready) {
            setInCall(true); // Set call state if initialization for incoming call is successful
            updateStatus('Incoming call initialized.');
        } else {
            console.error("[WebRTC Setup] Failed to initialize for incoming call. Aborting message handling.");
            updateStatus("Failed to initialize for incoming call.");
            return;
        }
      }

      try {
        if (message.offer) {
          console.log('[WebRTC] Received offer');
          if (peerConnection.current) {
            await peerConnection.current.setRemoteDescription(new RTCSessionDescription(message.offer));
            console.log('[WebRTC] Remote description (offer) set.');
            updateStatus('Offer received, setting remote description.');

            // Apply any buffered ICE candidates after the remote description is set
            console.log(`[WebRTC] Applying ${pendingCandidates.current.length} buffered ICE candidates (after offer).`);
            for (let candidate of pendingCandidates.current) {
              try {
                await peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate));
              } catch (e) {
                console.error('[WebRTC] Error adding buffered ICE candidate (offer phase):', e, candidate);
              }
            }
            pendingCandidates.current = []; // Clear the buffer

            const answer = await peerConnection.current.createAnswer();
            await peerConnection.current.setLocalDescription(answer);
            sendMessage({ answer: answer }); // Send the answer back
            console.log('[WebRTC] Answer sent, waiting for connection.');
            updateStatus('Answer sent.');
          }
        } else if (message.answer) {
          console.log('[WebRTC] Received answer');
          if (peerConnection.current) {
            await peerConnection.current.setRemoteDescription(new RTCSessionDescription(message.answer));
            console.log('[WebRTC] Remote description (answer) set. Call should be established.');
            updateStatus('Answer received, call established.');

            // Apply any buffered ICE candidates after the remote description is set
            console.log(`[WebRTC] Applying ${pendingCandidates.current.length} buffered ICE candidates (after answer).`);
            for (let candidate of pendingCandidates.current) {
              try {
                await peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate));
              } catch (e) {
                console.error('[WebRTC] Error adding buffered ICE candidate (answer phase):', e, candidate);
              }
            }
            pendingCandidates.current = []; // Clear the buffer
          }
        } else if (message.candidate) {
          console.log('[WebRTC] Received ICE candidate');
          if (peerConnection.current) {
            // Only add candidate immediately if remoteDescription is set AND signalingState is 'stable'.
            // This prevents "InvalidStateError: setRemoteDescription has not been called".
            if (peerConnection.current.remoteDescription && peerConnection.current.remoteDescription.type && peerConnection.current.signalingState === 'stable') {
                try {
                  console.log('[WebRTC] Adding immediate ICE candidate (stable state):', message.candidate);
                  await peerConnection.current.addIceCandidate(new RTCIceCandidate(message.candidate));
                } catch (error) {
                  // Suppress frequent alerts for minor candidate errors, but log
                  console.error('[WebRTC] Error adding received ICE candidate:', error);
                }
            } else {
                // Buffer the candidate if signaling state is not stable or remoteDescription not fully set
                console.log('[WebRTC] Buffering ICE candidate (signaling state not stable or remoteDescription not fully set).');
                pendingCandidates.current.push(message.candidate);
            }
          } else {
            console.warn('[WebRTC] Peer connection not yet initialized, buffering candidate. This typically happens on incoming call setup.');
            pendingCandidates.current.push(message.candidate);
          }
        } else if (message.hangup) {
          console.log('[Call] Received hangup signal');
          endCall(false); // Do not notify peer back, as they initiated the hangup
          Alert.alert('Call Ended', 'The other party has ended the call.');
          updateStatus('Call ended by peer.');
        }
      } catch (error) {
        console.error('[WebSocket Message Handler] Error processing message:', error, message);
        Alert.alert('WebRTC Error', 'Failed to process signaling message: ' + error.message);
        updateStatus('Error processing signaling message.');
      }
    };

    socket.current.onerror = (error) => {
      console.error('[WebSocket] Error:', error);
      Alert.alert('WebSocket Error', 'Connection to signaling server failed. Check console and ensure server is running.');
      setConnectedToServer(false);
      updateStatus('WebSocket error.');
      endCall(false); // Ensure call ends if WebSocket errors out
    };

    socket.current.onclose = () => {
      console.log('[WebSocket] Connection closed');
      setConnectedToServer(false);
      updateStatus('Disconnected from signaling server.');
      if (inCall) { // If a call was active when connection closed
        endCall(false); // End call without notifying peer (as connection is gone)
        Alert.alert('Call Ended', 'Signaling server connection lost. Call ended.');
      }
    };
  };

  /**
   * Sends a message over the WebSocket connection.
   * @param {object} message - The message object to send.
   */
  const sendMessage = (message) => {
    if (socket.current && socket.current.readyState === WebSocket.OPEN) {
      console.log('[WebSocket] Sending message:', message);
      socket.current.send(JSON.stringify(message));
    } else {
      console.error('WebSocket is not open. Message not sent:', message);
      updateStatus('Error: WebSocket not open, message not sent.');
    }
  };

  /**
   * Creates and configures a new RTCPeerConnection object, setting up event handlers.
   */
  const createPeerConnection = () => {
    console.log('[WebRTC] Creating new RTCPeerConnection...');
    // Ensure to use the full 'configuration' object which includes STUN servers.
    peerConnection.current = new RTCPeerConnection(configuration);

    // Event handler for when ICE candidates are generated
    peerConnection.current.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('[WebRTC] ICE candidate generated:', event.candidate);
        sendMessage({ candidate: event.candidate }); // Send candidate to remote peer
      } else {
        console.log('[WebRTC] ICE candidate gathering finished.');
      }
    };

    // Event handler for when a remote track is received
    peerConnection.current.ontrack = (event) => {
      console.log('--- [WebRTC] Remote track received:', event);
      if (event.streams && event.streams[0]) {
        console.log('[WebRTC] Setting remote stream from event.streams[0].');
        setRemoteStream(event.streams[0]); // Set the first stream as the remote video source
        updateStatus('Remote stream received.');
      } else if (event.track) {
         // This can happen if tracks are sent individually or if streams array is not immediately populated.
         // Use a functional update for setRemoteStream to ensure we work with the latest state.
         console.log('[WebRTC] Received individual track. Creating or adding to MediaStream for remoteVideo.');
         setRemoteStream((prevStream) => {
           if (!prevStream) {
             const newStream = new MediaStream();
             newStream.addTrack(event.track);
             return newStream;
           } else if (!prevStream.getTrackById(event.track.id)) { // Prevent adding duplicate tracks
             prevStream.addTrack(event.track);
           }
           return prevStream; // Return the updated (or new) stream
         });
         updateStatus('Remote track received (individual track).');
      } else {
        console.warn('[WebRTC] Ontrack event fired, but no streams or tracks found:', event);
      }
    };

    // Listen for overall peer connection state changes
    peerConnection.current.onconnectionstatechange = () => {
      if (peerConnection.current) {
        console.log('[WebRTC State] Peer Connection State:', peerConnection.current.connectionState);
        updateStatus(`Connection state: ${peerConnection.current.connectionState}`);
        if (['disconnected', 'failed', 'closed'].includes(peerConnection.current.connectionState)) {
          console.warn(`Peer connection is in state: ${peerConnection.current.connectionState}. Ending call.`);
          Alert.alert('Call Status', `Call ${peerConnection.current.connectionState}.`);
          endCall(false); // End call if connection state becomes disconnected/failed/closed
        } else if (peerConnection.current.connectionState === 'connected') {
            updateStatus('Call connected!');
        }
      }
    };

    // Listen for ICE connection state changes
    peerConnection.current.oniceconnectionstatechange = () => {
      if (peerConnection.current) {
        console.log('[WebRTC State] ICE Connection State:', peerConnection.current.iceConnectionState);
        updateStatus(`ICE state: ${peerConnection.current.iceConnectionState}`);
      }
    };

    // Listen for signaling state changes
    peerConnection.current.onsignalingstatechange = () => {
      if (peerConnection.current) {
        console.log('[WebRTC State] Signaling State:', peerConnection.current.signalingState);
        updateStatus(`Signaling state: ${peerConnection.current.signalingState}`);
      }
    };

    console.log('[WebRTC] Peer connection created successfully.');
  };

  /**
   * Gets the local media stream (camera and microphone).
   * Includes fallback constraints for broader device compatibility.
   * @returns {Promise<MediaStream|null>} - The local MediaStream object or null if failed.
   */
  const getLocalMediaStream = async () => {
    updateStatus('Attempting to get user media...');
    try {
      console.log('[Media] Attempting to get user media...');

      // Preferred constraints for better quality on most devices
      const constraints = {
        audio: true, // Request audio
        video: {
          width: { ideal: 640, min: 480 }, // Ideal width, with a minimum
          height: { ideal: 480, min: 360 }, // Ideal height, with a minimum
          frameRate: { ideal: 30 },
          facingMode: 'user', // Use front camera
        },
      };

      const stream = await mediaDevices.getUserMedia(constraints);
      console.log('[Media] Local stream obtained:', stream);
      stream.getTracks().forEach((track) => {
        console.log(
          `[Media] Track: ${track.kind}, ID: ${track.id}, Label: ${track.label}, Enabled: ${track.enabled}, ReadyState: ${track.readyState}`
        );
      });
      updateStatus('Local media obtained.');
      return stream;
    } catch (error) {
      console.error('[Media] Error getting user media with detailed constraints:', error);
      Alert.alert('Media Error', 'Failed to get high-quality media stream. Trying with simpler constraints.');
      updateStatus('Media error. Trying simpler constraints...');
      try {
        console.log('[Media] Trying with simpler constraints...');
        // Fallback to simpler constraints if ideal ones fail
        const fallbackStream = await mediaDevices.getUserMedia({
          audio: true,
          video: true,
        });
        console.log('[Media] Fallback stream obtained:', fallbackStream);
        fallbackStream.getTracks().forEach((track) => {
            console.log(
                `[Media] Fallback Track: ${track.kind}, ID: ${track.id}, Label: ${track.label}, Enabled: ${track.enabled}, ReadyState: ${track.readyState}`
            );
        });
        updateStatus('Fallback media obtained.');
        return fallbackStream;
      } catch (fallbackError) {
        console.error('[Media] Fallback also failed:', fallbackError);
        Alert.alert('Media Error', 'Failed to get any media stream. Please check your camera/microphone permissions and availability.');
        updateStatus('Failed to get any media stream.');
        return null; // Return null if all attempts fail
      }
    }
  };

  /**
   * Initializes media stream and peer connection.
   * This function is called by both the offerer (initiating call) and answerer (receiving call).
   * @param {boolean} amIOfferer - True if this client is initiating the call (offerer).
   * @returns {Promise<boolean>} - True if successful, false otherwise.
   */
  const initializeMediaAndPeerConnection = async (amIOfferer) => {
    try {
      isOfferer.current = amIOfferer;
      console.log('[WebRTC Setup] Initializing media and peer connection, isOfferer:', amIOfferer);
      updateStatus(`Initializing for ${amIOfferer ? 'outgoing' : 'incoming'} call...`);

      let currentLocalStream = localStream;
      // Get local stream if not already available
      if (!currentLocalStream) {
        currentLocalStream = await getLocalMediaStream();
        if (!currentLocalStream) {
          throw new Error('Failed to get local media stream');
        }
        setLocalStream(currentLocalStream); // Update state with the new local stream
      }

      // Create peer connection if not already available
      if (!peerConnection.current) {
        createPeerConnection();
      }

      // Add local stream tracks to the peer connection if they haven't been added yet.
      // This is crucial for sending our media to the remote peer.
      if (currentLocalStream && peerConnection.current) {
        const existingSenders = peerConnection.current.getSenders();
        // Check if all tracks from the local stream are already added as senders
        const allTracksAdded = currentLocalStream.getTracks().every(track =>
          existingSenders.some(sender => sender.track === track)
        );

        if (!allTracksAdded) {
            console.log('[WebRTC] Adding local stream tracks to peer connection...');
            currentLocalStream.getTracks().forEach((track) => {
                // Prevent re-adding the same track to avoid errors
                if (!existingSenders.some(sender => sender.track === track)) {
                    console.log(`[WebRTC] Adding track: ${track.kind} - ${track.id}`);
                    peerConnection.current.addTrack(track, currentLocalStream);
                } else {
                    console.log(`[WebRTC] Track ${track.kind} - ${track.id} already associated with a sender, skipping re-add.`);
                }
            });
            console.log('[WebRTC] Finished adding tracks. Current senders count:', peerConnection.current.getSenders().length);
        } else {
            console.log('[WebRTC] All required tracks already appear to be added. Senders count:', peerConnection.current.getSenders().length);
        }

        // Debugging senders after potential additions
        const finalSenders = peerConnection.current.getSenders();
        console.log('[WebRTC] Peer connection senders after initialization:', finalSenders.length);
        finalSenders.forEach((sender, index) => {
          console.log(`[WebRTC] Sender ${index}:`, {
            track: sender.track
              ? {
                  kind: sender.track.kind,
                  enabled: sender.track.enabled,
                  readyState: sender.track.readyState,
                  id: sender.track.id,
                }
              : null,
            transceiver: sender.transceiver ? { mid: sender.transceiver.mid, direction: sender.transceiver.direction } : null
          });
        });
      }
      return true; // Indicate success
    } catch (error) {
      console.error('[WebRTC Setup] Error in initializeMediaAndPeerConnection:', error);
      Alert.alert('Call Setup Error', 'Failed to initialize media or peer connection: ' + error.message);
      updateStatus('Call setup failed.');
      setInCall(false); // Reset call state if setup fails
      return false; // Indicate failure
    }
  };

  /**
   * Handles the "Start Call" button press. Initiates the WebRTC call as the offerer.
   */
  const startCallHandler = async () => {
    try {
      console.log('[Call] Start Call button pressed');
      updateStatus('Starting call...');

      // First, request necessary permissions
      const permissionsGranted = await requestPermissions();
      if (!permissionsGranted) {
        Alert.alert('Permissions Required', 'Camera and Microphone access is needed to start a call.');
        return;
      }

      // Ensure connection to signaling server
      if (!connectedToServer) {
        Alert.alert('Cannot Start Call', 'Not connected to the signaling server. Please ensure the server is running and accessible.');
        return;
      }

      setInCall(true); // Set call status to true to disable button and show hangup

      // Initialize media and peer connection (as offerer)
      const setupSuccess = await initializeMediaAndPeerConnection(true); // True because this side initiates the call
      if (!setupSuccess) {
        console.error('[Call] Call setup failed, aborting offer creation.');
        setInCall(false); // Reset call state if setup fails
        return;
      }

      if (peerConnection.current) {
        console.log('[WebRTC] Creating offer...');
        // Create an offer, explicitly requesting to receive audio and video from the remote peer
        const offer = await peerConnection.current.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
        });

        console.log('[WebRTC] Setting local description (offer)...');
        await peerConnection.current.setLocalDescription(offer);

        console.log('[WebRTC] Sending offer...');
        sendMessage({ offer: offer }); // Send offer to signaling server
        updateStatus('Offer sent, waiting for answer...');
      } else {
        throw new Error('Peer connection not initialized after media setup');
      }
    } catch (error) {
      console.error('[Call] Error starting call:', error);
      Alert.alert('Error', 'Could not start the call: ' + error.message);
      updateStatus('Error starting call.');
      setInCall(false); // Reset call status if an error occurs
    }
  };

  /**
   * Ends the WebRTC call and cleans up all associated resources.
   * @param {boolean} notifyPeer - True if the other peer should be notified of the hangup.
   */
  const endCall = (notifyPeer = true) => {
    console.log('[Call] Ending call...');
    updateStatus('Ending call...');

    // Notify the other peer about the hangup
    if (notifyPeer) {
      sendMessage({ hangup: true });
    }

    // Stop all local media tracks (camera and microphone)
    if (localStream) {
      console.log('[Cleanup] Stopping local media tracks...');
      localStream.getTracks().forEach((track) => {
        console.log(`[Cleanup] Stopping track: ${track.kind} - ${track.id}`);
        track.stop();
      });
      setLocalStream(null); // Clear local stream state
    }
    setRemoteStream(null); // Clear remote stream state

    // Close the RTCPeerConnection and clear its references
    if (peerConnection.current) {
      console.log('[Cleanup] Closing peer connection...');
      // Clear all event listeners to prevent memory leaks and unexpected behavior
      peerConnection.current.onicecandidate = null;
      peerConnection.current.ontrack = null;
      peerConnection.current.onconnectionstatechange = null;
      peerConnection.current.oniceconnectionstatechange = null;
      peerConnection.current.onsignalingstatechange = null;
      peerConnection.current.close(); // Close the peer connection
      peerConnection.current = null; // Clear the ref
    }

    pendingCandidates.current = []; // Clear any buffered ICE candidates
    setInCall(false); // Update UI state to indicate call has ended
    isOfferer.current = false; // Reset offerer flag
    updateStatus('Call ended and resources cleaned up.');
    console.log('[Cleanup] Call ended and resources cleaned up.');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>React Native WebRTC Demo</Text>
      <Text style={styles.statusText}>Server: {connectedToServer ? 'Connected' : 'Disconnected'} | Status: {statusMessage}</Text>

      <View style={styles.videoContainer}>
        {/* Local Video Component */}
        <VideoBlock label="Local" stream={localStream} mirror={true} />
        {/* Remote Video Component */}
        <VideoBlock label="Remote" stream={remoteStream} mirror={false} />
      </View>

      <View style={styles.buttonContainer}>
        {!inCall ? (
          <Button
            title="Start Call"
            onPress={startCallHandler}
            disabled={!connectedToServer || inCall} // Disable if not connected or already in call
            color="#4CAF50" // Green for start button
          />
        ) : (
          <Button title="Hang Up" onPress={() => endCall(true)} color="red" />
        )}
      </View>
    </View>
  );
}

/**
 * Helper component to render video streams using RTCView.
 * @param {object} props - Component props.
 * @param {string} props.label - Label for the video (e.g., "Local", "Remote").
 * @param {MediaStream} props.stream - The MediaStream object to display.
 * @param {boolean} props.mirror - Whether to mirror the video (useful for local camera).
 */
function VideoBlock({ label, stream, mirror = false }) {
  return (
    <View style={styles.videoWrapper}>
      <Text style={styles.videoLabel}>{label} Video</Text>
      {stream ? (
        // RTCView requires streamURL from the MediaStream object.
        // objectFit: 'cover' ensures the video fills the container without distortion.
        // zOrder helps with rendering order on some mobile platforms (higher number is on top).
        <RTCView
          streamURL={stream.toURL()}
          style={styles.video}
          objectFit={'cover'}
          mirror={mirror}
          zOrder={label === 'Local' ? 1 : 0} // Local video often appears on top of remote video
        />
      ) : (
        <View style={styles.videoPlaceholder}>
          <Text style={{ color: '#fff', textAlign: 'center' }}>No {label.toLowerCase()} stream</Text>
        </View>
      )}
    </View>
  );
}

// StyleSheet for the React Native components, ensuring responsiveness and modern UI.
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111', // Dark background for modern look
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    paddingTop: Platform.OS === 'ios' ? 50 : 20, // Adjust padding for iOS notch
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#fff', // White text for dark background
    textAlign: 'center',
  },
  statusText: {
    fontSize: 14,
    marginBottom: 20,
    color: '#ccc', // Lighter grey for status
    textAlign: 'center',
  },
  videoContainer: {
    flexDirection: 'row', // Arrange videos side-by-side
    justifyContent: 'space-around',
    width: '100%',
    marginBottom: 20,
    gap: 15, // Spacing between video blocks (React Native feature for Flexbox gap)
  },
  videoWrapper: {
    flex: 1, // Allows video blocks to take equal space
    alignItems: 'center',
    padding: 10,
    backgroundColor: '#333', // Slightly lighter dark background for video blocks
    borderRadius: 15, // Rounded corners
    elevation: 5, // Android shadow
    shadowColor: '#000', // iOS shadow
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
  },
  videoLabel: {
    fontSize: 16,
    marginBottom: 10,
    fontWeight: '600',
    color: '#fff',
  },
  video: {
    width: '100%',
    aspectRatio: 3 / 4, // Maintain aspect ratio for video (e.g., 4:3)
    backgroundColor: '#2c3e50', // Placeholder background for video area
    borderRadius: 10,
  },
  videoPlaceholder: {
    width: '100%',
    aspectRatio: 3 / 4,
    backgroundColor: '#222', // Darker background for empty video area
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
  },
  buttonContainer: {
    marginTop: 30,
    width: '70%',
    paddingHorizontal: 10,
  },
});
