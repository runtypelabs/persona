export const personaSseHeaders = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive"
} as const;

export function serializePersonaEvent(payload: Record<string, unknown>) {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

export function createPersonaTextStreamResponse(textStream: AsyncIterable<string>) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let finalText = "";

      try {
        for await (const chunk of textStream) {
          finalText += chunk;
          controller.enqueue(
            encoder.encode(
              serializePersonaEvent({
                type: "step_chunk",
                stepType: "prompt",
                chunk
              })
            )
          );
        }

        controller.enqueue(
          encoder.encode(
            serializePersonaEvent({
              type: "step_complete",
              stepType: "prompt",
              result: { response: finalText }
            })
          )
        );
        controller.enqueue(
          encoder.encode(
            serializePersonaEvent({
              type: "flow_complete",
              result: { response: finalText }
            })
          )
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Streaming failed";
        controller.enqueue(
          encoder.encode(
            serializePersonaEvent({
              type: "error",
              error: message
            })
          )
        );
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    status: 200,
    headers: personaSseHeaders
  });
}
