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


npx http-server