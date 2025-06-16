#!/usr/bin/env python3
from flask import Flask, render_template, request, jsonify
import subprocess
import json
import sys
import threading
import queue
import time

app = Flask(__name__)

class WebJokeClient:
    def __init__(self):
        self.process = None
        self.request_id = 0
        self.start_server()
    
    def start_server(self):
        self.process = subprocess.Popen([
            sys.executable, 'joke_server.py'
        ], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        
        # Initialize
        self.send_request({
            "jsonrpc": "2.0",
            "id": self.get_next_id(),
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "web-joke-client", "version": "1.0.0"}
            }
        })
    
    def get_next_id(self):
        self.request_id += 1
        return self.request_id
    
    def send_request(self, request):
        request_json = json.dumps(request) + '\n'
        self.process.stdin.write(request_json)
        self.process.stdin.flush()
        
        response_line = self.process.stdout.readline()
        return json.loads(response_line)
    
    def call_tool(self, tool_name, arguments):
        request = {
            "jsonrpc": "2.0",
            "id": self.get_next_id(),
            "method": "tools/call",
            "params": {
                "name": tool_name,
                "arguments": arguments
            }
        }
        
        response = self.send_request(request)
        return response.get('result', {}).get('content', [{}])[0].get('text', 'No response')

# Global client instance
joke_client = WebJokeClient()

@app.route('/')
def index():
    return '''
    <!DOCTYPE html>
    <html>
    <head>
        <title>🎭 Joke MCP Server</title>
        <style>
            body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
            .joke-container { background: #f0f0f0; padding: 20px; margin: 20px 0; border-radius: 10px; }
            button { padding: 10px 20px; margin: 5px; cursor: pointer; }
            select { padding: 5px; margin: 5px; }
        </style>
    </head>
    <body>
        <h1>🎭 Local Joke MCP Server</h1>
        <p>Powered by Qwen2.5:3b running locally!</p>
        
        <div>
            <label>Category:</label>
            <select id="category">
                <option value="random">Random</option>
                <option value="dad">Dad Jokes</option>
                <option value="programming">Programming</option>
                <option value="pun">Puns</option>
                <option value="knock-knock">Knock-Knock</option>
                <option value="one-liner">One-Liners</option>
            </select>
            <button onclick="getJoke()">Tell me a joke!</button>
            <button onclick="jokeBattle()">Joke Battle!</button>
        </div>
        
        <div id="result" class="joke-container" style="display:none;"></div>
        
        <script>
            async function getJoke() {
                const category = document.getElementById('category').value;
                const response = await fetch('/joke', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({category: category})
                });
                const data = await response.json();
                document.getElementById('result').innerHTML = data.joke.replace(/\\n/g, '<br>');
                document.getElementById('result').style.display = 'block';
            }
            
            async function jokeBattle() {
                const category = document.getElementById('category').value;
                const response = await fetch('/battle', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({category: category, count: 3})
                });
                const data = await response.json();
                document.getElementById('result').innerHTML = data.battle.replace(/\\n/g, '<br>');
                document.getElementById('result').style.display = 'block';
            }
        </script>
    </body>
    </html>
    '''

@app.route('/joke', methods=['POST'])
def get_joke():
    data = request.json
    category = data.get('category', 'random')
    joke = joke_client.call_tool('tell_joke', {'category': category})
    return jsonify({'joke': joke})

@app.route('/battle', methods=['POST'])
def joke_battle():
    data = request.json
    category = data.get('category', 'random')
    count = data.get('count', 3)
    battle = joke_client.call_tool('joke_battle', {'category': category, 'count': count})
    return jsonify({'battle': battle})

if __name__ == '__main__':
    print("🌐 Starting web interface on http://localhost:5000")
    app.run(debug=True, host='0.0.0.0', port=5000)