# Simple WebRTC Video Call Demo

This project demonstrates a simple one-to-one video call using WebRTC and WebSockets for signaling.

## Features
- Establishes a direct peer-to-peer video and audio call.
- Uses a Node.js WebSocket server for signaling (exchanging metadata to set up the call).
- Basic UI with local and remote video feeds, start, and hang-up buttons.

## Prerequisites
- A modern web browser that supports WebRTC (e.g., Chrome, Firefox, Safari, Edge).
- Node.js and npm (Node Package Manager) installed on your system to run the signaling server. You can download them from [https://nodejs.org/](https://nodejs.org/).
- Two devices or two browser tabs/windows to act as the two peers in the call.
- A working webcam and microphone.

## Setup and Running the Demo

1.  **Clone or Download the Code:**
    If you have git, clone the repository. Otherwise, download the `index.html`, `style.css`, `script.js`, and `server.js` files into a single directory on your computer.

2.  **Install Dependencies for the Signaling Server:**
    Open your terminal or command prompt, navigate to the directory where you saved the files, and install the `ws` (WebSocket) library:
    ```bash
    npm install ws
    ```

3.  **Start the Signaling Server:**
    In the same terminal, run the `server.js` file using Node.js:
    ```bash
    node server.js
    ```
    You should see a message like `Signaling server started on ws://localhost:8080`. Keep this terminal window open.

4.  **Open the Application in Browsers (Peer 1):**
    Open the `index.html` file in your first web browser tab or window.
    - Your browser will likely ask for permission to access your camera and microphone. Allow access.
    - You should see your local video feed. The "Start Call" button should be enabled once the WebSocket connection to the server is made.

5.  **Open the Application in Browsers (Peer 2):**
    Open the `index.html` file in a second browser tab or window (this can be on the same computer or a different computer on the same network if you've configured your server and firewall accordingly - for this local demo, same computer is easiest).
    - Allow camera and microphone access for this peer as well.
    - Its "Start Call" button should also be enabled.

6.  **Initiate the Call:**
    - Click the "Start Call" button in **one** of the browser windows.
    - This peer will send an "offer" to the other peer via the signaling server.
    - The second peer will automatically process the offer, send an "answer," and the video call should establish.
    - You should see the remote video from the other peer appear in the `remoteVideo` element.

7.  **During the Call:**
    - Both peers should see each other's video.
    - Audio should also be transmitted.

8.  **End the Call:**
    - Either peer can click the "Hang Up" button to terminate the call.
    - The video elements will clear, and resources will be released.

## How it Works (Briefly)
-   **`index.html`**: Provides the structure for the webpage, including video elements and buttons.
-   **`style.css`**: Adds basic styling to make the page presentable.
-   **`script.js`**: Contains the client-side JavaScript that handles:
    -   Accessing the user's camera/microphone (`getUserMedia`).
    -   Establishing a WebSocket connection to the signaling server (`server.js`).
    -   Using `RTCPeerConnection` to manage the WebRTC session.
    -   Creating and exchanging SDP (Session Description Protocol) offers/answers for call setup.
    -   Exchanging ICE (Interactive Connectivity Establishment) candidates to find the best path for media.
    -   Displaying local and remote video streams.
-   **`server.js`**: A simple Node.js WebSocket server that relays signaling messages (offers, answers, ICE candidates) between the two connected clients. It doesn't process or understand the WebRTC messages themselves; it just acts as a temporary message broker.

## Notes
-   This is a very basic demo. For production applications, you'd need a more robust signaling server, error handling, user management, STUN/TURN server configurations for NAT traversal, etc.
-   The `ws://localhost:8080` URL in `script.js` assumes the signaling server is running on the same machine as the browser. If you run the server on a different machine, you'll need to change this URL to the server's IP address or hostname.
-   For testing on different devices on the same network, ensure your firewall allows connections to port 8080 on the machine running the server.

---

## Expo React Native Mobile App (`expo-webrtc-app`)

This project now includes a React Native mobile application built with Expo, capable of making video calls using `react-native-webrtc`. It can interact with the same signaling server and potentially with the web version of the application.

### Prerequisites for Mobile App
- All prerequisites for the web version (especially the running signaling server: `node server.js`).
- Node.js and npm/yarn.
- Expo CLI: Install it globally if you haven't already: `npm install -g expo-cli`.
- A mobile device (Android or iOS) with the Expo Go app installed, or an Android Emulator/iOS Simulator set up on your development machine.
- Ensure your mobile device/emulator can access the signaling server running on `localhost:8080`.
    - For physical devices: Ensure your computer and mobile device are on the **same Wi-Fi network**. The `SERVER_URL` in `expo-webrtc-app/App.js` is set to `ws://localhost:8080`. You might need to change `localhost` to your computer's local IP address (e.g., `ws://192.168.1.10:8080`). Find your computer's IP address using `ipconfig` (Windows) or `ifconfig`/`ip addr` (macOS/Linux).
    - For emulators/simulators: `localhost` usually works fine if the server is also running on your development machine.

### Setup and Running the Expo App

1.  **Navigate to the Expo App Directory:**
    Open your terminal and navigate into the `expo-webrtc-app` directory:
    ```bash
    cd expo-webrtc-app
    ```

2.  **Install Dependencies (if not already done):**
    If you haven't run `npm install` or `yarn install` inside this directory yet, do so:
    ```bash
    npm install
    # or
    # yarn install
    ```

3.  **Start the Expo Development Server:**
    ```bash
    npx expo start
    # or
    # expo start
    ```
    This will start the Metro bundler and show a QR code in the terminal.

4.  **Run on a Device or Simulator:**
    -   **Using Expo Go on a physical device:**
        -   Install the Expo Go app on your iOS or Android device.
        -   Scan the QR code shown in the terminal using the Expo Go app.
    -   **Using an Android Emulator:**
        -   Make sure your Android Emulator is running.
        -   Press `a` in the terminal where Expo is running.
    -   **Using an iOS Simulator:**
        -   Make sure your iOS Simulator is running (macOS only).
        -   Press `i` in the terminal where Expo is running.

5.  **Permissions:**
    -   The app will request Camera and Microphone permissions when you attempt to start a call (or on load for Android). Please grant these permissions.
    -   For iOS, ensure you have added `NSCameraUsageDescription` and `NSMicrophoneUsageDescription` to your `expo-webrtc-app/app.json` under the `ios.infoPlist` key if you intend to build a standalone app. Expo Go usually handles this, but for builds:
      ```json
      // In expo-webrtc-app/app.json
      {
        "expo": {
          // ... other expo config
          "ios": {
            "infoPlist": {
              "NSCameraUsageDescription": "This app uses the camera for video calls.",
              "NSMicrophoneUsageDescription": "This app uses the microphone for video calls."
            }
          }
        }
      }
      ```

6.  **Using the App:**
    -   Once the app loads, it will attempt to connect to the signaling server (`ws://localhost:8080` or your IP).
    -   The UI is similar to the web version:
        -   You'll see a "Local Video" placeholder and a "Remote Video" placeholder.
        -   A "Start Call" button (enabled once connected to the server).
    -   To make a call:
        -   Ensure the signaling server (`node server.js` in the root directory) is running.
        -   Open the app on two devices/emulators (or one instance of the app and one instance of the web client).
        -   Press "Start Call" on one of the clients. This client will make an offer.
        -   The other client should automatically receive the offer and send an answer.
        -   The video call should establish.
        -   Press "Hang Up" to end the call.

### Interoperability with Web Client
- The Expo app and the web client (`index.html`) are designed to be interoperable as they use the same signaling server and message format.
- You can test a call between a user on the web application and a user on the Expo mobile app.
- **Important for IP Configuration:** If testing between a physical mobile device and a web browser on your computer, ensure the `SERVER_URL` in `expo-webrtc-app/App.js` is set to your computer's actual IP address on the local network, not `localhost`. The web client uses `localhost` which is fine when it's on the same machine as the server.
