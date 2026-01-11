import { describe, it, expect } from "vitest";
import { createJsonStreamParser } from "./formatting";

describe("JSON Stream Parser", () => {
  it("should extract text field incrementally as JSON streams in", () => {
    // Simulate the actual stream chunks from the user's example
    const chunks = [
      '{\n',
      ' ',
      ' "',
      'action',
      '":',
      ' "',
      'message',
      '",\n',
      ' ',
      ' "',
      'text',
      '":',
      ' "',
      'You\'re',
      ' welcome',
      '!',
      ' Enjoy',
      ' your',
      ' browsing',
      ',',
      ' and',
      ' I\'m',
      ' here',
      ' if',
      ' you',
      ' need',
      ' anything',
      '!"\n',
      '}'
    ];

    const parser = createJsonStreamParser();
    let accumulatedContent = "";
    const extractedTexts: string[] = [];

    // Process each chunk incrementally
    for (const chunk of chunks) {
      accumulatedContent += chunk;
      const result = parser.processChunk(accumulatedContent);
      
      // Extract text from result (can be string or object with text property)
      const text = typeof result === 'string' ? result : result?.text ?? null;
      if (text !== null) {
        extractedTexts.push(text);
      }
      
      // Also check getExtractedText
      const currentText = parser.getExtractedText();
      if (currentText !== null && !extractedTexts.includes(currentText)) {
        extractedTexts.push(currentText);
      }
    }

    // Verify that we extracted text progressively
    expect(extractedTexts.length).toBeGreaterThan(5); // Should have many incremental updates
    
    // The final extracted text should be the complete text value
    const finalText = parser.getExtractedText();
    expect(finalText).toBe("You're welcome! Enjoy your browsing, and I'm here if you need anything!");
    
    // Verify intermediate extractions show progressive text
    // The text should start appearing once the "text" field value starts streaming
    const hasPartialText = extractedTexts.some(text => 
      text.includes("You're") || text.includes("welcome")
    );
    expect(hasPartialText).toBe(true);
  });

  it("should handle incomplete JSON gracefully", () => {
    const chunks = [
      '{\n',
      ' "action": "message",\n',
      ' "text": "',
      'Hello',
      ' ',
      'world'
      // Note: No closing quote or brace
    ];

    const parser = createJsonStreamParser();
    let accumulated = "";

    for (const chunk of chunks) {
      accumulated += chunk;
      parser.processChunk(accumulated);
    }

    // Should still extract partial text
    const result = parser.getExtractedText();
    expect(result).toBe("Hello world");
  });

  it("should handle complete JSON in one chunk", () => {
    const completeJson = '{"action": "message", "text": "Hello world!"}';
    
    const parser = createJsonStreamParser();
    const result = parser.processChunk(completeJson);
    
    // Extract text from result (can be string or object with text property)
    const text = typeof result === 'string' ? result : result?.text ?? null;
    expect(text).toBe("Hello world!");
    expect(parser.getExtractedText()).toBe("Hello world!");
  });

  it("should handle the exact stream format from user example", () => {
    // Extract just the text chunks from the SSE stream
    const textChunks = [
      '{\n',
      ' ',
      ' "',
      'action',
      '":',
      ' "',
      'message',
      '",\n',
      ' ',
      ' "',
      'text',
      '":',
      ' "',
      'You\'re',
      ' welcome',
      '!',
      ' Enjoy',
      ' your',
      ' browsing',
      ',',
      ' and',
      ' I\'m',
      ' here',
      ' if',
      ' you',
      ' need',
      ' anything',
      '!"\n',
      '}'
    ];

    const parser = createJsonStreamParser();
    let accumulated = "";
    const allExtractedTexts: (string | null)[] = [];

    for (const chunk of textChunks) {
      accumulated += chunk;
      const result = parser.processChunk(accumulated);
      // Extract text from result (can be string or object with text property)
      const text = typeof result === 'string' ? result : result?.text ?? null;
      allExtractedTexts.push(text);
    }

    // Should have many non-null results (incremental updates)
    const nonNullResults = allExtractedTexts.filter(r => r !== null);
    expect(nonNullResults.length).toBeGreaterThan(10);

    // Final result should be the complete text
    const finalResult = parser.getExtractedText();
    expect(finalResult).toBe("You're welcome! Enjoy your browsing, and I'm here if you need anything!");
  });
});
