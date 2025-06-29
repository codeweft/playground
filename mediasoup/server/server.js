const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const mediasoup = require('mediasoup');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let worker;
let router;
let transports = new Map(); // Map by ws + transport id
let producers = new Map();  // Map by ws + producer id
let consumers = new Map();  // Map by ws + consumer id

const mediaCodecs = [
  {
    kind: "audio",
    mimeType: "audio/opus",
    clockRate: 48000,
    channels: 2,
  },
  {
    kind: "video",
    mimeType: "video/VP8",
    clockRate: 90000,
    parameters: { "x-google-start-bitrate": 1000 },
  },
];

async function startMediasoup() {
  worker = await mediasoup.createWorker();
  router = await worker.createRouter({ mediaCodecs });
  console.log("Mediasoup worker and router created");
}

wss.on('connection', (ws) => {
  console.log("Client connected");

  ws.transports = new Map();
  ws.producers = new Map();
  ws.consumers = new Map();

  ws.on('message', async (message) => {
    const msg = JSON.parse(message);
    const { action, data } = msg;

    try {
      switch (action) {
        case 'getRtpCapabilities':
          ws.send(JSON.stringify({ action: 'rtpCapabilities', data: router.rtpCapabilities }));
          break;

        case 'createTransport':
          {
            const transport = await router.createWebRtcTransport({
              listenIps: [{ ip: '0.0.0.0', announcedIp: null }],
              enableUdp: true,
              enableTcp: true,
              preferUdp: true,
            });

            ws.transports.set(transport.id, transport);

            ws.send(JSON.stringify({
              action: 'transportCreated',
              data: {
                id: transport.id,
                iceParameters: transport.iceParameters,
                iceCandidates: transport.iceCandidates,
                dtlsParameters: transport.dtlsParameters,
              },
            }));

            transport.on('dtlsstatechange', (dtlsState) => {
              if (dtlsState === 'closed') {
                console.log('Transport closed');
                transport.close();
                ws.transports.delete(transport.id);
              }
            });
          }
          break;

        case 'connectTransport':
          {
            const transport = ws.transports.get(data.transportId);
            if (!transport) throw new Error('Transport not found');
            await transport.connect({ dtlsParameters: data.dtlsParameters });
            ws.send(JSON.stringify({ action: 'transportConnected' }));
          }
          break;

        case 'produce':
          {
            const transport = ws.transports.get(data.transportId);
            if (!transport) throw new Error('Transport not found');

            const producer = await transport.produce({
              kind: data.kind,
              rtpParameters: data.rtpParameters,
            });

            ws.producers.set(producer.id, producer);

            ws.send(JSON.stringify({ action: 'produced', data: { id: producer.id } }));
          }
          break;

        case 'consume':
          {
            const transport = ws.transports.get(data.transportId);
            if (!transport) throw new Error('Transport not found');

            // Find a producer with the requested kind
            const producer = Array.from(ws.producers.values()).find(p => p.kind === data.kind);
            if (!producer) {
              ws.send(JSON.stringify({ action: 'error', data: 'Producer not found' }));
              return;
            }

            const consumer = await transport.consume({
              producerId: producer.id,
              rtpCapabilities: data.rtpCapabilities,
              paused: false,
            });

            ws.consumers.set(consumer.id, consumer);

            ws.send(JSON.stringify({
              action: 'consumed',
              data: {
                id: consumer.id,
                producerId: producer.id,
                kind: consumer.kind,
                rtpParameters: consumer.rtpParameters,
              },
            }));
          }
          break;
      }
    } catch (err) {
      console.error(err);
      ws.send(JSON.stringify({ action: 'error', data: err.message }));
    }
  });

  ws.on('close', () => {
    console.log("Client disconnected");
    // Cleanup all transports/producers/consumers related to this client
    ws.transports.forEach(t => t.close());
    ws.producers.forEach(p => p.close());
    ws.consumers.forEach(c => c.close());
  });
});

startMediasoup().then(() => {
  server.listen(3000, () => {
    console.log('Server running on http://192.168.1.116:3000');
  });
});
