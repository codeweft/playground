import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Button,
  Text,
  Platform,
  Alert,
  TouchableOpacity,
  Dimensions,
  StatusBar,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import {
  RTCPeerConnection,
  RTCView,
  mediaDevices,
  RTCIceCandidate,
  RTCSessionDescription,
} from 'react-native-webrtc';
import { Camera } from 'expo-camera';
import { Audio } from 'expo-av';

const { width, height } = Dimensions.get('window');
const SERVER_URL = 'ws://192.168.1.108:8080';

const configuration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.relay.metered.ca:80' },
  ],
  iceCandidatePoolSize: 10,
};

const ConnectionStatus = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  RECONNECTING: 'reconnecting',
};

const CallState = {
  IDLE: 'idle',
  REQUESTING_MEDIA: 'requesting_media',
  CALLING: 'calling',
  INCOMING: 'incoming',
  CONNECTED: 'connected',
};

export default function App() {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [callState, setCallState] = useState(CallState.IDLE);
  const [connectionStatus, setConnectionStatus] = useState(ConnectionStatus.DISCONNECTED);
  const [connectionInfo, setConnectionInfo] = useState('Initializing...');
  const [permissionsGranted, setPermissionsGranted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const peerConnection = useRef(null);
  const socket = useRef(null);
  const isOfferer = useRef(false);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const reconnectTimeoutRef = useRef(null);

  useEffect(() => {
    checkInitialPermissions();
    setupWebSocket();

    return () => {
      cleanup();
    };
  }, []);

  const checkInitialPermissions = async () => {
    try {
      const cameraStatus = await Camera.getCameraPermissionsAsync();
      const audioStatus = await Audio.getPermissionsAsync();
      
      if (cameraStatus.status === 'granted' && audioStatus.status === 'granted') {
        setPermissionsGranted(true);
        setConnectionInfo('Permissions already granted');
      } else {
        setConnectionInfo('Camera and microphone permissions needed');
      }
    } catch (error) {
      console.error('Error checking permissions:', error);
      setConnectionInfo('Error checking permissions');
    }
  };

  const requestPermissions = async () => {
    try {
      setIsLoading(true);
      setConnectionInfo('Requesting permissions...');

      const cameraPermission = await Camera.requestCameraPermissionsAsync();
      const audioPermission = await Audio.requestPermissionsAsync();

      if (cameraPermission.status === 'granted' && audioPermission.status === 'granted') {
        setPermissionsGranted(true);
        setConnectionInfo('Permissions granted');
        return true;
      } else {
        Alert.alert(
          'Permissions Required',
          'Camera and microphone access are required for video calls. Please grant permissions in your device settings.',
          [{ text: 'OK' }]
        );
        setConnectionInfo('Permissions denied');
        return false;
      }
    } catch (error) {
      console.error('Error requesting permissions:', error);
      Alert.alert('Error', 'Failed to request permissions: ' + error.message);
      setConnectionInfo('Permission request failed');
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const setupWebSocket = () => {
    if (socket.current?.readyState === WebSocket.OPEN) {
      return;
    }

    setConnectionStatus(ConnectionStatus.CONNECTING);
    setConnectionInfo('Connecting to server...');

    socket.current = new WebSocket(SERVER_URL);

    socket.current.onopen = () => {
      console.log('WebSocket connection established');
      setConnectionStatus(ConnectionStatus.CONNECTED);
      setConnectionInfo('Connected to server');
      reconnectAttempts.current = 0;
      
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };

    socket.current.onmessage = async (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log('WebSocket message received:', message);

        // Auto-accept incoming calls by initializing media and peer connection
        if (!peerConnection.current && (message.offer || message.candidate)) {
          await initializeMediaAndPeerConnection(false);
        }

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
        console.error('Error processing WebSocket message:', error);
        setConnectionInfo('Error processing server message');
      }
    };

    socket.current.onerror = (error) => {
      console.error('WebSocket error:', error);
      setConnectionStatus(ConnectionStatus.DISCONNECTED);
      setConnectionInfo('Connection error');
    };

    socket.current.onclose = (event) => {
      console.log('WebSocket connection closed:', event.code, event.reason);
      setConnectionStatus(ConnectionStatus.DISCONNECTED);
      
      // Auto-reconnect logic
      if (reconnectAttempts.current < maxReconnectAttempts) {
        reconnectAttempts.current++;
        setConnectionStatus(ConnectionStatus.RECONNECTING);
        setConnectionInfo(`Reconnecting... (${reconnectAttempts.current}/${maxReconnectAttempts})`);
        
        reconnectTimeoutRef.current = setTimeout(() => {
          setupWebSocket();
        }, 2000 * reconnectAttempts.current);
      } else {
        setConnectionInfo('Failed to connect after multiple attempts');
        Alert.alert(
          'Connection Failed',
          'Unable to connect to the server. Please check your network connection and try again.',
          [
            { text: 'Retry', onPress: () => {
              reconnectAttempts.current = 0;
              setupWebSocket();
            }},
            { text: 'Cancel' }
          ]
        );
      }
    };
  };

  const sendMessage = (message) => {
    if (socket.current?.readyState === WebSocket.OPEN) {
      console.log('Sending message:', message);
      socket.current.send(JSON.stringify(message));
    } else {
      console.error('WebSocket is not open. Message not sent:', message);
      setConnectionInfo('Cannot send message - not connected');
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
      console.log('Remote track received');
      if (event.streams && event.streams[0]) {
        setRemoteStream(event.streams[0]);
        setCallState(CallState.CONNECTED);
        setConnectionInfo('Call connected successfully!');
      }
    };

    peerConnection.current.oniceconnectionstatechange = () => {
      const state = peerConnection.current?.iceConnectionState;
      console.log(`ICE connection state: ${state}`);
      
      switch (state) {
        case 'connected':
        case 'completed':
          setConnectionInfo('Call connected');
          break;
        case 'checking':
          setConnectionInfo('Establishing connection...');
          break;
        case 'failed':
        case 'disconnected':
          setConnectionInfo('Connection failed or lost');
          break;
        case 'closed':
          setConnectionInfo('Connection closed');
          break;
        default:
          setConnectionInfo(`Connection state: ${state}`);
      }
    };

    // Add local stream tracks if available
    if (localStream) {
      localStream.getTracks().forEach(track => {
        peerConnection.current.addTrack(track, localStream);
      });
    }
  };

  const initializeMediaAndPeerConnection = async (amIOfferer) => {
    try {
      setIsLoading(true);
      isOfferer.current = amIOfferer;

      if (!permissionsGranted) {
        const granted = await requestPermissions();
        if (!granted) return false;
      }

      if (!localStream) {
        setConnectionInfo('Accessing camera and microphone...');
        
        const stream = await mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 },
            facingMode: 'user',
          },
        });
        
        setLocalStream(stream);
        console.log('Local stream obtained');
      }

      if (!peerConnection.current) {
        createPeerConnection();
      }

      return true;
    } catch (error) {
      console.error('Error initializing media:', error);
      setConnectionInfo('Media initialization failed');
      Alert.alert('Error', 'Failed to access camera/microphone: ' + error.message);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const startCallHandler = async () => {
    if (connectionStatus !== ConnectionStatus.CONNECTED) {
      Alert.alert('Cannot Start Call', 'Not connected to the signaling server.');
      return;
    }

    console.log('Starting call...');
    setCallState(CallState.CALLING);
    setConnectionInfo('Starting call...');

    try {
      const success = await initializeMediaAndPeerConnection(true);
      if (!success) {
        setCallState(CallState.IDLE);
        return;
      }

      if (peerConnection.current) {
        const offer = await peerConnection.current.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
        });
        await peerConnection.current.setLocalDescription(offer);
        sendMessage({ offer: offer });
        setConnectionInfo('Call offer sent, waiting for response...');
      }
    } catch (error) {
      console.error('Error starting call:', error);
      Alert.alert('Error', 'Could not start the call: ' + error.message);
      setCallState(CallState.IDLE);
      setConnectionInfo('Call failed to start');
    }
  };

  const handleOffer = async (offer) => {
    try {
      setCallState(CallState.INCOMING);
      setConnectionInfo('Incoming call, setting up...');

      if (!peerConnection.current) {
        const success = await initializeMediaAndPeerConnection(false);
        if (!success) return;
      }

      await peerConnection.current.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await peerConnection.current.createAnswer();
      await peerConnection.current.setLocalDescription(answer);
      sendMessage({ answer: answer });
      
      setConnectionInfo('Call answered, connecting...');
    } catch (error) {
      console.error('Error handling offer:', error);
      setConnectionInfo('Failed to handle incoming call');
    }
  };

  const handleAnswer = async (answer) => {
    try {
      await peerConnection.current.setRemoteDescription(new RTCSessionDescription(answer));
      setConnectionInfo('Call established, connecting...');
    } catch (error) {
      console.error('Error handling answer:', error);
      setConnectionInfo('Failed to establish call');
    }
  };

  const handleCandidate = async (candidate) => {
    try {
      if (candidate && peerConnection.current) {
        await peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate));
      }
    } catch (error) {
      console.error('Error adding ICE candidate:', error);
    }
  };

  const hangUpCallHandler = (notifyPeer = true) => {
    console.log('Hanging up call...');
    
    if (notifyPeer) {
      sendMessage({ hangup: true });
    }

    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      localStream.release();
    }
    
    if (peerConnection.current) {
      peerConnection.current.close();
      peerConnection.current = null;
    }

    setLocalStream(null);
    setRemoteStream(null);
    setCallState(CallState.IDLE);
    isOfferer.current = false;
    setConnectionInfo(connectionStatus === ConnectionStatus.CONNECTED ? 'Ready to call' : 'Disconnected');
    
    console.log('Call ended and resources cleaned up');
  };

  const handleHangupSignal = () => {
    console.log('Received hangup signal');
    hangUpCallHandler(false);
  };

  const cleanup = () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    hangUpCallHandler(false);
    if (socket.current) {
      socket.current.close();
    }
  };

  const getStatusColor = () => {
    switch (connectionStatus) {
      case ConnectionStatus.CONNECTED:
        return '#4CAF50';
      case ConnectionStatus.CONNECTING:
      case ConnectionStatus.RECONNECTING:
        return '#FF9800';
      default:
        return '#F44336';
    }
  };

  const isCallInProgress = callState !== CallState.IDLE;
  const canStartCall = connectionStatus === ConnectionStatus.CONNECTED && !isCallInProgress && !isLoading;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#667eea" />
      
      <View style={styles.header}>
        <Text style={styles.title}>📱 WebRTC Video Call</Text>
        
        <View style={styles.statusContainer}>
          <View style={[styles.statusDot, { backgroundColor: getStatusColor() }]} />
          <Text style={styles.statusText}>
            {connectionStatus === ConnectionStatus.CONNECTED ? 'Connected' : 
             connectionStatus === ConnectionStatus.CONNECTING ? 'Connecting...' :
             connectionStatus === ConnectionStatus.RECONNECTING ? 'Reconnecting...' : 'Disconnected'}
          </Text>
        </View>
        
        <Text style={styles.infoText}>{connectionInfo}</Text>
      </View>

      <View style={styles.videoContainer}>
        <View style={styles.videoWrapper}>
          <Text style={styles.videoLabel}>Your Video</Text>
          {localStream ? (
            <RTCView
              streamURL={localStream.toURL()}
              style={styles.video}
              objectFit="cover"
              mirror={true}
            />
          ) : (
            <View style={styles.videoPlaceholder}>
              <Text style={styles.placeholderIcon}>📹</Text>
              <Text style={styles.placeholderText}>Your camera</Text>
            </View>
          )}
        </View>

        <View style={styles.videoWrapper}>
          <Text style={styles.videoLabel}>Remote Video</Text>
          {remoteStream ? (
            <RTCView
              streamURL={remoteStream.toURL()}
              style={styles.video}
              objectFit="cover"
              mirror={false}
            />
          ) : (
            <View style={styles.videoPlaceholder}>
              <Text style={styles.placeholderIcon}>👤</Text>
              <Text style={styles.placeholderText}>Remote user</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.controlsContainer}>
        {isLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#4CAF50" />
            <Text style={styles.loadingText}>Please wait...</Text>
          </View>
        )}
        
        {!isCallInProgress ? (
          <TouchableOpacity
            style={[styles.button, styles.startButton, !canStartCall && styles.disabledButton]}
            onPress={startCallHandler}
            disabled={!canStartCall}
          >
            <Text style={styles.buttonText}>🚀 Start Call</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.button, styles.hangupButton]}
            onPress={() => hangUpCallHandler(true)}
          >
            <Text style={styles.buttonText}>📞 Hang Up</Text>
          </TouchableOpacity>
        )}

        {!permissionsGranted && (
          <TouchableOpacity
            style={[styles.button, styles.permissionButton]}
            onPress={requestPermissions}
            disabled={isLoading}
          >
            <Text style={styles.buttonText}>🔐 Grant Permissions</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#667eea',
  },
  header: {
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 10,
    textAlign: 'center',
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  statusText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  infoText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  videoContainer: {
    flex: 1,
    flexDirection: 'row',
    paddingHorizontal: 10,
    marginBottom: 20,
  },
  videoWrapper: {
    flex: 1,
    marginHorizontal: 5,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 15,
    overflow: 'hidden',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  videoLabel: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: 'rgba(0,0,0,0.7)',
    color: 'white',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    fontSize: 12,
    fontWeight: '600',
    zIndex: 10,
  },
  video: {
    width: '100%',
    height: '100%',
    backgroundColor: '#2c3e50',
  },
  videoPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(44, 62, 80, 0.8)',
  },
  placeholderIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  placeholderText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    textAlign: 'center',
  },
  controlsContainer: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    alignItems: 'center',
  },
  loadingContainer: {
    alignItems: 'center',
    marginBottom: 15,
  },
  loadingText: {
    color: 'white',
    marginTop: 8,
    fontSize: 14,
  },
  button: {
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 25,
    marginVertical: 5,
    minWidth: 200,
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  startButton: {
    backgroundColor: '#4CAF50',
  },
  hangupButton: {
    backgroundColor: '#F44336',
  },
  permissionButton: {
    backgroundColor: '#FF9800',
  },
  disabledButton: {
    backgroundColor: '#888',
    elevation: 0,
    shadowOpacity: 0,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
});