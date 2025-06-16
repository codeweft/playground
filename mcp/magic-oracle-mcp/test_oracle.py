#!/usr/bin/env python3
"""
Simple test script for the Magic Oracle MCP
Quick way to test if everything is working!
"""

import asyncio
import json
import subprocess
import sys

async def test_oracle():
    print("🔮 Testing Magic 8-Ball Oracle MCP Server...")
    
    # Start the server
    server_path = input("Enter path to magic_oracle_server.py (or press Enter for ./magic_oracle_server.py): ").strip()
    if not server_path:
        server_path = "./magic_oracle_server.py"
    
    process = subprocess.Popen(
        [sys.executable, server_path],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
    )
    
    try:
        # Test 1: Initialize
        print("\n🌟 Test 1: Initializing the mystical connection...")
        init_request = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {}
        }
        
        process.stdin.write(json.dumps(init_request) + "\n")
        process.stdin.flush()
        
        response = process.stdout.readline()
        result = json.loads(response)
        print(f"✅ Server initialized: {result['result']['serverInfo']['name']}")
        
        # Test 2: List available tools
        print("\n🌟 Test 2: Discovering mystical tools...")
        tools_request = {
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/list",
            "params": {}
        }
        
        process.stdin.write(json.dumps(tools_request) + "\n")
        process.stdin.flush()
        
        response = process.stdout.readline()
        result = json.loads(response)
        tools = result['result']['tools']
        print(f"✅ Found {len(tools)} mystical tools:")
        for tool in tools:
            print(f"   🔮 {tool['name']}: {tool['description']}")
        
        # Test 3: Ask the oracle a question
        print("\n🌟 Test 3: Consulting the oracle...")
        oracle_request = {
            "jsonrpc": "2.0",
            "id": 3,
            "method": "tools/call",
            "params": {
                "name": "mystical_consultation",
                "arguments": {"question": "Will this MCP server work correctly?"}
            }
        }
        
        process.stdin.write(json.dumps(oracle_request) + "\n")
        process.stdin.flush()
        
        response = process.stdout.readline()
        result = json.loads(response)
        oracle_response = result['result']['content'][0]['text']
        print(f"✅ Oracle says:\n{oracle_response}")
        
        # Test 4: Get daily fortune
        print("\n🌟 Test 4: Getting daily fortune...")
        fortune_request = {
            "jsonrpc": "2.0",
            "id": 4,
            "method": "tools/call",
            "params": {
                "name": "daily_fortune",
                "arguments": {}
            }
        }
        
        process.stdin.write(json.dumps(fortune_request) + "\n")
        process.stdin.flush()
        
        response = process.stdout.readline()
        result = json.loads(response)
        fortune_response = result['result']['content'][0]['text']
        print(f"✅ Your fortune:\n{fortune_response}")
        
        print("\n🎉 All tests passed! Your Magic Oracle MCP is working perfectly! ✨")
        
    except Exception as e:
        print(f"❌ Test failed: {e}")
        # Check for any error output
        stderr = process.stderr.read()
        if stderr:
            print(f"Server errors: {stderr}")
    
    finally:
        process.terminate()
        process.wait()

if __name__ == "__main__":
    print("🧙‍♂️ Make sure Ollama is running with qwen2.5:3b before starting!")
    asyncio.run(test_oracle())