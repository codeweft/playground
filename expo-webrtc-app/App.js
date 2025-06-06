import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Button, Text, PermissionsAndroid, Platform, Alert } from 'react-native';
import {
  RTCPeerConnection,
  RTCView,
  mediaDevices,
  RTCIceCandidate,
  RTCSessionDescription,
} from 'react-native-webrtc';

const SERVER_URL = 'ws://localhost:8080'; // Ensure this is accessible from your app/emulator

const configuration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export default function App() {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isCallStarted, setIsCallStarted] = useState(false);
  const [isConnectedToServer, setIsConnectedToServer] = useState(false);

  const peerConnection = useRef(null);
  const socket = useRef(null);
  // To keep track if this peer is the one who initiated the call
  const isOfferer = useRef(false);

  const requestPermissions = async () => {
    if (Platform.OS === 'android') {
      try {
        const grants = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.CAMERA,
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        ]);
        if (
          grants[PermissionsAndroid.PERMISSIONS.CAMERA] === PermissionsAndroid.RESULTS.GRANTED &&
          grants[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] === PermissionsAndroid.RESULTS.GRANTED
        ) {
          return true;
        } else {
          Alert.alert("Permissions Denied", "Cannot start call without camera and microphone permissions.");
          return false;
        }
      } catch (err) {
        console.warn(err);
        return false;
      }
    }
    return true;
  };

  const setupWebSocket = () => {
    socket.current = new WebSocket(SERVER_URL);

    socket.current.onopen = () => {
      console.log('WebSocket connection established');
      setIsConnectedToServer(true);
    };

    socket.current.onmessage = async (event) => {
      const message = JSON.parse(event.data);
      console.log('WebSocket message received:', message);

      if (!peerConnection.current && (message.offer || message.candidate)) {
         // If we receive an offer or candidate before PC is ready,
         // it implies we are the callee. Initialize PC.
        await initializeMediaAndPeerConnection(false); // false because we are not the offerer
      }

      if (message.offer) {
        console.log('Received offer');
        if (peerConnection.current) {
            try {
                await peerConnection.current.setRemoteDescription(new RTCSessionDescription(message.offer));
                const answer = await peerConnection.current.createAnswer();
                await peerConnection.current.setLocalDescription(answer);
                sendMessage({ answer: answer });
            } catch (error) {
                console.error('Error handling offer:', error);
            }
        }
      } else if (message.answer) {
        console.log('Received answer');
        if (peerConnection.current) {
            try {
                await peerConnection.current.setRemoteDescription(new RTCSessionDescription(message.answer));
            } catch (error) {
                console.error('Error handling answer:', error);
            }
        }
      } else if (message.candidate) {
        console.log('Received ICE candidate');
         if (peerConnection.current) {
            try {
                await peerConnection.current.addIceCandidate(new RTCIceCandidate(message.candidate));
            } catch (error) {
                console.error('Error adding received ICE candidate:', error);
            }
        }
      } else if (message.hangup) {
        console.log('Received hangup signal');
        hangUpCallHandler(false); // false to not send another hangup message
      }
    };

    socket.current.onerror = (error) => {
      console.error('WebSocket error:', error);
      Alert.alert("WebSocket Error", "Connection to server failed. Check console and ensure server is running.");
      setIsConnectedToServer(false);
    };

    socket.current.onclose = () => {
      console.log('WebSocket connection closed');
      setIsConnectedToServer(false);
      // Optionally, you might want to disable call buttons or show a message
    };
  };

  const sendMessage = (message) => {
    if (socket.current && socket.current.readyState === WebSocket.OPEN) {
      console.log('Sending message:', message);
      socket.current.send(JSON.stringify(message));
    } else {
      console.error('WebSocket is not open. Message not sent:', message);
    }
  };

  const createPeerConnection = () => {
    peerConnection.current = new RTCPeerConnection(configuration);

    peerConnection.current.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('New ICE candidate:', event.candidate);
        sendMessage({ candidate: event.candidate });
      }
    };

    peerConnection.current.ontrack = (event) => {
      console.log('Remote stream added:', event.streams[0]);
      if (event.streams && event.streams[0]) {
        setRemoteStream(event.streams[0]);
      }
    };

    if (localStream) {
      localStream.getTracks().forEach(track => {
        console.log('Adding local track:', track.kind);
        peerConnection.current.addTrack(track, localStream);
      });
    }
  };

  // Combined function to get media and initialize PC
  const initializeMediaAndPeerConnection = async (amIOfferer) => {
    isOfferer.current = amIOfferer; // Set if this client is initiating the call

    if (!localStream) { // Only get local stream if not already available
        const stream = await mediaDevices.getUserMedia({
            audio: true,
            video: {
            mandatory: { minWidth: 500, minHeight: 300, minFrameRate: 30 },
            facingMode: 'user',
            },
        });
        setLocalStream(stream);
        console.log('Local stream obtained');
    }

    if (!peerConnection.current) { // Create PC if it doesn't exist
        createPeerConnection();
    } else { // If it exists, ensure tracks are added (might happen if localStream was set after PC creation)
        if (localStream && peerConnection.current.getLocalStreams().length === 0) {
             localStream.getTracks().forEach(track => {
                peerConnection.current.addTrack(track, localStream);
            });
        }
    }
  };

  const startCallHandler = async () => {
    const permissionsGranted = await requestPermissions();
    if (!permissionsGranted || !isConnectedToServer) {
        Alert.alert("Cannot Start Call", "Ensure permissions are granted and you are connected to the server.");
        return;
    }

    console.log('Start Call button pressed');
    setIsCallStarted(true);

    try {
      await initializeMediaAndPeerConnection(true); // true because this client is initiating

      if (peerConnection.current) {
        const offer = await peerConnection.current.createOffer();
        await peerConnection.current.setLocalDescription(offer);
        console.log('Offer created and set as local description');
        sendMessage({ offer: offer });
      }
    } catch (error) {
      console.error('Error starting call:', error);
      Alert.alert("Error", "Could not start the call: " + error.message);
      setIsCallStarted(false);
      // cleanup logic might be needed here too
    }
  };

  const hangUpCallHandler = (notifyPeer = true) => { // notifyPeer controls if hangup message is sent
    console.log('Hang Up initiated.');
    if (notifyPeer) {
        sendMessage({ hangup: true });
    }

    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      localStream.release();
    }
    setLocalStream(null);
    setRemoteStream(null);

    if (peerConnection.current) {
      peerConnection.current.close();
      peerConnection.current = null;
    }

    setIsCallStarted(false);
    isOfferer.current = false; // Reset offerer state
    console.log('Call ended and resources cleaned up.');
  };

  useEffect(() => {
    requestPermissions();
    setupWebSocket(); // Initialize WebSocket connection on component mount

    return () => { // Cleanup on component unmount
      hangUpCallHandler(true); // Send hangup if call is active
      if (socket.current) {
        socket.current.close();
      }
    };
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>React Native WebRTC Demo</Text>
      <Text style={styles.statusText}>
        Server: {isConnectedToServer ? 'Connected' : 'Disconnected'}
      </Text>

      <View style={styles.videoContainer}>
        <View style={styles.videoWrapper}>
          <Text style={styles.videoLabel}>Local Video</Text>
          {localStream ? (
            <RTCView streamURL={localStream.toURL()} style={styles.video} objectFit={'cover'} mirror={true} />
          ) : ( <View style={styles.videoPlaceholder}><Text>No local stream</Text></View> )}
        </View>
        <View style={styles.videoWrapper}>
          <Text style={styles.videoLabel}>Remote Video</Text>
          {remoteStream ? (
            <RTCView streamURL={remoteStream.toURL()} style={styles.video} objectFit={'cover'} mirror={false} />
          ) : ( <View style={styles.videoPlaceholder}><Text>No remote stream</Text></View> )}
        </View>
      </View>

      <View style={styles.buttonContainer}>
        {!isCallStarted ? (
          <Button title="Start Call" onPress={startCallHandler} disabled={!isConnectedToServer || isCallStarted} />
        ) : (
          <Button title="Hang Up" onPress={() => hangUpCallHandler(true)} color="red" />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  statusText: {
    fontSize: 14,
    marginBottom: 10,
    color: '#555',
  },
  videoContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginBottom: 20,
    marginTop: 10,
  },
  videoWrapper: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 5,
    padding: 5,
    backgroundColor: '#fff',
    borderRadius: 10,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  videoLabel: {
    fontSize: 16,
    marginBottom: 8,
    fontWeight: '500',
  },
  video: {
    width: 160,
    height: 240,
    backgroundColor: '#2c3e50',
    borderRadius: 8,
  },
  videoPlaceholder: {
    width: 160,
    height: 240,
    backgroundColor: '#bdc3c7',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  buttonContainer: {
    marginTop: 20,
    width: '60%',
  },
});
