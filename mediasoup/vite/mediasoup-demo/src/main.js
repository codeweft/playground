import * as mediasoupClient from 'mediasoup-client';

const ws = new WebSocket('ws://localhost:3000');

let device;
let sendTransport;
let recvTransport;

const localVideo = document.createElement('video');
localVideo.autoplay = true;
localVideo.muted = true;
localVideo.playsInline = true;
document.body.appendChild(localVideo);

const remoteVideo = document.createElement('video');
remoteVideo.autoplay = true;
remoteVideo.playsInline = true;
document.body.appendChild(remoteVideo);

ws.onopen = () => {
  console.log('✅ WebSocket connected to signaling server');
  ws.send(JSON.stringify({ action: 'getRtpCapabilities' }));
};

ws.onmessage = async (message) => {
  const { action, data } = JSON.parse(message.data);

  switch (action) {
    case 'rtpCapabilities':
      device = new mediasoupClient.Device();
      await device.load({ routerRtpCapabilities: data });
      ws.send(JSON.stringify({ action: 'createTransport' }));
      break;

    case 'transportCreated':
      if (!sendTransport) {
        sendTransport = device.createSendTransport(data);

        sendTransport.on('connect', ({ dtlsParameters }, callback) => {
          ws.send(JSON.stringify({
            action: 'connectTransport',
            data: { transportId: sendTransport.id, dtlsParameters }
          }));
          callback();
        });

        sendTransport.on('produce', ({ kind, rtpParameters }, callback) => {
          ws.send(JSON.stringify({
            action: 'produce',
            data: { transportId: sendTransport.id, kind, rtpParameters }
          }));
          callback();
        });

        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
          localVideo.srcObject = stream;

          const audioTrack = stream.getAudioTracks()[0];
          const videoTrack = stream.getVideoTracks()[0];

          await sendTransport.produce({ track: audioTrack });
          await sendTransport.produce({ track: videoTrack });

          ws.send(JSON.stringify({ action: 'createTransport' })); // For receiving
        } catch (err) {
          console.error('❌ getUserMedia failed:', err);
        }
      } else {
        // Receive transport
        recvTransport = device.createRecvTransport(data);

        recvTransport.on('connect', ({ dtlsParameters }, callback) => {
          ws.send(JSON.stringify({
            action: 'connectTransport',
            data: { transportId: recvTransport.id, dtlsParameters }
          }));
          callback();
        });

        ws.send(JSON.stringify({
          action: 'consume',
          data: {
            transportId: recvTransport.id,
            rtpCapabilities: device.rtpCapabilities,
            kind: 'video'
          }
        }));
      }
      break;

    case 'consumed':
      const consumer = await recvTransport.consume({
        id: data.id,
        producerId: data.producerId,
        kind: data.kind,
        rtpParameters: data.rtpParameters,
      });

      const remoteStream = new MediaStream([consumer.track]);
      remoteVideo.srcObject = remoteStream;
      break;

    default:
      console.warn('⚠️ Unknown action from server:', action);
  }
};
