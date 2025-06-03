import { Camera, CameraRecordingOptions, VideoQuality } from 'expo-camera';
import { requestMediaPermissions } from './PermissionService';
import { sendRecordedFile, generateUniqueId, getWebSocketState, connectWebSocket } from './StreamingService'; // Added connectWebSocket
import * as FileSystem from 'expo-file-system';

let cameraRef: Camera | null = null;
let currentRecordingPromise: Promise<{ uri: string; } | null> | null = null;
let currentVideoStreamId: string | null = null;
let isActuallyRecording = false; // More reliable state

export const setCameraRef = (ref: Camera | null) => {
  cameraRef = ref;
};

export const startVideoRecording = async (
  onRecordingStarted: (streamId: string) => void,
  onRecordingFinishedAndSent: (uri: string | null, streamId: string | null) => void,
  onRecordingError: (error: string, streamId: string | null) => void
): Promise<boolean> => {
  if (!cameraRef) {
    console.log('Camera ref not set.');
    onRecordingError('Camera not available.', null);
    return false;
  }

  const hasPermission = await requestMediaPermissions();
  if (!hasPermission) {
    console.log('Media permissions not granted.');
    onRecordingError('Permissions not granted.', null);
    return false;
  }

  if (isActuallyRecording) {
    console.log('Video recording already in progress.');
    // onRecordingError('Recording already in progress.', currentVideoStreamId); // Optional: inform UI
    return false;
  }

  // Ensure WebSocket is connected
   if (getWebSocketState() !== WebSocket.OPEN) {
    console.log('WebSocket not connected. Attempting to connect for video streaming...');
    connectWebSocket(
        () => console.log("WebSocket connected for video streaming."),
        (err) => console.error("WebSocket connection failed for video: ", err)
    );
    // Similar to audio, recording starts even if WS is pending.
  }

  currentVideoStreamId = generateUniqueId();
  console.log(`Generated video stream ID: ${currentVideoStreamId}`);

  console.log('Attempting to start video recording...');
  try {
    const options: CameraRecordingOptions = {
      quality: VideoQuality['720p'],
      maxDuration: 600, // 10 minutes
      // onRecordingStart: () => { // This callback is sometimes unreliable or not present
      //   console.log('Expo Camera onRecordingStart triggered.');
      //   isActuallyRecording = true;
      //   onRecordingStarted(currentVideoStreamId!);
      // },
    };

    // Start recording
    currentRecordingPromise = cameraRef.recordAsync(options);
    isActuallyRecording = true; // Assume it starts, expo lacks a robust start callback
    onRecordingStarted(currentVideoStreamId!); // Notify UI immediately
    console.log('Video recording initiated with expo-camera.');

    // Wait for recording to finish (or be stopped)
    const result = await currentRecordingPromise;
    isActuallyRecording = false; // Reset state
    currentRecordingPromise = null;

    if (result && result.uri && currentVideoStreamId) {
      console.log('Video recording finished locally. URI:', result.uri);

      // Stream the file
      const metadata = {
        id: currentVideoStreamId,
        type: 'video' as 'audio' | 'video',
        // Expo Camera on iOS typically records .mov, Android .mp4.
        // The backend will receive raw bytes. '.mp4' is a common target.
        fileName: `video_${currentVideoStreamId}.mp4`,
      };
      console.log(`Preparing to stream video file: ${result.uri} with metadata:`, metadata);
      const success = await sendRecordedFile(metadata, result.uri);
      if (success) {
        console.log(`Video stream ${currentVideoStreamId} sent successfully.`);
        onRecordingFinishedAndSent(result.uri, currentVideoStreamId);
      } else {
        console.error(`Failed to stream video ${currentVideoStreamId}.`);
        onRecordingError('Failed to stream video file.', currentVideoStreamId);
        onRecordingFinishedAndSent(result.uri, currentVideoStreamId); // Still provide URI for local reference
      }
    } else {
      console.warn('Video recording finished but no URI or streamId was available.');
      onRecordingError('Recording finished but no URI available.', currentVideoStreamId);
      onRecordingFinishedAndSent(null, currentVideoStreamId);
    }
    currentVideoStreamId = null; // Clear stream ID after processing
    return true;

  } catch (e: any) {
    console.error('Failed to start or complete video recording process', e);
    isActuallyRecording = false;
    currentRecordingPromise = null;
    onRecordingError(e.message || 'Failed to start video recording.', currentVideoStreamId);
    currentVideoStreamId = null; // Clear stream ID on error
    return false;
  }
};

export const stopVideoRecording = async (): Promise<void> => {
  if (!cameraRef) {
    console.log('Camera ref not set for stopping.');
    return;
  }
  // if (!currentRecordingPromise) { // This check might be problematic if stop is called before recordAsync promise is assigned
  if (!isActuallyRecording) {
    console.log('No active video recording to stop (based on isActuallyRecording flag).');
    return;
  }

  console.log('Stopping video recording via cameraRef.stopRecording()...');
  try {
    cameraRef.stopRecording(); // This signals expo-camera to finalize the recording.
                               // The promise from recordAsync will then resolve or reject.
    // isActuallyRecording = false; // This should be set when recordAsync resolves/rejects.
    console.log('Video recording stop signal sent to expo-camera.');
  } catch (e) {
    // This catch might not be very effective if stopRecording itself is not async or doesn't throw for all errors.
    console.error('Error calling cameraRef.stopRecording() directly:', e);
    // Consider calling the onRecordingError callback if an error is reliably caught here.
  }
};

export const isVideoRecording = () => isActuallyRecording;
