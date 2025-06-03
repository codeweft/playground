import React, { useState, useEffect, useRef } from 'react';
import { View, Button, StyleSheet, Text, Platform, Alert, AppState, AppStateStatus } from 'react-native';
import { Camera } from 'expo-camera';
// Audio import is not directly used in UI but service is
import { requestMediaPermissions } from '../services/PermissionService';
import { startAudioRecording, stopAudioRecording, streamAudioFile } from '../services/AudioService';
import { startVideoRecording, stopVideoRecording, setCameraRef, isVideoRecording as getIsVideoRecordingState } from '../services/VideoService';
import {
  connectWebSocket,
  closeWebSocket,
  getWebSocketState,
  getReconnectAttempts,
  initializeAppStateListener, // Import AppState listener functions
  removeAppStateListener
} from '../services/StreamingService';

const MediaControls: React.FC = () => {
  const [hasPermissions, setHasPermissions] = useState<boolean | null>(null);
  const [isAudioRecording, setIsAudioRecording] = useState(false);
  const [audioStreamId, setAudioStreamId] = useState<string | null>(null);
  const [audioStatus, setAudioStatus] = useState('');

  const [isVideoButtonRecording, setIsVideoButtonRecording] = useState(false); // UI state for video button, distinct from actual recording state
  const [videoStreamId, setVideoStreamId] = useState<string | null>(null);

  const [lastAudioUri, setLastAudioUri] = useState<string | null>(null);
  const [lastVideoUri, setLastVideoUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [socketStatus, setSocketStatus] = useState<string>('Initializing...');

  const cameraRef = useRef<Camera | null>(null);
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    // Initialize AppState listener from StreamingService
    initializeAppStateListener();

    // Permissions
    (async () => {
      const alreadyGranted = await requestMediaPermissions();
      setHasPermissions(alreadyGranted);
      if (!alreadyGranted) {
        setError("Camera/Microphone permissions not granted.");
      }
    })();

    // WebSocket Connection
    setSocketStatus('Connecting...');
    connectWebSocket(
      () => setSocketStatus('Connected'),
      (errEvent) => {
        setSocketStatus('Connection Error');
        console.error('MediaControls WebSocket Error:', errEvent);
        // Error is updated via onClose if reconnection fails
      },
      (closeEvent) => {
        const currentReconnectAttempts = getReconnectAttempts();
        if (currentReconnectAttempts > 0 && currentReconnectAttempts < 5) { // Assuming MAX_RECONNECT_ATTEMPTS is 5 in service
            setSocketStatus(`Reconnecting (Attempt ${currentReconnectAttempts})...`);
            setError(null); // Clear previous error during reconnection attempts
        } else if (currentReconnectAttempts >= 5) {
            setSocketStatus('Disconnected (Max Retries)');
            setError(`WebSocket disconnected: ${closeEvent.reason || 'Max retries reached'}. Please check server & network.`);
        } else { // Normal close or initial failure without retries yet
            setSocketStatus(`Disconnected: ${closeEvent.reason || 'No reason'}`);
            if (!closeEvent.wasClean && closeEvent.code !== 1000) {
                 setError(`WebSocket closed unexpectedly: ${closeEvent.code}. Check server & network.`);
            }
        }
      },
      (msgEvent) => {
        // console.log('MediaControls WebSocket Message:', msgEvent.data);
        try {
            const data = JSON.parse(msgEvent.data as string);
            if (data.status === 'ready_for_data' && data.id) {
                Alert.alert('Server Ready', `Server ready for data for stream ID: ${data.id}`);
            } else if (data.error) {
                setError(`Server error (${data.streamId || 'general'}): ${data.error}`);
            } else if (data.status === 'connected_to_server') {
                // This is handled by onOpen, but good to see
            }
        } catch (e) { /* Ignore non-JSON messages if any */ }
      }
    );

    // AppState listener for this component (e.g., to stop video recording)
    const subscription = AppState.addEventListener('change', _handleAppStateChange);

    return () => {
      closeWebSocket();
      removeAppStateListener(); // Clean up StreamingService's listener
      subscription.remove(); // Clean up this component's listener
    };
  }, []);

  const _handleAppStateChange = async (nextAppState: AppStateStatus) => {
    if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
      console.log('MediaControls: App has come to the foreground!');
      // WebSocket reconnection is handled by StreamingService's AppState listener
    }

    if (nextAppState.match(/inactive|background/)) {
        console.log('MediaControls: App is going into background/inactive state.');
        if (getIsVideoRecordingState()) {
            console.log('Video is recording, stopping it due to app backgrounding.');
            Alert.alert("Recording Paused", "Video recording has been paused as the app moved to the background. Please restart recording if needed.");
            await handleVideoRecord(); // This will call stopVideoRecording
            setIsVideoButtonRecording(false); // Ensure button state reflects stop
            setAudioStatus("Video stopped (app backgrounded)");
        }
    }
    appState.current = nextAppState;
  };


  useEffect(() => {
    if (cameraRef.current) {
      setCameraRef(cameraRef.current);
    }
  }, [cameraRef.current]);

  const handleAudioRecord = async () => {
    if (!hasPermissions) {
      setError('Permissions not granted. Please check app settings.');
      Alert.alert('Permission Issue', 'Microphone permission is required.');
      return;
    }
    setError(null);

    if (isAudioRecording) {
      const uri = await stopAudioRecording();
      setIsAudioRecording(false);
      setAudioStatus('Stopping audio...');
      if (uri) {
        setLastAudioUri(uri);
        setAudioStatus(`Audio stopped. File: ${uri.substring(uri.lastIndexOf('/') + 1)}`);
      } else {
        setAudioStatus('Audio stopped. No URI.');
        setError('Failed to get audio URI after stopping.');
      }
    } else {
      if (getWebSocketState() !== WebSocket.OPEN) {
        setError('WebSocket not connected. Cannot start audio recording.');
        Alert.alert('Connection Error', 'WebSocket not connected. Please wait or check connection.');
        return;
      }
      setIsAudioRecording(true);
      setAudioStatus('Starting audio...');
      const success = await startAudioRecording(
        (status, streamId) => {
          if (streamId && !audioStreamId) setAudioStreamId(streamId);
          let statusText = `Audio Rec: ${Math.round(status.durationMillis / 1000)}s`;
          if (status.isDoneRecording) statusText = "Processing audio...";
          setAudioStatus(statusText);
        },
        async (uri, streamId) => {
          setAudioStatus(`Audio ready, streaming ${streamId}...`);
          setLastAudioUri(uri);
          const streamed = await streamAudioFile(uri, streamId);
          if (streamed) {
            setAudioStatus(`Audio streamed: ${streamId}`);
          } else {
            setAudioStatus(`Audio stream failed: ${streamId}`);
            setError(`Failed to stream audio ${streamId}. Check console and server.`);
          }
          setIsAudioRecording(false);
        }
      );
      if (!success) {
        setIsAudioRecording(false);
        setAudioStreamId(null);
        setAudioStatus('Failed to start audio.');
        setError('Failed to start audio recording. Check console.');
      }
    }
  };

  const handleVideoRecord = async () => {
    if (!hasPermissions) {
      setError('Permissions not granted. Please check app settings.');
      Alert.alert('Permission Issue', 'Camera and Microphone permissions are required.');
      return;
    }
    setError(null);

    const currentActualRecordingState = getIsVideoRecordingState();
    console.log("Video Record Button: Actual recording state is", currentActualRecordingState);

    if (currentActualRecordingState) {
      setIsVideoButtonRecording(false);
      setAudioStatus('Stopping video...');
      await stopVideoRecording();
      console.log("Video stop requested via MediaControls button.");
    } else {
      if (getWebSocketState() !== WebSocket.OPEN) {
        setError('WebSocket not connected. Cannot start video recording.');
        Alert.alert('Connection Error', 'WebSocket not connected. Please wait or check connection.');
        return;
      }
      setIsVideoButtonRecording(true);
      setAudioStatus('Starting video...');

      const success = await startVideoRecording(
        (sId) => {
          setVideoStreamId(sId);
          setIsVideoButtonRecording(true); // Sync button state with actual start
          setAudioStatus(`Video Rec started: ${sId}`);
        },
        (uri, sId) => {
          setIsVideoButtonRecording(false);
          setLastVideoUri(uri);
          setAudioStatus(uri ? `Video sent: ${sId}` : `Video ready (local): ${sId}, stream failed.`);
        },
        (err, sId) => {
          setIsVideoButtonRecording(false);
          setError(`Video Error (${sId || 'unknown'}): ${err}`);
          setAudioStatus(`Video error: ${sId || 'N/A'}`);
        }
      );
      if (!success) {
        setIsVideoButtonRecording(false);
        setVideoStreamId(null);
        setAudioStatus('Failed to start video.');
        setError('Failed to start video recording. Check console.');
      }
    }
  };

  if (hasPermissions === null) {
    return <View style={styles.centerMessage}><Text>Requesting permissions...</Text></View>;
  }
  if (hasPermissions === false) {
    return <View style={styles.centerMessage}><Text>Permissions not granted. Please enable Camera and Microphone access in app settings.</Text></View>;
  }

  return (
    <View style={styles.container}>
      {Platform.OS !== 'web' && (
        <Camera style={styles.camera} type={Camera.Constants.Type.front} ref={cameraRef} ratio="16:9" />
      )}
      <View style={styles.controls}>
        <Text style={[styles.socketStatusText,
            socketStatus.includes('Connected') ? styles.connected :
            socketStatus.includes('Error') || socketStatus.includes('Disconnected') || socketStatus.includes('Max Retries') ? styles.disconnected :
            styles.connecting]}>
          Socket: {socketStatus}
        </Text>

        <Button
          title={isAudioRecording ? 'Stop Audio' : 'Start Audio Rec'}
          onPress={handleAudioRecord}
          disabled={isVideoButtonRecording || getIsVideoRecordingState()}
          color="#FF8C00"
        />
        {audioStatus && <Text style={styles.statusText}>Status: {audioStatus}</Text>}
        {lastAudioUri && <Text style={styles.uriText}>Last audio: {lastAudioUri.substring(lastAudioUri.lastIndexOf('/') + 1)}</Text>}

        <View style={styles.space} />

        <Button
          title={isVideoButtonRecording || getIsVideoRecordingState() ? 'Stop Video' : 'Start Video Rec'}
          onPress={handleVideoRecord}
          disabled={isAudioRecording}
          color="#1E90FF"
        />
        {lastVideoUri && <Text style={styles.uriText}>Last video: {lastVideoUri.substring(lastVideoUri.lastIndexOf('/') + 1)}</Text>}

        {error && <Text style={styles.errorText}>Error: {error}</Text>}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'black' },
  camera: { flex: 1 },
  controls: { padding: 20, backgroundColor: 'rgba(0,0,0,0.7)' },
  centerMessage: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  socketStatusText: { textAlign: 'center', marginBottom: 8, fontSize: 14, fontWeight: 'bold' },
  connected: { color: '#32CD32'}, // LimeGreen
  disconnected: { color: '#FF6347'}, // Tomato
  connecting: { color: '#FFD700'}, // Gold
  statusText: { color: 'white', fontSize: 12, marginTop: 3, textAlign: 'center' },
  uriText: { color: '#ccc', fontSize: 10, marginTop: 2, textAlign: 'center' },
  space: { height: 15 },
  errorText: { color: '#FF6347', marginTop: 10, fontSize: 12, textAlign: 'center', fontWeight: 'bold'},
});

export default MediaControls;
