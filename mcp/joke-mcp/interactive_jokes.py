#!/usr/bin/env python3
import asyncio
import json
import subprocess
import sys

class JokeClient:
    def __init__(self):
        self.process = None
        self.request_id = 0
    
    def start_server(self):
        """Start the MCP server process"""
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
                "clientInfo": {"name": "interactive-joke-client", "version": "1.0.0"}
            }
        })
    
    def get_next_id(self):
        self.request_id += 1
        return self.request_id
    
    def send_request(self, request):
        """Send request and get response"""
        request_json = json.dumps(request) + '\n'
        self.process.stdin.write(request_json)
        self.process.stdin.flush()
        
        response_line = self.process.stdout.readline()
        return json.loads(response_line)
    
    def tell_joke(self, category="random"):
        """Get a joke"""
        request = {
            "jsonrpc": "2.0",
            "id": self.get_next_id(),
            "method": "tools/call",
            "params": {
                "name": "tell_joke",
                "arguments": {"category": category}
            }
        }
        
        response = self.send_request(request)
        return response.get('result', {}).get('content', [{}])[0].get('text', 'No joke returned')
    
    def joke_battle(self, category="random", count=3):
        """Start a joke battle"""
        request = {
            "jsonrpc": "2.0",
            "id": self.get_next_id(),
            "method": "tools/call",
            "params": {
                "name": "joke_battle",
                "arguments": {"category": category, "count": count}
            }
        }
        
        response = self.send_request(request)
        return response.get('result', {}).get('content', [{}])[0].get('text', 'No battle returned')
    
    def explain_joke(self, joke):
        """Explain a joke"""
        request = {
            "jsonrpc": "2.0",
            "id": self.get_next_id(),
            "method": "tools/call",
            "params": {
                "name": "explain_joke",
                "arguments": {"joke": joke}
            }
        }
        
        response = self.send_request(request)
        return response.get('result', {}).get('content', [{}])[0].get('text', 'No explanation returned')
    
    def close(self):
        if self.process:
            self.process.terminate()

async def interactive_session():
    client = JokeClient()
    client.start_server()
    
    print("🎭 Welcome to the Interactive Joke Session!")
    print("Commands: joke <category>, battle <category>, explain <joke>, quit")
    print("Categories: dad, programming, random, pun, knock-knock, one-liner")
    print()
    
    try:
        while True:
            command = input("🎪 Enter command: ").strip()
            
            if command.lower() in ['quit', 'exit', 'q']:
                break
            
            elif command.startswith('joke '):
                category = command[5:].strip()
                if not category:
                    category = "random"
                print(client.tell_joke(category))
                print()
            
            elif command.startswith('battle '):
                category = command[7:].strip()
                if not category:
                    category = "random"
                print(client.joke_battle(category))
                print()
            
            elif command.startswith('explain '):
                joke = command[8:].strip()
                if joke:
                    print(client.explain_joke(joke))
                else:
                    print("Please provide a joke to explain!")
                print()
            
            elif command == 'joke':
                print(client.tell_joke())
                print()
            
            else:
                print("Available commands:")
                print("  joke [category] - Get a joke")
                print("  battle [category] - Joke battle")
                print("  explain <joke> - Explain a joke")
                print("  quit - Exit")
                print()
    
    except KeyboardInterrupt:
        print("\n👋 Thanks for the laughs!")
    finally:
        client.close()

if __name__ == "__main__":
    asyncio.run(interactive_session())