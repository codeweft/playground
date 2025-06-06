import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Button, Text, Platform, Alert } from 'react-native';
import {
  RTCPeerConnection,
  RTCView,
  mediaDevices, // Still use this for getUserMedia
  RTCIceCandidate,
  RTCSessionDescription,
} from 'react-native-webrtc';
import { Camera } from 'expo-camera';
import { Audio } from 'expo-av';

const SERVER_URL = 'ws://192.168.1.108:8080';

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
  const isOfferer = useRef(false);

  const requestPermissions = async () => {
    let cameraPermissionGranted = false;
    let audioPermissionGranted = false;

    // Request Camera Permissions
    const cameraPermission = await Camera.requestCameraPermissionsAsync();
    if (cameraPermission.status === 'granted') {
      console.log('Camera permission granted');
      cameraPermissionGranted = true;
    } else {
      console.log('Camera permission denied');
    }

    // Request Audio Permissions
    // Note: expo-av's Audio.requestPermissionsAsync() is for microphone.
    const audioPermission = await Audio.requestPermissionsAsync();
    if (audioPermission.status === 'granted') {
      console.log('Audio (microphone) permission granted');
      audioPermissionGranted = true;
    } else {
      console.log('Audio (microphone) permission denied');
    }

    if (!cameraPermissionGranted || !audioPermissionGranted) {
      Alert.alert(
        "Permissions Required",
        "Camera and Microphone permissions are required to make a video call. Please grant them in app settings if you denied them.",
        [{ text: "OK" }]
      );
      return false;
    }
    return true;
  };

  // Effect to request permissions when component mounts, if needed,
  // or can be called explicitly before starting a call.
  // For simplicity, we'll ensure it's called before call initiation.
  useEffect(() => {
    // Optionally, could check existing permissions here first
    // const checkInitialPermissions = async () => {
    //   const camStatus = await Camera.getCameraPermissionsAsync();
    //   const audStatus = await Audio.getPermissionsAsync();
    //   if(camStatus.status !== 'granted' || audStatus.status !== 'granted') {
    //      // Maybe prompt user or show a button to grant permissions
    //   }
    // };
    // checkInitialPermissions();
    setupWebSocket(); // Initialize WebSocket connection on component mount

    return () => { // Cleanup on component unmount
      hangUpCallHandler(true);
      if (socket.current) {
        socket.current.close();
      }
    };
  }, []);


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
        await initializeMediaAndPeerConnection(false);
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
        hangUpCallHandler(false);
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
        sendMessage({ candidate: event.candidate });
      }
    };

    peerConnection.current.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        setRemoteStream(event.streams[0]);
      }
    };

    if (localStream) {
      localStream.getTracks().forEach(track => {
        peerConnection.current.addTrack(track, localStream);
      });
    }
  };

  const initializeMediaAndPeerConnection = async (amIOfferer) => {
    isOfferer.current = amIOfferer;

    // Get local media stream using react-native-webrtc's mediaDevices
    // after ensuring permissions with expo-camera/expo-av
    if (!localStream) {
        const stream = await mediaDevices.getUserMedia({ // Still use this from react-native-webrtc
            audio: true, // expo-av Audio.requestPermissionsAsync handles mic permission
            video: true, // expo-camera Camera.requestCameraPermissionsAsync handles cam permission
        });
        setLocalStream(stream);
        console.log('Local stream obtained via mediaDevices.getUserMedia');
    }

    if (!peerConnection.current) {
        createPeerConnection();
    } else {
        if (localStream && peerConnection.current.getLocalStreams().length === 0) {
             localStream.getTracks().forEach(track => {
                peerConnection.current.addTrack(track, localStream);
            });
        }
    }
  };

  const startCallHandler = async () => {
    // Request permissions first using Expo's APIs
    const permissionsGranted = await requestPermissions();
    if (!permissionsGranted) {
        Alert.alert("Permissions Required", "Camera and Microphone access is needed to start a call.");
        return;
    }

    if (!isConnectedToServer) {
        Alert.alert("Cannot Start Call", "Not connected to the signaling server.");
        return;
    }

    console.log('Start Call button pressed');
    setIsCallStarted(true);

    try {
      await initializeMediaAndPeerConnection(true);

      if (peerConnection.current) {
        const offer = await peerConnection.current.createOffer();
        await peerConnection.current.setLocalDescription(offer);
        sendMessage({ offer: offer });
      }
    } catch (error) {
      console.error('Error starting call:', error);
      Alert.alert("Error", "Could not start the call: " + error.message);
      setIsCallStarted(false);
    }
  };

  const hangUpCallHandler = (notifyPeer = true) => {
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
    isOfferer.current = false;
    console.log('Call ended and resources cleaned up.');
  };

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
