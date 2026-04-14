import { describe, it, expect } from "vitest";
import { createJsonStreamParser, parseFormattedTemplate, computeReasoningElapsed } from "./formatting";

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
      // JSON parser is synchronous so result is never a Promise
      const syncResult = result as Exclude<typeof result, Promise<any>>;
      const text = typeof syncResult === 'string' ? syncResult : syncResult?.text ?? null;
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
    // JSON parser is synchronous so result is never a Promise
    const syncResult = result as Exclude<typeof result, Promise<any>>;
    const text = typeof syncResult === 'string' ? syncResult : syncResult?.text ?? null;
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
      // JSON parser is synchronous so result is never a Promise
      const syncResult = result as Exclude<typeof result, Promise<any>>;
      const text = typeof syncResult === 'string' ? syncResult : syncResult?.text ?? null;
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

describe("parseFormattedTemplate", () => {
  it("returns plain text segments when no formatting markers are present", () => {
    const segments = parseFormattedTemplate("Calling {toolName}...", "Get Weather");
    expect(segments).toEqual([
      { text: "Calling Get Weather...", styles: [] },
    ]);
  });

  it("resolves {toolName} placeholder", () => {
    const segments = parseFormattedTemplate("{toolName} running", "Search Catalog");
    expect(segments).toEqual([
      { text: "Search Catalog running", styles: [] },
    ]);
  });

  it("parses ~dim~ markers", () => {
    const segments = parseFormattedTemplate("Finished {toolName} ~{duration}~", "Get Weather");
    expect(segments).toEqual([
      { text: "Finished Get Weather ", styles: [] },
      { text: "{duration}", styles: ["dim"], isDuration: true },
    ]);
  });

  it("parses *italic* markers", () => {
    const segments = parseFormattedTemplate("*{toolName}* completed", "Search");
    expect(segments).toEqual([
      { text: "Search", styles: ["italic"] },
      { text: " completed", styles: [] },
    ]);
  });

  it("parses **bold** markers", () => {
    const segments = parseFormattedTemplate("**Calling** {toolName}", "Lookup");
    expect(segments).toEqual([
      { text: "Calling", styles: ["bold"] },
      { text: " Lookup", styles: [] },
    ]);
  });

  it("handles multiple formatting markers in one template", () => {
    const segments = parseFormattedTemplate("**Done** *{toolName}* ~{duration}~", "API");
    expect(segments).toEqual([
      { text: "Done", styles: ["bold"] },
      { text: " ", styles: [] },
      { text: "API", styles: ["italic"] },
      { text: " ", styles: [] },
      { text: "{duration}", styles: ["dim"], isDuration: true },
    ]);
  });

  it("handles {duration} without formatting markers", () => {
    const segments = parseFormattedTemplate("Ran for {duration}", "Tool");
    expect(segments).toEqual([
      { text: "Ran for ", styles: [] },
      { text: "{duration}", styles: [], isDuration: true },
    ]);
  });

  it("handles template with no placeholders", () => {
    const segments = parseFormattedTemplate("Running...", "Ignored");
    expect(segments).toEqual([
      { text: "Running...", styles: [] },
    ]);
  });

  it("handles empty tool name fallback in template", () => {
    const segments = parseFormattedTemplate("{toolName}", "  ");
    // toolName is resolved before parsing, so whitespace stays
    expect(segments).toEqual([
      { text: "  ", styles: [] },
    ]);
  });
});

describe("computeReasoningElapsed", () => {
  it("uses durationMs when provided", () => {
    const result = computeReasoningElapsed({
      id: "r1", status: "complete", chunks: [], durationMs: 2600,
    });
    expect(result).toBe("2.6s");
  });

  it("computes from startedAt/completedAt when durationMs is undefined", () => {
    const result = computeReasoningElapsed({
      id: "r2", status: "complete", chunks: [],
      startedAt: 1000, completedAt: 16000,
    });
    expect(result).toBe("15s");
  });

  it("returns <0.1s for very short durations", () => {
    const result = computeReasoningElapsed({
      id: "r3", status: "complete", chunks: [], durationMs: 50,
    });
    expect(result).toBe("<0.1s");
  });
});
