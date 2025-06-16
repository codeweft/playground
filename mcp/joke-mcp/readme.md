# Joke MCP Server Setup Instructions

This MCP server tells jokes using your local Qwen2.5:3b model through Ollama.

## Prerequisites

1. **Install Ollama** (if not already installed):
   ```bash
   # On macOS/Linux
   curl -fsSL https://ollama.ai/install.sh | sh
   
   # On Windows, download from https://ollama.ai/download
   ```

2. **Pull Qwen2.5:3b model**:
   ```bash
   ollama pull qwen2.5:3b
   ```

3. **Install Python dependencies**:
   ```bash
   pip install mcp httpx
   ```

## Setup Steps

1. **Create project directory**:
   ```bash
   mkdir joke-mcp-server
   cd joke-mcp-server
   ```

2. **Save the Python code** as `joke_server.py` (from the artifact above)

3. **Make it executable**:
   ```bash
   chmod +x joke_server.py
   ```

4. **Test Ollama connection**:
   ```bash
   # Start Ollama service (if not running)
   ollama serve
   
   # Test the model in another terminal
   ollama run qwen2.5:3b "Tell me a joke"
   ```

## Running the Server

### Method 1: Direct Python execution
```bash
python joke_server.py
```

### Method 2: As a standalone script
```bash
./joke_server.py
```

### Method 3: With MCP client
If you have an MCP client, configure it to use:
```bash
python /path/to/joke_server.py
```

## Using the Server

The server provides these tools:

### 1. **tell_joke**
- Generates jokes in specific categories
- Categories: `dad`, `programming`, `random`, `pun`, `knock-knock`, `one-liner`
- Optional custom prompts

### 2. **joke_battle**
- Generates multiple jokes for comparison
- Choose your favorite from 2-5 options

### 3. **explain_joke**
- Get AI explanations of why jokes are funny

### Resources Available:
- `joke://dad` - Dad jokes
- `joke://programming` - Tech jokes  
- `joke://random` - Random jokes
- `joke://pun` - Pun jokes
- `joke://knock-knock` - Knock-knock jokes
- `joke://one-liner` - One-liner jokes

## Example Usage

If testing with a simple MCP client:

```python
# Example tool call
{
    "method": "tools/call",
    "params": {
        "name": "tell_joke",
        "arguments": {
            "category": "programming"
        }
    }
}
```

## Troubleshooting

### Common Issues:

1. **"Connection refused" error**:
   - Make sure Ollama is running: `ollama serve`
   - Check if port 11434 is available

2. **Model not found**:
   - Verify model is installed: `ollama list`
   - Pull if missing: `ollama pull qwen2.5:3b`

3. **Slow responses**:
   - Qwen2.5:3b should be fast, but first run might be slower
   - Check your system resources

4. **MCP connection issues**:
   - Ensure you're using the correct Python path
   - Check MCP client configuration

### Configuration Options:

You can modify these in the code:
- `OLLAMA_BASE_URL`: Change if Ollama runs on different host/port
- `MODEL_NAME`: Use different model (e.g., `qwen2.5:7b`)
- Temperature/Top-p settings for different joke styles

## Advanced Usage

### Custom Categories:
Add new joke categories by modifying the `joke_categories` dictionary:

```python
self.joke_categories["science"] = "Tell me a science joke that's educational and funny."
```

### Integration with Other Tools:
The server can be integrated with:
- MCP-compatible chat applications
- Custom scripts using MCP protocol
- Automated joke delivery systems

## Have Fun! 🎭

Your local joke server is ready to entertain. The AI generates fresh jokes each time, so you'll get variety even with the same category!