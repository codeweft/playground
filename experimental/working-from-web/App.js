import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Button, Alert, StyleSheet } from 'react-native';
import { RTCPeerConnection, RTCView, mediaDevices, RTCIceCandidate, RTCSessionDescription } from 'react-native-webrtc';
import { Camera } from 'expo-camera';
import { Audio } from 'expo-av';

const SERVER_URL = 'ws://192.168.1.108:8080';
const ICE_SERVERS = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

export default function App() {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [connected, setConnected] = useState(false);
  const [inCall, setInCall] = useState(false);

  const pc = useRef(null);
  const socket = useRef(null);
  const isOfferer = useRef(false);
  const pendingCandidates = useRef([]);

  useEffect(() => {
    initSocket();
    return () => {
      endCall();
      socket.current?.close();
    };
  }, []);

  const requestPermissions = async () => {
    const [camera, mic] = await Promise.all([
      Camera.requestCameraPermissionsAsync(),
      Audio.requestPermissionsAsync(),
    ]);
    const granted = camera.status === 'granted' && mic.status === 'granted';
    if (!granted) {
      Alert.alert('Permissions Required', 'Camera and Microphone access is needed.');
    }
    return granted;
  };

  const getMedia = async () => {
    try {
      return await mediaDevices.getUserMedia({
        audio: true,
        video: { facingMode: 'user', width: 640, height: 480 },
      });
    } catch {
      return await mediaDevices.getUserMedia({ audio: true, video: true });
    }
  };

  const initSocket = () => {
    socket.current = new WebSocket(SERVER_URL);

    socket.current.onopen = () => setConnected(true);
    socket.current.onclose = () => setConnected(false);
    socket.current.onerror = () => Alert.alert('WebSocket Error', 'Check your signaling server.');

    socket.current.onmessage = async ({ data }) => {
      const msg = JSON.parse(data);
      if ((msg.offer || msg.candidate) && !pc.current) await setupConnection(false);
      if (msg.offer) await handleOffer(msg.offer);
      if (msg.answer) await pc.current.setRemoteDescription(new RTCSessionDescription(msg.answer));
      if (msg.candidate) handleCandidate(msg.candidate);
      if (msg.hangup) endCall(false);
    };
  };

  const send = (msg) => {
    if (socket.current?.readyState === 1) socket.current.send(JSON.stringify(msg));
  };

  const setupConnection = async (offerer) => {
    isOfferer.current = offerer;
    const stream = await getMedia();
    setLocalStream(stream);

    pc.current = new RTCPeerConnection(ICE_SERVERS);
    stream.getTracks().forEach((t) => pc.current.addTrack(t, stream));

    pc.current.onicecandidate = ({ candidate }) => candidate && send({ candidate });
    pc.current.ontrack = ({ streams }) => setRemoteStream(streams[0]);
      

    if (offerer) {
      const offer = await pc.current.createOffer();
      await pc.current.setLocalDescription(offer);
      send({ offer });
    }
  };

  const handleOffer = async (offer) => {
    if (!(await requestPermissions())) return;
    await setupConnection(false);
    await pc.current.setRemoteDescription(new RTCSessionDescription(offer));
    for (let c of pendingCandidates.current) pc.current.addIceCandidate(new RTCIceCandidate(c));
    pendingCandidates.current = [];

    const answer = await pc.current.createAnswer();
    await pc.current.setLocalDescription(answer);
    send({ answer });
  };

  const handleCandidate = async (candidate) => {
    if (pc.current?.remoteDescription?.type) {
      await pc.current.addIceCandidate(new RTCIceCandidate(candidate));
    } else {
      pendingCandidates.current.push(candidate);
    }
  };

  const startCall = async () => {
    if (!(await requestPermissions()) || !connected) return;
    setInCall(true);
    await setupConnection(true);
  };

  const endCall = (notify = true) => {
    notify && send({ hangup: true });
    localStream?.getTracks().forEach((t) => t.stop());
    pc.current?.close();
    pc.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setInCall(false);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>WebRTC Demo</Text>
      <Text style={styles.statusText}>Server: {connected ? 'Connected' : 'Disconnected'}</Text>

      <View style={styles.videoContainer}>
        <VideoBlock label="Local" stream={localStream} mirror />
        <VideoBlock label="Remote" stream={remoteStream} />
      </View>

      <View style={styles.buttonContainer}>
        <Button title={inCall ? 'Hang Up' : 'Start Call'} onPress={inCall ? endCall : startCall} color={inCall ? 'red' : 'blue'} />
      </View>
    </View>
  );
}

function VideoBlock({ label, stream, mirror = false }) {
  return (
    <View style={styles.videoWrapper}>
      <Text style={styles.videoLabel}>{label} Video</Text>
      {stream ? (
        <RTCView streamURL={stream.toURL()} style={styles.video} objectFit="cover" mirror={mirror} />
      ) : (
        <View style={styles.videoPlaceholder}><Text>No stream</Text></View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111',
    padding: 20,
    paddingTop: 50,
  },
  title: {
    fontSize: 24,
    color: '#fff',
    marginBottom: 10,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  statusText: {
    color: '#ccc',
    textAlign: 'center',
    marginBottom: 10,
  },
  videoContainer: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: 10,
  },
  videoWrapper: {
    flex: 1,
    alignItems: 'center',
  },
  videoLabel: {
    color: '#fff',
    marginBottom: 5,
  },
  video: {
    width: '100%',
    height: 250,
    backgroundColor: '#333',
  },
  videoPlaceholder: {
    width: '100%',
    height: 250,
    backgroundColor: '#222',
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonContainer: {
    paddingVertical: 20,
    alignItems: 'center',
  },
});
