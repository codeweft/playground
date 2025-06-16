#!/usr/bin/env python3
import asyncio
import json
import subprocess
import sys

async def test_mcp_server():
    """Simple test client for the joke MCP server"""
    
    # Start the MCP server as subprocess
    process = subprocess.Popen([
        sys.executable, './joke_server.py'
    ], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    
    def send_request(request):
        """Send JSON-RPC request to MCP server"""
        request_json = json.dumps(request) + '\n'
        process.stdin.write(request_json)
        process.stdin.flush()
        
        # Read response
        response_line = process.stdout.readline()
        return json.loads(response_line)
    
    try:
        # Initialize
        init_request = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "test-client", "version": "1.0.0"}
            }
        }
        
        print("🔧 Initializing MCP server...")
        init_response = send_request(init_request)
        print(f"✅ Server initialized: {init_response.get('result', {}).get('serverInfo', {}).get('name', 'Unknown')}")
        
        # List available tools
        tools_request = {
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/list",
            "params": {}
        }
        
        print("\n📋 Available tools:")
        tools_response = send_request(tools_request)
        for tool in tools_response.get('result', {}).get('tools', []):
            print(f"  • {tool['name']}: {tool['description']}")
        
        # Tell a dad joke
        joke_request = {
            "jsonrpc": "2.0",
            "id": 3,
            "method": "tools/call",
            "params": {
                "name": "tell_joke",
                "arguments": {"category": "dad"}
            }
        }
        
        print("\n🎭 Getting a dad joke...")
        joke_response = send_request(joke_request)
        joke_content = joke_response.get('result', {}).get('content', [{}])[0].get('text', 'No joke returned')
        print(joke_content)
        
        # Joke battle
        battle_request = {
            "jsonrpc": "2.0",
            "id": 4,
            "method": "tools/call",
            "params": {
                "name": "joke_battle",
                "arguments": {"category": "programming", "count": 3}
            }
        }
        
        print("\n🥊 Starting joke battle...")
        battle_response = send_request(battle_request)
        battle_content = battle_response.get('result', {}).get('content', [{}])[0].get('text', 'No battle returned')
        print(battle_content)
        
    except Exception as e:
        print(f"❌ Error: {e}")
    finally:
        process.terminate()

if __name__ == "__main__":
    asyncio.run(test_mcp_server())