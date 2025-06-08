// server.js
const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8080 });

// Store connected clients
let clients = [];

console.log('Signaling server started on ws://192.168.1.108:8080');

wss.on('connection', (ws) => {
    const clientId = clients.length; // Simple ID assignment
    clients.push(ws);
    console.log(`Client ${clientId} connected`);

    ws.on('message', (message) => {
        // Broadcast the message to the other client
        // This simple server assumes only two clients for a call
        clients.forEach((client, index) => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
                try {
                    // Try to parse the message to see if it's a stringified JSON
                    const parsedMessage = JSON.parse(message);
                    console.log(`Relaying message from client ${clientId} to client ${index}:`, parsedMessage);
                    client.send(message.toString()); // Send as string
                } catch (error) {
                    // If it's not JSON, or some other error, send as is
                    console.log(`Relaying raw message from client ${clientId} to client ${index}:`, message.toString());
                    client.send(message.toString());
                }
            }
        });
    });

    ws.on('close', () => {
        clients = clients.filter(client => client !== ws);
        console.log(`Client ${clientId} disconnected`);
        // Simple cleanup: if one client disconnects, we might want to notify the other
        // or prepare for a new session by clearing clients if the array is empty.
        if (clients.length === 1) {
            console.log("One client remaining, waiting for another connection or for the remaining client to disconnect.");
        } else if (clients.length === 0) {
            console.log("All clients disconnected. Server is idle.");
        }
    });

    ws.on('error', (error) => {
        console.error(`Error for client ${clientId}:`, error);
    });

    if (clients.length > 2) {
        // Basic handling for more than 2 clients - could be more sophisticated
        console.log("More than 2 clients connected. This demo is designed for 2 peers.");
        // Optionally, you could close the connection or send a message
        // ws.send(JSON.stringify({ type: 'error', message: 'Server full' }));
        // ws.close();
    }
});

// Periodically clean up dead connections (optional, ws handles most of this)
setInterval(() => {
    clients = clients.filter(client => client.readyState === WebSocket.OPEN);
}, 10000);
