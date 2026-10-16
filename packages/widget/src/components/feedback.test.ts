// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { createCSATFeedback, createNPSFeedback } from "./feedback";

afterEach(() => { document.body.innerHTML = ""; vi.restoreAllMocks(); });

it.each([
  ["CSAT", createCSATFeedback, 1, 5],
  ["NPS", createNPSFeedback, 0, 10],
] as const)("preserves the %s scale, comment, and retry after a failed submission", async (_name, create, low, high) => {
  const submit = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
  const form = create({ onSubmit: submit });
  document.body.append(form);
  const ratings = Array.from(form.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
  expect(ratings.map(button => Number(button.dataset.rating))).toEqual(Array.from({ length: high - low + 1 }, (_, i) => low + i));
  const button = form.querySelector<HTMLButtonElement>('.persona-feedback-btn-submit')!;
  button.click();
  expect(submit).not.toHaveBeenCalled();
  ratings[0].click();
  form.querySelector('textarea')!.value = "  helpful  ";
  button.click();
  await vi.waitFor(() => expect(button.disabled).toBe(false));
  expect(form.isConnected).toBe(true);
  expect(submit).toHaveBeenLastCalledWith(low, "helpful");
  button.click();
  await vi.waitFor(() => expect(form.isConnected).toBe(false));
  expect(submit).toHaveBeenCalledTimes(2);
});

it("dismisses without submitting and can omit the comment field", () => {
  const submit = vi.fn(), dismiss = vi.fn();
  const form = createCSATFeedback({ onSubmit: submit, onDismiss: dismiss, showComment: false });
  document.body.append(form);
  expect(form.querySelector('textarea')).toBeNull();
  form.querySelector<HTMLButtonElement>('.persona-feedback-btn-skip')!.click();
  expect(dismiss).toHaveBeenCalledOnce();
  expect(submit).not.toHaveBeenCalled();
  expect(form.isConnected).toBe(false);
});
