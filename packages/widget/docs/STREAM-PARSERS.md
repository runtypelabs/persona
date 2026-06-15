# Stream Parser Configuration

> Part of the [@runtypelabs/persona](../README.md) documentation.

## Stream Parser Configuration

The widget can parse structured responses (JSON, XML, etc.) that stream in chunk by chunk, extracting the `text` field for display. By default, it uses a plain text parser. You can easily select a built-in parser using `parserType`, or provide a custom parser via `streamParser`.

**Key benefits of the unified stream parser:**
- **Format detection**: Automatically detects if content matches your parser's format
- **Extensible**: Handle JSON, XML, or any custom structured format
- **Incremental parsing**: Extract text as it streams in, not just when complete

**Quick start with `parserType` (recommended):**

The easiest way to use a built-in parser is with the `parserType` option:

```javascript
import { initAgentWidget } from '@runtypelabs/persona';

const controller = initAgentWidget({
  target: '#chat-root',
  config: {
    apiUrl: '/api/chat/dispatch',
    parserType: 'json'  // Options: 'plain', 'json', 'regex-json', 'xml'
  }
});
```

**Using built-in parsers with `streamParser` (ESM/Modules):**

```javascript
import { initAgentWidget, createPlainTextParser, createJsonStreamParser, createXmlParser } from '@runtypelabs/persona';

const controller = initAgentWidget({
  target: '#chat-root',
  config: {
    apiUrl: '/api/chat/dispatch',
    streamParser: createJsonStreamParser // Use JSON parser
    // Or: createXmlParser for XML, createPlainTextParser for plain text (default)
  }
});
```

**Using built-in parsers with CDN Script Tags:**

```html
<script src="https://cdn.jsdelivr.net/npm/@runtypelabs/persona@latest/dist/index.global.js"></script>
<script>
  window.AgentWidget.initAgentWidget({
    target: '#chat-root',
    config: {
      apiUrl: '/api/chat/dispatch',
      streamParser: window.AgentWidget.createJsonStreamParser // JSON parser
      // Or: window.AgentWidget.createXmlParser for XML
      // Or: window.AgentWidget.createPlainTextParser for plain text (default)
    }
  });
</script>
```

**Using with automatic installer script:**

```html
<script>
  window.siteAgentConfig = {
    target: 'body',
    config: {
      apiUrl: '/api/chat/dispatch',
      parserType: 'json'  // Simple way to select parser - no function imports needed!
    }
  };
</script>
<script src="https://cdn.jsdelivr.net/npm/@runtypelabs/persona@latest/dist/install.global.js"></script>
```

**Alternative: Using `streamParser` with installer script:**

If you need a custom parser, you can still use `streamParser`:

```html
<script>
  window.siteAgentConfig = {
    target: 'body',
    config: {
      apiUrl: '/api/chat/dispatch',
      // Note: streamParser must be set after the script loads, or use a function
      streamParser: function() {
        return window.AgentWidget.createJsonStreamParser();
      }
    }
  };
</script>
<script src="https://cdn.jsdelivr.net/npm/@runtypelabs/persona@latest/dist/install.global.js"></script>
```

Alternatively, you can set it after the script loads:

```html
<script>
  window.siteAgentConfig = {
    target: 'body',
    config: {
      apiUrl: '/api/chat/dispatch'
    }
  };
</script>
<script src="https://cdn.jsdelivr.net/npm/@runtypelabs/persona@latest/dist/install.global.js"></script>
<script>
  // Set parser after AgentWidget is loaded
  if (window.siteAgentConfig && window.AgentWidget) {
    window.siteAgentConfig.config.streamParser = window.AgentWidget.createJsonStreamParser;
  }
</script>
```

**Custom JSON parser example:**

```javascript
const jsonParser = () => {
  let extractedText = null;
  
  return {
    // Extract text field from JSON as it streams in
    // Return null if not JSON or text not available yet
    processChunk(accumulatedContent) {
      const trimmed = accumulatedContent.trim();
      // Return null if not JSON format
      if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
        return null;
      }
      
      const match = accumulatedContent.match(/"text"\s*:\s*"([^"]*(?:\\.[^"]*)*)"/);
      if (match) {
        extractedText = match[1].replace(/\\"/g, '"').replace(/\\n/g, '\n');
        return extractedText;
      }
      return null;
    },
    
    getExtractedText() {
      return extractedText;
    }
  };
};

initAgentWidget({
  target: '#chat-root',
  config: {
    apiUrl: '/api/chat/dispatch',
    streamParser: jsonParser,
    postprocessMessage: ({ text, raw }) => {
      // raw contains the structured payload (JSON, XML, etc.)
      return markdownPostprocessor(text);
    }
  }
});
```

**Custom XML parser example:**

```javascript
const xmlParser = () => {
  let extractedText = null;
  
  return {
    processChunk(accumulatedContent) {
      // Return null if not XML format
      if (!accumulatedContent.trim().startsWith('<')) {
        return null;
      }
      
      // Extract text from <text>...</text> tags
      const match = accumulatedContent.match(/<text[^>]*>([\s\S]*?)<\/text>/);
      if (match) {
        extractedText = match[1];
        return extractedText;
      }
      return null;
    },
    
    getExtractedText() {
      return extractedText;
    }
  };
};
```

**Parser interface:**

```typescript
interface AgentWidgetStreamParser {
  // Process a chunk and return extracted text (if available)
  // Return null if the content doesn't match this parser's format or text is not yet available
  processChunk(accumulatedContent: string): Promise<string | null> | string | null;
  
  // Get the currently extracted text (may be partial)
  getExtractedText(): string | null;
  
  // Optional cleanup when parsing is complete
  close?(): Promise<void> | void;
}
```

The parser's `processChunk` method is called for each chunk. If the content matches your parser's format, return the extracted text and the raw payload. Built-in parsers already do this, so action handlers and middleware can read the original structured content without re-implementing a parser. Return `null` if the chunk isn't ready yet: the widget will keep waiting or fall back to plain text.

