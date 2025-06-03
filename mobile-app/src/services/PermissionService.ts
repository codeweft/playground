import { Camera } from 'expo-camera';
import { Audio } from 'expo-av';

export const requestCameraPermissions = async (): Promise<boolean> => {
  const { status } = await Camera.requestCameraPermissionsAsync();
  if (status !== 'granted') {
    alert('Sorry, we need camera permissions to make this work!');
    return false;
  }
  return true;
};

export const requestMicrophonePermissions = async (): Promise<boolean> => {
  const { status } = await Audio.requestPermissionsAsync(); // expo-av handles microphone perms
  if (status !== 'granted') {
    alert('Sorry, we need microphone permissions to make this work!');
    return false;
  }
  return true;
};

export const requestMediaPermissions = async (): Promise<boolean> => {
  const cameraPermission = await requestCameraPermissions();
  if (!cameraPermission) return false;
  const microphonePermission = await requestMicrophonePermissions();
  if (!microphonePermission) return false;
  return true;
};
