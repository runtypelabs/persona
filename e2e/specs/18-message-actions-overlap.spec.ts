import { expect, test, type Locator } from "@playwright/test";
import { installFakeHistoryApi, textTurnStream } from "../fixtures/fake-history-api";
import { openVoicePage, typeMessage, voiceSel } from "../fixtures/voice-page";

/**
 * The default message actions (hover, pill inside the bubble) float over the
 * bubble's bottom-right corner. A short reply's text runs right up to that
 * corner: the pill must sit beside the text, never on top of it.
 */

/** Whether any glyph run of the bubble's text intersects an action button. */
async function actionsCoverText(bubble: Locator): Promise<boolean> {
  return bubble.evaluate((node) => {
    const buttons = [...node.querySelectorAll(".persona-message-actions button")].map((b) => b.getBoundingClientRect());
    const walker = document.createTreeWalker(node.querySelector(".persona-message-content")!, NodeFilter.SHOW_TEXT);
    const lines: DOMRect[] = [];
    for (let text = walker.nextNode(); text; text = walker.nextNode()) {
      const range = document.createRange();
      range.selectNodeContents(text);
      lines.push(...range.getClientRects());
    }
    return lines.some((line) =>
      buttons.some(
        (button) =>
          line.width > 0 &&
          line.left < button.right &&
          line.right > button.left &&
          line.top < button.bottom &&
          line.bottom > button.top,
      ),
    );
  });
}

const cases: Array<{ answer: string; actions?: Record<string, unknown> }> = [
  { answer: "Okay, placing that now." },
  { answer: "Sure." },
  {
    answer:
      "We bake sourdough, rye, and a seeded country loaf every morning, and the first batch is out of the oven by seven.",
  },
  // A wider pill (three buttons), and a left-aligned one.
  { answer: "Sure.", actions: { showUpvote: true, showDownvote: true } },
  { answer: "Okay, placing that now.", actions: { align: "left" } },
];

for (const { answer, actions } of cases) {
  test(`hover actions never cover the text: "${answer.slice(0, 24)}" ${JSON.stringify(actions ?? {})}`, async ({
    page,
    context,
  }) => {
    const api = await installFakeHistoryApi(context);
    await openVoicePage(page, { voiceHost: "ws://127.0.0.1:9" });
    if (actions) {
      await page.evaluate((patch) => {
        const e2e = (window as unknown as { __personaE2E: { controller: { update(c: unknown): void } } }).__personaE2E;
        e2e.controller.update({ messageActions: patch });
      }, actions);
    }
    api.setChatStream(textTurnStream(answer));
    await typeMessage(page, "Hello");
    const bubble = page.locator(voiceSel.assistantBubble).filter({ hasText: answer });
    await expect(bubble).toHaveCount(1);

    await bubble.hover();
    const copy = bubble.locator('[data-action="copy"]');
    await expect(copy).toBeVisible();
    await expect.poll(() => copy.evaluate((el) => getComputedStyle(el.parentElement!).opacity)).toBe("1");
    expect(await actionsCoverText(bubble)).toBe(false);
  });
}
