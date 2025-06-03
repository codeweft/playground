import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, Button, SafeAreaView, Platform, Alert } from 'react-native';
import { Audio } from 'expo-av';
import { RTCPeerConnection, mediaDevices, RTCIceCandidate, RTCSessionDescription } from 'react-native-webrtc';
import io from 'socket.io-client';

const SERVER_URL = Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';

export default function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [status, setStatus] = useState('Ready');
  const [hasPermission, setHasPermission] = useState(null);

  const socket = useRef(null);
  const peerConnection = useRef(null);
  const localStream = useRef(null);
  const sound = useRef(new Audio.Sound());

  const peerConnectionConfig = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
  };

  useEffect(() => {
    (async () => {
      setStatus('Requesting permissions...');
      const audioPerm = await Audio.requestPermissionsAsync();
      setHasPermission(audioPerm.status === 'granted');
      if (audioPerm.status === 'granted') {
        setStatus('Ready');
        try {
            await Audio.setAudioModeAsync({
                allowsRecordingIOS: true,
                playsInSilentModeIOS: true,
            });
        } catch (e) {
            console.error("Failed to set audio mode", e);
        }
      } else {
        setStatus('Permission not granted');
        Alert.alert('Permissions not granted', 'Cannot record or play audio without microphone permission.');
      }
    })();

    socket.current = io(SERVER_URL, { transports: ['websocket'] });
    setStatus('Connecting to server...');

    socket.current.on('connect', () => {
      setStatus('Connected to server');
      console.log('Connected to signaling server');
    });

    socket.current.on('connect_error', (err) => {
      setStatus('Server connection error');
      console.error('Connection to server failed:', err.message);
      Alert.alert('Server Error', 'Could not connect to the signaling server.');
    });

    socket.current.on('signal', async (message) => {
      if (!peerConnection.current && !message.offer) {
          console.log('PeerConnection not init or not an offer, ignoring signal');
          return;
      }
      try {
        if (message.offer) {
          console.log('Received offer, creating PC and setting remote desc');
          initializePeerConnection();
          await peerConnection.current.setRemoteDescription(new RTCSessionDescription(message.offer));
          const answer = await peerConnection.current.createAnswer();
          await peerConnection.current.setLocalDescription(answer);
          socket.current.emit('signal', { answer: peerConnection.current.localDescription });
          console.log('Sent answer');
        } else if (message.answer) {
          if (!peerConnection.current) { console.error('PC not found for answer'); return; }
          console.log('Received answer:', message.answer);
          await peerConnection.current.setRemoteDescription(new RTCSessionDescription(message.answer));
        } else if (message.candidate) {
          if (!peerConnection.current) { console.error('PC not found for candidate'); return; }
          console.log('Received ICE candidate:', message.candidate);
          await peerConnection.current.addIceCandidate(new RTCIceCandidate(message.candidate));
        }
      } catch (error) {
        console.error('Error handling incoming signal:', error);
        setStatus('WebRTC signaling error');
        Alert.alert('Signaling Error', `Failed to process signal: ${error.message}`);
      }
    });

    socket.current.on('playbackReady', async ({ streamUrl }) => {
        if (!streamUrl) {
            Alert.alert('Playback Error', 'Server did not provide a stream URL.');
            setStatus('Playback error');
            setIsPlaying(false);
            return;
        }
        const fullStreamUrl = SERVER_URL + streamUrl;
        console.log('Received playbackReady, URL:', fullStreamUrl);
        setStatus('Preparing playback...');
        try {
            await sound.current.unloadAsync();
            await sound.current.loadAsync(
                { uri: fullStreamUrl },
                { shouldPlay: true }
            );
            sound.current.setOnPlaybackStatusUpdate((playbackStatus) => {
                if (!playbackStatus.isLoaded) {
                    if (playbackStatus.error) {
                        console.error(`Playback Error: ${playbackStatus.error}`);
                        Alert.alert('Playback Error', playbackStatus.error);
                        setIsPlaying(false);
                        setStatus('Playback error');
                        sound.current.unloadAsync();
                    }
                    return;
                }
                // isLoaded is true
                setStatus(playbackStatus.isPlaying ? 'Playing...' : 'Playback loaded/paused');
                if (playbackStatus.didJustFinish) {
                    setIsPlaying(false);
                    setStatus('Playback Finished');
                    sound.current.unloadAsync();
                }
            });
            setIsPlaying(true);
        } catch (e) {
            console.error('Error loading/playing sound:', e);
            Alert.alert('Playback Error', `Failed to load or play audio: ${e.message}`);
            setStatus('Playback error');
            setIsPlaying(false);
            await sound.current.unloadAsync();
        }
    });

    socket.current.on('playbackError', ({ message }) => {
        Alert.alert('Playback Error', message || 'Unknown error from server during playback request.');
        setStatus('Playback error');
        setIsPlaying(false);
    });

    return () => {
      if (socket.current) socket.current.disconnect();
      if (peerConnection.current) peerConnection.current.close();
      if (localStream.current) localStream.current.getTracks().forEach(track => track.stop());
      sound.current.unloadAsync();
    };
  }, []);

  const initializePeerConnection = () => {
    if (peerConnection.current && peerConnection.current.signalingState !== 'closed') {
        console.log('PeerConnection already exists and is not closed.');
    } else {
        peerConnection.current = new RTCPeerConnection(peerConnectionConfig);
        console.log('PeerConnection initialized');
    }

    peerConnection.current.onicecandidate = (event) => {
      if (event.candidate) {
        socket.current.emit('signal', { candidate: event.candidate });
      }
    };

    peerConnection.current.oniceconnectionstatechange = () => {
      const pc = peerConnection.current;
      if (!pc) return;
      console.log('ICE connection state change:', pc.iceConnectionState);
      switch (pc.iceConnectionState) {
        case 'checking':
          setStatus('Connecting stream...');
          break;
        case 'connected':
        case 'completed':
          setStatus('Streaming connected');
          break;
        case 'disconnected':
          setStatus('Stream disconnected');
          // Potentially start PING/PONG or re-check, or alert user
          // Alert.alert("Connection Issue", "Audio stream disconnected. Check your network.");
          break;
        case 'failed':
          setStatus('Stream connection failed');
          Alert.alert("Connection Failed", "Failed to establish audio stream. Please try again.");
          // Consider closing PC and allowing user to retry.
          // pc.close(); peerConnection.current = null; setIsRecording(false);
          break;
        case 'closed':
          setStatus('Stream closed');
          break;
        default:
          setStatus(`ICE: ${pc.iceConnectionState}`);
      }
    };

    peerConnection.current.ontrack = (event) => {
        console.log("Received remote track (unexpected for this app's playback design):", event.track);
    };

    if (localStream.current) {
        localStream.current.getTracks().forEach(track => {
            if (!peerConnection.current.getSenders().find(s => s.track === track)) {
                peerConnection.current.addTrack(track, localStream.current);
            }
        });
        console.log('Local stream tracks (re)added to PeerConnection');
    }
  };

  const handleStartRecording = async () => {
    if (!hasPermission) {
      Alert.alert('Permissions not granted', 'Cannot record. Please enable mic permission.');
      return;
    }
    if (!socket.current || !socket.current.connected) {
      Alert.alert('Server not connected', 'Cannot start recording.');
      return;
    }
    if (isRecording) return; // Already recording

    setIsRecording(true);
    setStatus('Initiating stream...');

    try {
      if (!localStream.current) {
        const stream = await mediaDevices.getUserMedia({ audio: true, video: false });
        localStream.current = stream;
        setStatus('Microphone ready');
      }

      initializePeerConnection();

      if (peerConnection.current.signalingState === 'stable') {
          const offer = await peerConnection.current.createOffer();
          await peerConnection.current.setLocalDescription(offer);
          console.log('Sending offer...');
          socket.current.emit('signal', { offer: peerConnection.current.localDescription });
          setStatus('Offer sent. Negotiating...');
      } else {
          console.warn("Signaling state not stable for creating offer:", peerConnection.current.signalingState);
          setStatus('WebRTC not ready. Try again.');
          // Consider resetting PC:
          // if(peerConnection.current) peerConnection.current.close();
          // peerConnection.current = null;
          setIsRecording(false);
      }
    } catch (error) {
      console.error('Error starting recording:', error);
      setStatus('Error starting recording');
      Alert.alert('Recording Error', error.message);
      setIsRecording(false);
      // Clean up local stream if it was just created for this attempt
      // if (localStream.current) {
      //   localStream.current.getTracks().forEach(track => track.stop());
      //   localStream.current = null;
      // }
    }
  };

  const handleStopRecording = () => {
    if (!isRecording && !(peerConnection.current && peerConnection.current.signalingState !== 'closed')) {
        // Not recording and PC is not active or doesn't exist
        setStatus("Nothing to stop.");
        return;
    }
    setIsRecording(false); // Set this first to change button state
    setStatus('Stopping recording...');

    if (localStream.current) {
      // Optional: stop tracks if not intending to immediately re-record with same stream
      // localStream.current.getTracks().forEach(track => track.stop());
      // localStream.current = null; // if stopping tracks
      console.log('Local stream tracks kept for potential reuse or will be stopped by PC close.');
    }

    if (peerConnection.current) {
      socket.current.emit('stopStream');
      peerConnection.current.close();
      peerConnection.current = null;
      console.log('PeerConnection closed.');
      setStatus('Recording stopped. Stream closed.');
    } else {
      setStatus('Recording stopped.');
    }
  };

  const handlePlayLastRecording = async () => {
    if (!socket.current || !socket.current.connected) {
        Alert.alert('Server Error', 'Not connected to server.');
        return;
    }
    if (isPlaying) {
        console.log("Stopping current playback.");
        setStatus("Stopping playback...");
        await sound.current.stopAsync(); // Request stop
        await sound.current.unloadAsync(); // Unload resources
        setIsPlaying(false);
        setStatus("Playback stopped");
        return;
    }

    console.log('Requesting playback from server...');
    setStatus('Requesting playback...');
    socket.current.emit('requestPlayback');
  };

  if (hasPermission === null) {
    return <SafeAreaView style={styles.container}><View style={styles.centered}><Text>Requesting permissions...</Text></View></SafeAreaView>;
  }
  if (hasPermission === false) {
    return <SafeAreaView style={styles.container}><View style={styles.centered}><Text>Microphone permission not granted.</Text></View></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}><Text style={styles.title}>Audio Streamer</Text></View>
      <View style={styles.controls}>
        <Button
          title={isRecording ? "Stop Recording" : "Start Recording"}
          onPress={isRecording ? handleStopRecording : handleStartRecording}
          disabled={isPlaying || !hasPermission }
        />
        <Button
          title={isPlaying ? "Stop Playback" : "Play Last Recording"}
          onPress={handlePlayLastRecording}
          disabled={isRecording}
        />
      </View>
      <View style={styles.statusContainer}><Text style={styles.statusText}>Status: {status}</Text></View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f0f0', alignItems: 'center', justifyContent: 'center', paddingTop: Platform.OS === 'android' ? 25 : 0 },
  centered: { alignItems: 'center', justifyContent: 'center', padding: 20 },
  header: { position: 'absolute', top: Platform.OS === 'android' ? 45 : 60, alignItems: 'center' },
  title: { fontSize: 24, fontWeight: 'bold' },
  controls: { justifyContent: 'space-around', alignItems: 'center', width: '80%', minHeight: 120 },
  statusContainer: { position: 'absolute', bottom: 40, alignItems: 'center' },
  statusText: { fontSize: 18, color: '#333' },
});
