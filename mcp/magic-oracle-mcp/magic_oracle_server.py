#!/usr/bin/env python3
"""
Magic 8-Ball Oracle MCP Server
A fun MCP server that turns your local Qwen2.5:3b into a mystical fortune teller!
"""

import asyncio
import json
import sys
from typing import Any, Dict, List, Optional
import httpx
import random

# MCP Protocol Classes
class McpServer:
    def __init__(self):
        self.tools = {}
        self.resources = {}
        
    async def handle_request(self, request: Dict[str, Any]) -> Dict[str, Any]:
        method = request.get("method")
        params = request.get("params", {})
        
        if method == "initialize":
            return {
                "protocolVersion": "0.1.0",
                "capabilities": {
                    "tools": {"listChanged": True},
                    "resources": {"listChanged": True}
                },
                "serverInfo": {
                    "name": "magic-8ball-oracle",
                    "version": "1.0.0"
                }
            }
        
        elif method == "tools/list":
            return {"tools": list(self.tools.values())}
        
        elif method == "tools/call":
            tool_name = params.get("name")
            if tool_name in self.tools:
                return await self.call_tool(tool_name, params.get("arguments", {}))
            else:
                raise Exception(f"Unknown tool: {tool_name}")
        
        elif method == "resources/list":
            return {"resources": list(self.resources.values())}
        
        else:
            raise Exception(f"Unknown method: {method}")
    
    def add_tool(self, name: str, description: str, parameters: Dict[str, Any], handler):
        self.tools[name] = {
            "name": name,
            "description": description,
            "inputSchema": {
                "type": "object",
                "properties": parameters,
                "required": list(parameters.keys())
            }
        }
        setattr(self, f"_tool_{name}", handler)
    
    async def call_tool(self, name: str, arguments: Dict[str, Any]):
        handler = getattr(self, f"_tool_{name}")
        result = await handler(arguments)
        return {"content": [{"type": "text", "text": result}]}

class MagicOracle:
    def __init__(self, ollama_url: str = "http://localhost:11434"):
        self.ollama_url = ollama_url
        self.mystical_prefixes = [
            "🔮 The crystal ball reveals...",
            "✨ The ancient spirits whisper...",
            "🌙 The moonlight illuminates the truth...",
            "🎭 The cosmic forces align to show...",
            "🃏 The tarot cards dance and reveal...",
            "🌟 The stars have spoken...",
            "🧙‍♂️ The wise oracle proclaims...",
            "🎱 The mystical 8-ball fortune tells...",
        ]
        
        self.mystical_suffixes = [
            "...may the universe guide your path! ✨",
            "...trust in the cosmic wisdom! 🌌",
            "...the future is written in starlight! ⭐",
            "...heed this mystical counsel! 🔮",
            "...let destiny unfold as foretold! 🌙",
            "...the oracle has spoken! 🧙‍♂️",
            "...magic flows through these words! ✨",
            "...the spirits smile upon you! 👻",
        ]
    
    async def get_mystical_response(self, question: str) -> str:
        # Create a mystical prompt
        mystical_prompt = f"""
You are a mystical oracle with ancient wisdom. Someone seeks your guidance with this question: "{question}"

Respond as a wise, mystical fortune teller would - be mysterious, poetic, and slightly cryptic but still helpful. 
Use metaphors about stars, crystals, ancient wisdom, and cosmic forces. 
Keep your response to 2-3 sentences maximum.
Be encouraging and positive in your mystical wisdom.
"""
        
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{self.ollama_url}/api/generate",
                    json={
                        "model": "qwen2.5:3b",
                        "prompt": mystical_prompt,
                        "stream": False,
                        "options": {
                            "temperature": 0.8,
                            "top_p": 0.9,
                            "max_tokens": 150
                        }
                    }
                )
                
                if response.status_code == 200:
                    result = response.json()
                    oracle_response = result.get("response", "").strip()
                    
                    # Add mystical flair
                    prefix = random.choice(self.mystical_prefixes)
                    suffix = random.choice(self.mystical_suffixes)
                    
                    return f"{prefix}\n\n{oracle_response}\n\n{suffix}"
                else:
                    return "🔮 The crystal ball is cloudy... the mystical connection has been disrupted! Try again when the cosmic forces align. ✨"
                    
        except Exception as e:
            return f"🌙 The oracle's vision is obscured by cosmic interference... ({str(e)}) ✨"

async def main():
    server = McpServer()
    oracle = MagicOracle()
    
    # Add the mystical consultation tool
    server.add_tool(
        "mystical_consultation",
        "Consult the mystical oracle powered by Qwen2.5:3b for wisdom and guidance on any question",
        {
            "question": {
                "type": "string",
                "description": "The question you seek mystical guidance about"
            }
        },
        oracle.get_mystical_response
    )
    
    # Add a fortune telling tool
    async def get_daily_fortune(args):
        fortune_question = f"What does the day hold for someone seeking guidance? Give them a daily fortune and advice."
        return await oracle.get_mystical_response(fortune_question)
    
    server.add_tool(
        "daily_fortune",
        "Receive your mystical daily fortune from the oracle",
        {},
        get_daily_fortune
    )
    
    # Add a dream interpretation tool
    async def interpret_dream(args):
        dream = args.get("dream", "")
        dream_question = f"Someone had this dream: '{dream}'. What mystical meaning does this dream hold?"
        return await oracle.get_mystical_response(dream_question)
    
    server.add_tool(
        "dream_interpretation",
        "Get mystical interpretation of your dreams",
        {
            "dream": {
                "type": "string", 
                "description": "Description of the dream to interpret"
            }
        },
        interpret_dream
    )
    
    print("🔮 Magic 8-Ball Oracle MCP Server starting...", file=sys.stderr)
    print("✨ Connecting to the mystical realm via Qwen2.5:3b...", file=sys.stderr)
    
    # Simple JSON-RPC over stdio
    while True:
        try:
            line = input()
            if not line:
                continue
                
            request = json.loads(line)
            response = await server.handle_request(request)
            
            result = {
                "jsonrpc": "2.0",
                "id": request.get("id"),
                "result": response
            }
            
            print(json.dumps(result, ensure_ascii=False))
            sys.stdout.flush()
            
        except EOFError:
            break
        except Exception as e:
            error_response = {
                "jsonrpc": "2.0", 
                "id": request.get("id") if 'request' in locals() else None,
                "error": {"code": -1, "message": str(e)}
            }
            print(json.dumps(error_response))
            sys.stdout.flush()

if __name__ == "__main__":
    asyncio.run(main())