import { Audio } from 'expo-av';
import { requestMicrophonePermissions } from './PermissionService';
import { sendRecordedFile, generateUniqueId, getWebSocketState, connectWebSocket } from './StreamingService'; // Added connectWebSocket
import * as FileSystem from 'expo-file-system';


let recording: Audio.Recording | null = null;
let currentStreamId: string | null = null;

// Ensure uploads directory exists
const ensureUploadsDirExists = async () => {
  const dir = FileSystem.documentDirectory + 'uploads/';
  const dirInfo = await FileSystem.getInfoAsync(dir);
  if (!dirInfo.exists) {
    console.log("Uploads directory doesn't exist, creating…");
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
  return dir;
};


export const startAudioRecording = async (
  onStatusUpdate: (status: Audio.RecordingStatus, streamId: string | null) => void,
  onRecordingCompleteForStreaming: (uri: string, streamId: string) => void
): Promise<boolean> => {
  const hasPermission = await requestMicrophonePermissions();
  if (!hasPermission) {
    console.log('Microphone permission not granted');
    return false;
  }

  if (recording) {
    console.log('Recording already in progress');
    return false;
  }

  // Ensure WebSocket is connected before starting
  if (getWebSocketState() !== WebSocket.OPEN) {
    console.log('WebSocket not connected. Attempting to connect for audio streaming...');
    // Here, you might want to manage the connectWebSocket call more centrally
    // or pass callbacks to inform the UI about connection status.
    // For simplicity, just calling it here.
    connectWebSocket(
        () => console.log("WebSocket connected for audio streaming."),
        (err) => console.error("WebSocket connection failed for audio: ", err)
    );
    // Note: Recording will start even if WS connection is pending.
    // Consider if recording should only start AFTER WS is open.
  }

  currentStreamId = generateUniqueId();
  console.log(`Generated audio stream ID: ${currentStreamId}`);

  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });

    console.log('Starting audio recording...');
    const newRecording = new Audio.Recording();

    // Expo AV typically records in 'audio/aac' (m4a container) or 'audio/amr_wb' on Android.
    // For .wav, specific options might be needed or post-processing.
    // Let's aim for a common format. The backend will receive raw bytes.
    // The 'fileName' in metadata should reflect the intended final format.
    await newRecording.prepareToRecordAsync(Audio.RECORDING_OPTIONS_PRESET_HIGH_QUALITY);

    newRecording.setOnRecordingStatusUpdate((status) => {
      onStatusUpdate(status, currentStreamId);
      if (status.isDoneRecording) {
        const uri = newRecording.getURI();
        console.log('Audio recording finished for streaming. URI:', uri);
        if (uri && currentStreamId) {
          onRecordingCompleteForStreaming(uri, currentStreamId);
        }
        recording = null; // Clear the recording instance once processing is done
      } else if (status.durationMillis > 600000) { // Example: Stop after 10 minutes
        console.log('Max audio recording duration reached. Stopping.');
        stopAudioRecording();
      }
    });
    await newRecording.startAsync();
    recording = newRecording;
    console.log('Audio recording started.');
    return true;
  } catch (err) {
    console.error('Failed to start audio recording', err);
    currentStreamId = null;
    return false;
  }
};

export const stopAudioRecording = async (): Promise<string | null> => {
  if (!recording) {
    console.log('No active audio recording to stop.');
    return null;
  }

  console.log('Stopping audio recording...');
  try {
    await recording.stopAndUnloadAsync();
    await Audio.setAudioModeAsync({ // Reset audio mode
      allowsRecordingIOS: false,
    });
    const uri = recording.getURI(); // This URI is temporary
    console.log('Audio recording stopped locally. URI:', uri);

    if (uri && currentStreamId) {
        // The actual sending is now handled by the callback in onRecordingCompleteForStreaming
        // or could be triggered from MediaControls after this promise resolves.
        // For now, this function primarily handles stopping the local recording.
    } else {
        console.warn("No URI or stream ID available after stopping audio recording.");
    }
    // recording = null; // Moved to status update to ensure URI is processed
    return uri;
  } catch (err) {
    console.error('Failed to stop audio recording', err);
    return null;
  }
};

export const streamAudioFile = async (uri: string, streamId: string, fileNameSuffix: string = 'm4a') => {
  if (getWebSocketState() !== WebSocket.OPEN) {
    console.error('WebSocket not connected. Cannot stream audio file.');
    // Optionally, try to reconnect or queue the file.
    // For now, we just log an error.
    return false;
  }

  const metadata = {
    id: streamId,
    type: 'audio' as 'audio' | 'video',
    fileName: `audio_${streamId}.${fileNameSuffix}`, // Backend expects a filename
  };
  console.log(`Preparing to stream audio file: ${uri} with metadata:`, metadata);
  return await sendRecordedFile(metadata, uri);
};
