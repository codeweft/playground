#!/usr/bin/env python3
"""
Standalone client for the Magic 8-Ball Oracle MCP Server
Run this to chat with your mystical oracle directly!
"""

import asyncio
import json
import subprocess
import sys
from typing import Optional

class MagicOracleClient:
    def __init__(self, server_script_path: str):
        self.server_script_path = server_script_path
        self.process: Optional[subprocess.Popen] = None
        
    async def start_server(self):
        """Start the MCP server process"""
        self.process = subprocess.Popen(
            [sys.executable, self.server_script_path],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=0
        )
        
        # Initialize the server
        init_request = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {}
        }
        
        await self.send_request(init_request)
        print("🔮 Oracle awakened and ready for consultations!\n")
    
    async def send_request(self, request: dict) -> dict:
        """Send a request to the MCP server and get response"""
        if not self.process:
            raise Exception("Server not started")
            
        # Send request
        request_line = json.dumps(request) + "\n"
        self.process.stdin.write(request_line)
        self.process.stdin.flush()
        
        # Read response
        response_line = self.process.stdout.readline()
        if not response_line:
            raise Exception("No response from server")
            
        return json.loads(response_line.strip())
    
    async def ask_oracle(self, question: str) -> str:
        """Ask the mystical oracle a question"""
        request = {
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/call",
            "params": {
                "name": "mystical_consultation",
                "arguments": {"question": question}
            }
        }
        
        response = await self.send_request(request)
        if "result" in response and "content" in response["result"]:
            return response["result"]["content"][0]["text"]
        else:
            return "🌙 The cosmic forces are misaligned... try again! ✨"
    
    async def get_daily_fortune(self) -> str:
        """Get daily fortune from the oracle"""
        request = {
            "jsonrpc": "2.0",
            "id": 3,
            "method": "tools/call",
            "params": {
                "name": "daily_fortune",
                "arguments": {}
            }
        }
        
        response = await self.send_request(request)
        if "result" in response and "content" in response["result"]:
            return response["result"]["content"][0]["text"]
        else:
            return "🌙 The stars are shy today... try again later! ✨"
    
    async def interpret_dream(self, dream: str) -> str:
        """Get dream interpretation from the oracle"""
        request = {
            "jsonrpc": "2.0",
            "id": 4,
            "method": "tools/call",
            "params": {
                "name": "dream_interpretation",
                "arguments": {"dream": dream}
            }
        }
        
        response = await self.send_request(request)
        if "result" in response and "content" in response["result"]:
            return response["result"]["content"][0]["text"]
        else:
            return "🌙 The dream realm is clouded... describe your vision again! ✨"
    
    def stop_server(self):
        """Stop the MCP server"""
        if self.process:
            self.process.terminate()
            self.process.wait()

async def interactive_session():
    """Run an interactive session with the Magic Oracle"""
    print("🔮✨ Welcome to the Magic 8-Ball Oracle! ✨🔮")
    print("🧙‍♂️ Your mystical AI companion powered by Qwen2.5:3b")
    print("\nMake sure Ollama is running with qwen2.5:3b model!")
    
    # Get server script path
    server_path = input("\n📜 Enter path to magic_oracle_server.py: ").strip()
    if not server_path:
        server_path = "./magic_oracle_server.py"
    
    client = MagicOracleClient(server_path)
    
    try:
        print("\n🌟 Starting the mystical connection...")
        await client.start_server()
        
        print("Commands:")
        print("  'ask [question]' - Consult the oracle")
        print("  'fortune' - Get daily fortune")
        print("  'dream [description]' - Interpret a dream")
        print("  'quit' - Exit the mystical realm")
        print("  'help' - Show this help\n")
        
        while True:
            try:
                user_input = input("🔮 Your mystical query: ").strip()
                
                if not user_input:
                    continue
                
                if user_input.lower() in ['quit', 'exit', 'bye']:
                    print("🌙 The oracle retreats to the cosmic realm... farewell! ✨")
                    break
                
                elif user_input.lower() == 'help':
                    print("\n🧙‍♂️ Mystical Commands:")
                    print("  ask [question] - e.g., 'ask Will I be successful?'")
                    print("  fortune - Get your daily mystical fortune")
                    print("  dream [description] - e.g., 'dream I was flying over mountains'")
                    print("  quit - Leave the mystical realm\n")
                
                elif user_input.lower() == 'fortune':
                    print("\n🌟 Consulting the cosmic forces for your daily fortune...")
                    result = await client.get_daily_fortune()
                    print(f"\n{result}\n")
                
                elif user_input.lower().startswith('ask '):
                    question = user_input[4:].strip()
                    if question:
                        print(f"\n🔮 Consulting the oracle about: '{question}'...")
                        result = await client.ask_oracle(question)
                        print(f"\n{result}\n")
                    else:
                        print("🌙 The oracle needs a question to ponder! Try 'ask [your question]'")
                
                elif user_input.lower().startswith('dream '):
                    dream = user_input[6:].strip()
                    if dream:
                        print(f"\n🌙 Interpreting your mystical dream vision...")
                        result = await client.interpret_dream(dream)
                        print(f"\n{result}\n")
                    else:
                        print("🌙 Describe your dream for mystical interpretation! Try 'dream [description]'")
                
                else:
                    print("🧙‍♂️ Unknown mystical command! Type 'help' for guidance or 'ask [question]' to consult the oracle.")
                    
            except KeyboardInterrupt:
                print("\n🌙 The mystical session has been interrupted... farewell! ✨")
                break
            except Exception as e:
                print(f"🌟 Mystical error: {e}")
                print("The cosmic forces are unstable... try again!")
    
    finally:
        client.stop_server()

if __name__ == "__main__":
    asyncio.run(interactive_session())