#!/usr/bin/env python3
"""
Joke MCP Server - A fun MCP server that tells jokes using local Qwen2.5:3b
"""

import asyncio
import json
import logging
from typing import Any, Dict, List, Optional
import httpx
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import (
    Resource,
    Tool,
    TextContent,
    CallToolResult,
    ListResourcesResult,
    ListToolsResult,
    ReadResourceResult,
)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Ollama API configuration
OLLAMA_BASE_URL = "http://localhost:11434"
MODEL_NAME = "qwen2.5:3b"

class JokeMCPServer:
    def __init__(self):
        self.server = Server("joke-mcp-server")
        self.setup_handlers()
        
        # Joke categories and prompts
        self.joke_categories = {
            "dad": "Tell me a classic dad joke. Keep it clean and punny.",
            "programming": "Tell me a programming or tech joke. Make it relatable to developers.",
            "random": "Tell me a random clean joke. Make it funny and appropriate for all ages.",
            "pun": "Tell me a pun joke. Make it clever and groan-worthy.",
            "knock-knock": "Tell me a knock-knock joke. Follow the classic format.",
            "one-liner": "Tell me a short one-liner joke. Make it snappy and witty."
        }

    def setup_handlers(self):
        @self.server.list_resources()
        async def list_resources() -> ListResourcesResult:
            """List available joke resources"""
            resources = []
            for category in self.joke_categories.keys():
                resources.append(
                    Resource(
                        uri=f"joke://{category}",
                        name=f"{category.title()} Jokes",
                        mimeType="text/plain",
                        description=f"Get {category} jokes from local Qwen2.5:3b model"
                    )
                )
            
            return ListResourcesResult(resources=resources)

        @self.server.read_resource()
        async def read_resource(uri: str) -> ReadResourceResult:
            """Read a joke resource"""
            if not uri.startswith("joke://"):
                raise ValueError(f"Unsupported URI scheme: {uri}")
            
            category = uri.replace("joke://", "")
            if category not in self.joke_categories:
                raise ValueError(f"Unknown joke category: {category}")
            
            joke = await self.generate_joke(category)
            return ReadResourceResult(
                contents=[TextContent(type="text", text=joke)]
            )

        @self.server.list_tools()
        async def list_tools() -> ListToolsResult:
            """List available joke tools"""
            return ListToolsResult(
                tools=[
                    Tool(
                        name="tell_joke",
                        description="Tell a joke in a specific category using local Qwen2.5:3b",
                        inputSchema={
                            "type": "object",
                            "properties": {
                                "category": {
                                    "type": "string",
                                    "enum": list(self.joke_categories.keys()),
                                    "description": "The category of joke to tell"
                                },
                                "custom_prompt": {
                                    "type": "string",
                                    "description": "Optional custom prompt for joke generation"
                                }
                            },
                            "required": ["category"]
                        }
                    ),
                    Tool(
                        name="joke_battle",
                        description="Generate multiple jokes and let you pick the best one",
                        inputSchema={
                            "type": "object",
                            "properties": {
                                "category": {
                                    "type": "string",
                                    "enum": list(self.joke_categories.keys()),
                                    "description": "The category of jokes for the battle"
                                },
                                "count": {
                                    "type": "integer",
                                    "minimum": 2,
                                    "maximum": 5,
                                    "default": 3,
                                    "description": "Number of jokes to generate (2-5)"
                                }
                            },
                            "required": ["category"]
                        }
                    ),
                    Tool(
                        name="explain_joke",
                        description="Have the AI explain why a joke is funny",
                        inputSchema={
                            "type": "object",
                            "properties": {
                                "joke": {
                                    "type": "string",
                                    "description": "The joke to explain"
                                }
                            },
                            "required": ["joke"]
                        }
                    )
                ]
            )

        @self.server.call_tool()
        async def call_tool(name: str, arguments: Dict[str, Any]) -> CallToolResult:
            """Handle tool calls"""
            try:
                if name == "tell_joke":
                    category = arguments.get("category", "random")
                    custom_prompt = arguments.get("custom_prompt")
                    
                    if custom_prompt:
                        joke = await self.generate_custom_joke(custom_prompt)
                    else:
                        joke = await self.generate_joke(category)
                    
                    return CallToolResult(
                        content=[TextContent(
                            type="text", 
                            text=f"🎭 Here's a {category} joke for you:\n\n{joke}"
                        )]
                    )
                
                elif name == "joke_battle":
                    category = arguments.get("category", "random")
                    count = arguments.get("count", 3)
                    
                    jokes = []
                    for i in range(count):
                        joke = await self.generate_joke(category)
                        jokes.append(f"{i+1}. {joke}")
                    
                    battle_text = f"🥊 Joke Battle - {category.title()} Edition!\n\n" + "\n\n".join(jokes)
                    battle_text += "\n\nWhich one made you laugh the most? 😄"
                    
                    return CallToolResult(
                        content=[TextContent(type="text", text=battle_text)]
                    )
                
                elif name == "explain_joke":
                    joke = arguments.get("joke", "")
                    explanation = await self.explain_joke(joke)
                    
                    return CallToolResult(
                        content=[TextContent(
                            type="text",
                            text=f"🤓 Joke Analysis:\n\nOriginal joke: {joke}\n\nExplanation: {explanation}"
                        )]
                    )
                
                else:
                    raise ValueError(f"Unknown tool: {name}")
                    
            except Exception as e:
                logger.error(f"Error in tool call {name}: {e}")
                return CallToolResult(
                    content=[TextContent(
                        type="text",
                        text=f"Sorry, I encountered an error: {str(e)}"
                    )],
                    isError=True
                )

    async def generate_joke(self, category: str) -> str:
        """Generate a joke using local Qwen2.5:3b model"""
        prompt = self.joke_categories.get(category, self.joke_categories["random"])
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{OLLAMA_BASE_URL}/api/generate",
                    json={
                        "model": MODEL_NAME,
                        "prompt": f"{prompt} Respond with just the joke, no extra commentary.",
                        "stream": False,
                        "options": {
                            "temperature": 0.8,
                            "top_p": 0.9,
                            "max_tokens": 200
                        }
                    },
                    timeout=30.0
                )
                
                if response.status_code == 200:
                    result = response.json()
                    joke = result.get("response", "").strip()
                    return joke if joke else "Why don't scientists trust atoms? Because they make up everything! 😄"
                else:
                    logger.error(f"Ollama API error: {response.status_code}")
                    return self.get_fallback_joke(category)
                    
        except Exception as e:
            logger.error(f"Error generating joke: {e}")
            return self.get_fallback_joke(category)

    async def generate_custom_joke(self, custom_prompt: str) -> str:
        """Generate a joke with a custom prompt"""
        full_prompt = f"{custom_prompt} Make it funny and appropriate. Respond with just the joke."
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{OLLAMA_BASE_URL}/api/generate",
                    json={
                        "model": MODEL_NAME,
                        "prompt": full_prompt,
                        "stream": False,
                        "options": {
                            "temperature": 0.8,
                            "top_p": 0.9,
                            "max_tokens": 200
                        }
                    },
                    timeout=30.0
                )
                
                if response.status_code == 200:
                    result = response.json()
                    return result.get("response", "").strip()
                else:
                    return "I tried to be creative, but I'm having connection issues! 😅"
                    
        except Exception as e:
            logger.error(f"Error generating custom joke: {e}")
            return "My joke generator is taking a coffee break! ☕"

    async def explain_joke(self, joke: str) -> str:
        """Explain why a joke is funny"""
        prompt = f"Explain why this joke is funny in a simple, educational way: '{joke}'"
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{OLLAMA_BASE_URL}/api/generate",
                    json={
                        "model": MODEL_NAME,
                        "prompt": prompt,
                        "stream": False,
                        "options": {
                            "temperature": 0.6,
                            "max_tokens": 300
                        }
                    },
                    timeout=30.0
                )
                
                if response.status_code == 200:
                    result = response.json()
                    return result.get("response", "").strip()
                else:
                    return "The explanation is funnier than the joke itself... unfortunately, I can't access it right now!"
                    
        except Exception as e:
            logger.error(f"Error explaining joke: {e}")
            return "Some jokes are like fine wine - they're better left unexplained! 🍷"

    def get_fallback_joke(self, category: str) -> str:
        """Fallback jokes when the AI is unavailable"""
        fallbacks = {
            "dad": "Why don't scientists trust atoms? Because they make up everything!",
            "programming": "Why do programmers prefer dark mode? Because light attracts bugs!",
            "pun": "I wondered why the baseball kept getting bigger. Then it hit me!",
            "knock-knock": "Knock knock! Who's there? Interrupting cow. Interrupting cow w-- MOO!",
            "one-liner": "I told my wife she was drawing her eyebrows too high. She looked surprised.",
            "random": "Why don't eggs tell jokes? They'd crack each other up!"
        }
        return fallbacks.get(category, fallbacks["random"])

    async def run(self):
        """Run the MCP server"""
        async with stdio_server() as (read_stream, write_stream):
            await self.server.run(
                read_stream,
                write_stream,
                self.server.create_initialization_options()
            )

async def main():
    """Main entry point"""
    server = JokeMCPServer()
    await server.run()

if __name__ == "__main__":
    asyncio.run(main())