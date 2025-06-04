// App.js
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, Button, Platform, Alert, SafeAreaView } from 'react-native';
import { Audio } from 'expo-av';
import { RTCPeerConnection, mediaDevices, RTCIceCandidate, RTCSessionDescription } from 'react-native-webrtc';
import io from 'socket.io-client';

const SERVER_URL = Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';

export default function App() {
  const [status, setStatus] = useState('Idle');
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  const socket = useRef(null);
  const peerConnection = useRef(null);
  const localStream = useRef(null);
  const sound = useRef(null);

  useEffect(() => {
    const setup = async () => {
      try {
        // Request audio permissions
        const { status: audioStatus } = await Audio.requestPermissionsAsync();
        if (audioStatus !== 'granted') {
          Alert.alert('Permission required', 'Audio permission is required for recording');
          return;
        }

        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
          staysActiveInBackground: true,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        });

        // Initialize sound object
        sound.current = new Audio.Sound();

        // Setup socket connection
        socket.current = io(SERVER_URL, { 
          transports: ['websocket'],
          timeout: 5000,
          reconnection: true,
          reconnectionAttempts: 5,
          reconnectionDelay: 1000
        });

        socket.current.on('connect', () => {
          console.log('Connected to server');
          setStatus('Connected to server');
        });

        socket.current.on('connect_error', (error) => {
          console.error('Connection error:', error);
          setStatus('Connection failed');
        });

        socket.current.on('signal', async (data) => {
          try {
            if (data.answer && peerConnection.current) {
              await peerConnection.current.setRemoteDescription(new RTCSessionDescription(data.answer));
              console.log('Remote description set');
            } else if (data.candidate && peerConnection.current) {
              await peerConnection.current.addIceCandidate(new RTCIceCandidate(data.candidate));
              console.log('ICE candidate added');
            }
          } catch (error) {
            console.error('Signal handling error:', error);
          }
        });

        socket.current.on('playbackReady', async ({ streamUrl }) => {
          try {
            if (sound.current) {
              await sound.current.unloadAsync();
              const fullUrl = `${SERVER_URL}${streamUrl}`;
              console.log('Loading audio from:', fullUrl);
              
              await sound.current.loadAsync(
                { uri: fullUrl },
                { shouldPlay: false }
              );
              
              sound.current.setOnPlaybackStatusUpdate((status) => {
                if (status.didJustFinish) {
                  setIsPlaying(false);
                  setStatus('Playback finished');
                }
              });

              await sound.current.playAsync();
              setStatus('Playing audio');
              setIsPlaying(true);
            }
          } catch (error) {
            console.error('Playback error:', error);
            Alert.alert('Playback Error', error.message);
            setStatus('Playback failed');
          }
        });

        socket.current.on('playbackError', ({ message }) => {
          Alert.alert('Playback Error', message);
          setStatus('No recording available');
        });

        socket.current.on('recordingStarted', () => {
          setStatus('Recording started on server');
        });

        socket.current.on('recordingStopped', () => {
          setStatus('Recording saved');
        });

      } catch (error) {
        console.error('Setup error:', error);
        setStatus('Setup failed');
      }
    };

    setup();

    return () => {
      cleanup();
    };
  }, []);

  const cleanup = async () => {
    try {
      if (localStream.current) {
        localStream.current.getTracks().forEach(track => track.stop());
      }
      if (peerConnection.current) {
        peerConnection.current.close();
      }
      if (socket.current) {
        socket.current.disconnect();
      }
      if (sound.current) {
        await sound.current.unloadAsync();
      }
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  };

  const startRecording = async () => {
    try {
      setStatus('Starting recording...');

      // Get user media
      const stream = await mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000
        },
        video: false
      });

      localStream.current = stream;

      // Create peer connection
      peerConnection.current = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' }
        ]
      });

      // Add tracks to peer connection
      stream.getTracks().forEach((track) => {
        peerConnection.current.addTrack(track, stream);
      });

      // Handle ICE candidates
      peerConnection.current.onicecandidate = (event) => {
        if (event.candidate && socket.current) {
          socket.current.emit('signal', { candidate: event.candidate });
        }
      };

      peerConnection.current.onconnectionstatechange = () => {
        console.log('Connection state:', peerConnection.current.connectionState);
      };

      // Create and send offer
      const offer = await peerConnection.current.createOffer();
      await peerConnection.current.setLocalDescription(offer);
      
      if (socket.current) {
        socket.current.emit('signal', { offer });
      }

      setIsRecording(true);
      setStatus('Recording...');

    } catch (error) {
      console.error('Recording start error:', error);
      Alert.alert('Recording Error', error.message);
      setStatus('Recording failed');
    }
  };

  const stopRecording = async () => {
    try {
      setStatus('Stopping recording...');

      if (localStream.current) {
        localStream.current.getTracks().forEach((track) => track.stop());
        localStream.current = null;
      }

      if (peerConnection.current) {
        peerConnection.current.close();
        peerConnection.current = null;
      }

      if (socket.current) {
        socket.current.emit('stopStream');
      }

      setIsRecording(false);
      setStatus('Recording stopped');

    } catch (error) {
      console.error('Recording stop error:', error);
      setStatus('Error stopping recording');
    }
  };

  const handlePlayback = async () => {
    try {
      if (isPlaying) {
        // Stop current playback
        if (sound.current) {
          await sound.current.stopAsync();
          setIsPlaying(false);
          setStatus('Playback stopped');
        }
      } else {
        // Request new playback
        if (socket.current) {
          socket.current.emit('requestPlayback');
          setStatus('Requesting playback...');
        }
      }
    } catch (error) {
      console.error('Playback error:', error);
      Alert.alert('Playback Error', error.message);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Audio Streamer</Text>
      <Text style={styles.status}>Status: {status}</Text>
      
      <View style={styles.buttonContainer}>
        <Button
          title={isRecording ? 'Stop Recording' : 'Start Recording'}
          onPress={isRecording ? stopRecording : startRecording}
          disabled={isPlaying}
          color={isRecording ? '#ff4444' : '#4CAF50'}
        />
      </View>

      <View style={styles.buttonContainer}>
        <Button
          title={isPlaying ? 'Stop Playback' : 'Play Last Recording'}
          onPress={handlePlayback}
          disabled={isRecording}
          color={isPlaying ? '#ff4444' : '#2196F3'}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#f5f5f5'
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#333'
  },
  status: {
    fontSize: 16,
    marginBottom: 30,
    textAlign: 'center',
    color: '#666'
  },
  buttonContainer: {
    marginVertical: 10,
    width: '80%'
  }
});