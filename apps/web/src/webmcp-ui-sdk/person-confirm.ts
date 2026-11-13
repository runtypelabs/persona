// The page's own confirmation for controls marked `data-agent-confirm`. It is
// a native <dialog>, not a UI SDK component, so the bridge does not list it and
// an agent cannot press its buttons.

export type PersonConfirmRequest = {
  /** The sentence from the control's `data-agent-confirm` mark. */
  consequence: string;
  /** The control the agent asked to use, as the person sees it. */
  control: string;
  /** Aborts when the bridge stops waiting for an answer. */
  signal: AbortSignal;
};

export function askPerson({ consequence, control, signal }: PersonConfirmRequest): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false);

  return new Promise<boolean>((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "ui-sdk-confirm";
    dialog.setAttribute("aria-labelledby", "ui-sdk-confirm-title");
    dialog.setAttribute("aria-describedby", "ui-sdk-confirm-body");

    const title = document.createElement("h2");
    title.id = "ui-sdk-confirm-title";
    title.textContent = `The assistant wants to use “${control}”`;

    const body = document.createElement("p");
    body.id = "ui-sdk-confirm-body";
    body.textContent = `${consequence}.`;

    const actions = document.createElement("div");
    actions.className = "ui-sdk-confirm-actions";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "btn";
    cancel.textContent = "Don't allow";
    const allow = document.createElement("button");
    allow.type = "button";
    allow.className = "btn btn-danger";
    allow.textContent = "Allow";
    actions.append(cancel, allow);

    dialog.append(title, body, actions);
    document.body.append(dialog);

    const settle = (answer: boolean) => {
      signal.removeEventListener("abort", onAbort);
      dialog.close();
      dialog.remove();
      resolve(answer);
    };
    const onAbort = () => settle(false);

    signal.addEventListener("abort", onAbort);
    cancel.addEventListener("click", () => settle(false));
    allow.addEventListener("click", () => settle(true));
    // Escape closes a modal dialog without a click: treat it as "no".
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      settle(false);
    });

    dialog.showModal();
    cancel.focus();
  });
}
