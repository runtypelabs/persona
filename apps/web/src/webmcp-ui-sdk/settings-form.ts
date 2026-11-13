// The page under control: a settings form built only from UI SDK web
// components. Nothing here knows about agents except the two `data-agent-*`
// marks; the bridge in ./main.ts reads the components directly.
import "@ui-sdk/web/button";
import "@ui-sdk/web/field";
import "@ui-sdk/web/input";
import "@ui-sdk/web/segmented-control";
import "@ui-sdk/web/select";
import "@ui-sdk/web/slider";
import "@ui-sdk/web/switch";

const REGIONS = [
  { value: "us-east", label: "US East" },
  { value: "us-west", label: "US West" },
  { value: "europe", label: "Europe" },
  { value: "asia-pacific", label: "Asia Pacific" },
] as const;

const PLANS = [
  { value: "free", label: "Free" },
  { value: "pro", label: "Pro" },
  { value: "team", label: "Team" },
] as const;

const CHEVRON = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 6 4 4 4-4" stroke="currentColor" stroke-width="1.5"/></svg>`;

const FORM_HTML = `
  <ui-field name="workspaceName" class="ui-sdk-field">
    <ui-field-label class="ui-sdk-label">Workspace name</ui-field-label>
    <ui-input><input type="text" value="Acme Research" autocomplete="off" /></ui-input>
  </ui-field>

  <ui-field name="region" class="ui-sdk-field">
    <ui-field-label class="ui-sdk-label">Region</ui-field-label>
    <ui-select default-value="us-east">
      <ui-select-trigger>
        <button type="button" class="ui-sdk-select-trigger">
          <ui-select-value></ui-select-value>
          ${CHEVRON}
        </button>
      </ui-select-trigger>
      <ui-select-content class="ui-sdk-select-content">
        ${REGIONS.map(
          (region) =>
            `<ui-select-item class="ui-sdk-select-item" value="${region.value}">${region.label}</ui-select-item>`,
        ).join("")}
      </ui-select-content>
    </ui-select>
  </ui-field>

  <ui-field name="plan" class="ui-sdk-field">
    <ui-field-label class="ui-sdk-label">Plan</ui-field-label>
    <ui-segmented-control class="ui-sdk-segmented" default-value="pro">
      <ui-segmented-control-indicator class="ui-sdk-segmented-indicator"></ui-segmented-control-indicator>
      ${PLANS.map(
        (plan) =>
          `<ui-segmented-control-item class="ui-sdk-segmented-item" value="${plan.value}">${plan.label}</ui-segmented-control-item>`,
      ).join("")}
    </ui-segmented-control>
  </ui-field>

  <ui-field name="logRetention" class="ui-sdk-field">
    <ui-slider
      class="ui-sdk-slider"
      aria-label="Log retention (days)"
      default-value="30"
      min="7"
      max="90"
      step="1"
    >
      <div class="ui-sdk-slider-row">
        <ui-field-label class="ui-sdk-label">Log retention (days)</ui-field-label>
        <ui-slider-value class="ui-sdk-slider-value"></ui-slider-value>
      </div>
      <ui-slider-control class="ui-sdk-slider-control">
        <ui-slider-track class="ui-sdk-slider-track">
          <ui-slider-indicator class="ui-sdk-slider-indicator"></ui-slider-indicator>
          <ui-slider-thumb class="ui-sdk-slider-thumb"></ui-slider-thumb>
        </ui-slider-track>
      </ui-slider-control>
    </ui-slider>
  </ui-field>

  <ui-field name="weeklyDigest" class="ui-sdk-field ui-sdk-field--row">
    <ui-field-label class="ui-sdk-label">Weekly digest email</ui-field-label>
    <ui-switch class="ui-sdk-switch" default-checked>
      <ui-switch-thumb class="ui-sdk-switch-thumb"></ui-switch-thumb>
    </ui-switch>
  </ui-field>

  <ui-field name="twoFactor" class="ui-sdk-field ui-sdk-field--row">
    <ui-field-label class="ui-sdk-label">Require two-factor sign-in</ui-field-label>
    <ui-switch class="ui-sdk-switch">
      <ui-switch-thumb class="ui-sdk-switch-thumb"></ui-switch-thumb>
    </ui-switch>
  </ui-field>

  <ui-field name="taxId" class="ui-sdk-field" data-agent-secret>
    <div class="ui-sdk-label-row">
      <ui-field-label class="ui-sdk-label">Tax ID</ui-field-label>
      <span class="ui-sdk-tag">hidden from the agent</span>
    </div>
    <ui-input><input type="text" value="DE 812 555 019" autocomplete="off" /></ui-input>
  </ui-field>

  <div class="ui-sdk-actions">
    <ui-button id="save-settings">
      <button type="button" class="btn btn-primary">Save changes</button>
    </ui-button>
    <ui-button
      id="delete-workspace"
      data-agent-confirm="Permanently deletes this workspace and all of its data"
    >
      <button type="button" class="btn btn-danger">Delete workspace</button>
    </ui-button>
  </div>
  <p class="ui-sdk-status" id="settings-status" role="status" data-tone="idle">No unsaved changes.</p>
`;

export type SettingsForm = {
  /** Mark the form as having edits that Save has not committed yet. */
  markDirty: () => void;
};

type StatusTone = "idle" | "dirty" | "saved" | "warn";

export function mountSettingsForm(root: HTMLElement): SettingsForm {
  root.classList.add("ui-sdk-form");
  root.innerHTML = FORM_HTML;

  const status = root.querySelector<HTMLElement>("#settings-status");
  const setStatus = (message: string, tone: StatusTone) => {
    if (!status) return;
    status.textContent = message;
    status.dataset.tone = tone;
  };

  root.querySelector("#save-settings")?.addEventListener("action", () => {
    const time = new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date());
    setStatus(`Saved at ${time}.`, "saved");
  });

  root.querySelector("#delete-workspace")?.addEventListener("action", () => {
    setStatus("Demo only: nothing was deleted.", "warn");
  });

  return {
    markDirty: () => setStatus("Unsaved changes.", "dirty"),
  };
}
