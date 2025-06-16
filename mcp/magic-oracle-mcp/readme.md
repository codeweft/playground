# 🔮 Magic Oracle MCP - Standalone Setup (No Claude Desktop)

Run your mystical AI oracle directly without needing Claude Desktop!

## What You Get

- **Interactive chat interface** with your mystical oracle
- **Simple test script** to verify everything works
- **Direct Python access** to all oracle functions
- **Multiple ways to interact** with your MCP server

## Setup Steps

### 1. Prerequisites
```bash
# Ensure Ollama is running with Qwen2.5:3b
ollama serve
ollama pull qwen2.5:3b

# Install Python dependencies  
pip install httpx asyncio
```

### 2. Save All Files
Save these 3 files in the same directory:
- `magic_oracle_server.py` (the MCP server)
- `oracle_client.py` (interactive client)
- `test_oracle.py` (simple test script)

### 3. Test Your Setup
```bash
# Quick test to verify everything works
python test_oracle.py
```

This will run through all the oracle functions and show you the output.

### 4. Start Interactive Session
```bash
# Launch the interactive oracle chat
python oracle_client.py
```

## Usage Examples

### Interactive Chat Mode
```
🔮 Your mystical query: ask Will I become a great programmer?

🌟 The stars have spoken...

The cosmic code flows through your digital destiny like ancient rivers 
of wisdom. Each algorithm you master becomes a stepping stone across 
the ethereal bridge to programming mastery, where your logic shall 
dance with silicon dreams.

...trust in the cosmic wisdom! 🌌
```

### Available Commands
- `ask [question]` - Consult the oracle about anything
- `fortune` - Get your daily mystical fortune  
- `dream [description]` - Get mystical dream interpretation
- `help` - Show available commands
- `quit` - Exit the mystical realm

### Direct Python Usage
You can also import and use the client directly in your own Python scripts:

```python
from oracle_client import MagicOracleClient

async def my_oracle_session():
    client = MagicOracleClient("./magic_oracle_server.py")
    await client.start_server()
    
    # Ask a question
    response = await client.ask_oracle("What should I code today?")
    print(response)
    
    # Get fortune
    fortune = await client.get_daily_fortune()
    print(fortune)
    
    client.stop_server()
```

## Other MCP Clients You Could Use

Your MCP server will work with any MCP-compatible client:

### 1. MCP Inspector (Visual Testing)
```bash
npm install -g @modelcontextprotocol/inspector
mcp-inspector python magic_oracle_server.py
```

### 2. Custom Web Interface
Build a simple web frontend that talks to your MCP server via JSON-RPC

### 3. VS Code Extension
Create a VS Code extension that uses your oracle for coding advice

### 4. Terminal Integration
Add oracle commands to your shell aliases:
```bash
alias oracle="python /path/to/oracle_client.py"
```

## Customization Ideas

### Add More Mystical Tools
Edit `magic_oracle_server.py` to add:
- **Tarot readings** with card interpretations
- **Numerology** based on names/dates
- **Astrology** consultations  
- **Crystal ball** visions for the future
- **Mystical code reviews** for your programming projects

### Change the Personality
Modify the prompts to make your oracle:
- More serious and wise
- Funny and sarcastic
- Specific to certain topics (coding, relationships, career)
- Speak in different styles (Shakespeare, pirate, sci-fi)

### Connect to Other Models
Change the model in the server from `qwen2.5:3b` to:
- `llama2` for different responses
- `codellama` for coding-focused mysticism
- `mistral` for French mystical flair

## Troubleshooting

**Server won't start:**
- Check Ollama is running: `ollama ps`
- Verify qwen2.5:3b is installed: `ollama list`
- Check Python dependencies: `pip list | grep httpx`

**Weird responses:**
- That's the mystical magic working! 🔮
- Lower the temperature in the server for more consistent responses
- Adjust the mystical prompts for different styles

**Connection errors:**
- Ensure Ollama is on default port 11434
- Check firewall isn't blocking local connections

## Fun Examples to Try

Ask your oracle:
- "Should I refactor this spaghetti code?"
- "What programming language should I learn next?"
- "Will my deployment work on Friday afternoon?"
- "How can I fix this impossible bug?"
- "What does my git commit history say about my soul?"

Your mystical AI companion is ready to provide cosmic wisdom for all your coding adventures! ✨🧙‍♂️