import * as RFileSystem from 'expo-file-system';
import { AppState, AppStateStatus } from 'react-native';

// IMPORTANT FOR TESTING ON PHYSICAL DEVICE:
// Replace 'ws://localhost:3000' with the actual IP address of your development machine
// on your local network. For example: 'ws://192.168.1.100:3000'
// Ensure your backend server is accessible from your device over the network.
const SERVER_URL = 'ws://localhost:3000';

interface StreamMetadata {
  id: string;
  type: 'audio' | 'video';
  fileName: string;
}

let socket: WebSocket | null = null;
let onOpenCallback: (() => void) | null = null;
let onErrorCallback: ((error: Event) => void) | null = null;
let onCloseCallback: ((event: CloseEvent) => void) | null = null;
let onMessageCallback: ((event: MessageEvent) => void) | null = null;

let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 3000; // 3 seconds

let appStateSubscription: any | null = null;

const handleAppStateChange = (nextAppState: AppStateStatus) => {
  console.log('StreamingService: App state changed to:', nextAppState);
  if (nextAppState === 'active') {
    if (!socket || socket.readyState === WebSocket.CLOSED) {
      console.log('StreamingService: App is active and WebSocket is closed, attempting to reconnect.');
      connectWebSocket(onOpenCallback, onErrorCallback, onCloseCallback, onMessageCallback);
    }
  } else if (nextAppState.match(/inactive|background/)) {
    console.log('StreamingService: App is going to background/inactive. WebSocket state:', socket?.readyState);
  }
};

export const initializeAppStateListener = () => {
  if (appStateSubscription) {
    appStateSubscription.remove();
  }
  appStateSubscription = AppState.addEventListener('change', handleAppStateChange);
  console.log('StreamingService: AppState listener initialized.');
};

export const removeAppStateListener = () => {
  if (appStateSubscription) {
    appStateSubscription.remove();
    appStateSubscription = null;
    console.log('StreamingService: AppState listener removed.');
  }
};

export const connectWebSocket = (
  onOpen?: () => void,
  onError?: (error: Event) => void,
  onClose?: (event: CloseEvent) => void,
  onMessage?: (event: MessageEvent) => void,
): void => {
  if (socket && socket.readyState === WebSocket.OPEN) {
    console.log('StreamingService: WebSocket already connected.');
    onOpen?.();
    return;
  }
  if (socket && socket.readyState === WebSocket.CONNECTING) {
    console.log('StreamingService: WebSocket connection attempt already in progress.');
    return;
  }

  console.log(`StreamingService: Attempting to connect to WebSocket: ${SERVER_URL} (Attempt: ${reconnectAttempts + 1})`);
  socket = new WebSocket(SERVER_URL);

  if (onOpen) onOpenCallback = onOpen;
  if (onError) onErrorCallback = onError;
  if (onClose) onCloseCallback = onClose;
  if (onMessage) onMessageCallback = onMessage;

  socket.onopen = () => {
    console.log('StreamingService: WebSocket connected');
    reconnectAttempts = 0;
    onOpenCallback?.();
  };

  socket.onmessage = (event) => {
    onMessageCallback?.(event);
  };

  socket.onerror = (error) => {
    console.error('StreamingService: WebSocket error:', error);
    onErrorCallback?.(error);
  };

  socket.onclose = (event) => {
    console.log(`StreamingService: WebSocket disconnected: ${event.reason} (Code: ${event.code}, Clean: ${event.wasClean})`);
    const wasManuallyClosed = event.code === 1000 || event.code === 1005;

    if (onCloseCallback) {
        onCloseCallback(event);
    }

    socket = null;

    if (!wasManuallyClosed && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      reconnectAttempts++;
      console.log(`StreamingService: Attempting to reconnect in ${RECONNECT_DELAY / 1000}s (Attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
      setTimeout(() => {
        connectWebSocket(onOpenCallback, onErrorCallback, onCloseCallback, onMessageCallback);
      }, RECONNECT_DELAY);
    } else if (!wasManuallyClosed) {
      console.log('StreamingService: Max reconnect attempts reached.');
      reconnectAttempts = 0;
    } else {
      console.log('StreamingService: WebSocket closed normally or no further attempts needed.');
      reconnectAttempts = 0;
    }
  };
};

export const sendStreamMetadata = (metadata: StreamMetadata): boolean => {
  if (socket && socket.readyState === WebSocket.OPEN) {
    console.log('StreamingService: Sending stream metadata:', metadata);
    socket.send(JSON.stringify(metadata));
    return true;
  } else {
    console.error('StreamingService: WebSocket not connected. Cannot send metadata.');
    return false;
  }
};

export const sendStreamChunk = (chunk: ArrayBuffer | string): boolean => {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(chunk);
    return true;
  } else {
    console.error('StreamingService: WebSocket not connected. Cannot send chunk.');
    return false;
  }
};

export const sendRecordedFile = async (metadata: StreamMetadata, fileUri: string): Promise<boolean> => {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    console.error('StreamingService: WebSocket not connected. Cannot send file.');
    return false;
  }

  const metadataSent = sendStreamMetadata(metadata);
  if (!metadataSent) {
    console.error('StreamingService: Failed to send metadata. Aborting file send.');
    return false;
  }

  try {
    console.log(`StreamingService: Reading file for streaming: ${fileUri}`);
    // PERFORMANCE NOTE: Reading file as Base64 and then converting to ArrayBuffer
    // can be memory and CPU intensive for very large files.
    // For optimal performance with large files, a native solution for chunked
    // binary file reading would be preferable.
    const fileContentBase64 = await RFileSystem.readAsStringAsync(fileUri, {
      encoding: RFileSystem.EncodingType.Base64,
    });

    const binaryString = atob(fileContentBase64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    console.log(`StreamingService: Sending file content as binary data (${bytes.byteLength} bytes) for ${metadata.fileName}`);
    const chunkSent = sendStreamChunk(bytes.buffer);
    if (!chunkSent) {
        console.error('StreamingService: Failed to send file chunk. WebSocket might have closed.');
        // Consider how to inform UI about this partial failure.
        return false;
    }

    console.log(`StreamingService: File ${metadata.fileName} sent.`);
    return true;
  } catch (error) {
    console.error(`StreamingService: Error reading or sending file ${fileUri}:`, error);
    // Consider sending an error message to the backend if connection is still up.
    return false;
  }
};

export const closeWebSocket = (): void => {
  if (socket) {
    console.log('StreamingService: Manually closing WebSocket connection.');
    reconnectAttempts = MAX_RECONNECT_ATTEMPTS;
    socket.close(1000, "Client closed connection");
  }
};

export const getWebSocketState = (): number | null => {
  return socket ? socket.readyState : null;
};

export const getReconnectAttempts = (): number => reconnectAttempts;

export const generateUniqueId = () => `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
