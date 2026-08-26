/**
 * Fake `attachments.adapter` for the composer suite demo.
 *
 * Stands in for an eager upload to host storage: it ticks progress for ~2.5s,
 * honours the abort signal, and resolves with a content part that points at a
 * made-up remote URL instead of base64. Nothing leaves the browser.
 */

import type {
  AgentWidgetAttachmentAdapter,
  ContentPart,
} from "@runtypelabs/persona";

const UPLOAD_MS = 2500;
const TICK_MS = 120;

export type FakeUploadAdapterOptions = {
  /** Consumed once per upload: true fails that upload and then clears itself. */
  shouldFailNext: () => boolean;
  log: (message: string, tone?: "info" | "error") => void;
};

const fakeRemoteUrl = (file: File): string =>
  `https://uploads.example.com/composer-suite/${Date.now().toString(36)}/${encodeURIComponent(file.name)}`;

const toContentPart = (file: File, url: string): ContentPart =>
  file.type.startsWith("image/")
    ? { type: "image", image: url, mimeType: file.type, alt: file.name }
    : {
        type: "file",
        data: url,
        mimeType: file.type || "application/octet-stream",
        filename: file.name,
      };

export function createFakeUploadAdapter(
  options: FakeUploadAdapterOptions,
): AgentWidgetAttachmentAdapter {
  return {
    add: (file, { signal, onProgress }) =>
      new Promise<ContentPart>((resolve, reject) => {
        const willFail = options.shouldFailNext();
        options.log(
          willFail
            ? `upload started (will fail): ${file.name}`
            : `upload started: ${file.name}`,
          willFail ? "error" : "info",
        );

        const started = Date.now();
        let timer: ReturnType<typeof setInterval> | null = null;

        const stop = (): void => {
          if (timer !== null) clearInterval(timer);
          timer = null;
          signal.removeEventListener("abort", onAbort);
        };

        function onAbort(): void {
          stop();
          options.log(`upload aborted: ${file.name}`, "error");
          reject(new Error("Upload aborted"));
        }
        signal.addEventListener("abort", onAbort);

        if (signal.aborted) {
          onAbort();
          return;
        }

        timer = setInterval(() => {
          const elapsed = Date.now() - started;
          const progress = Math.min(1, elapsed / UPLOAD_MS);
          onProgress(progress);
          if (progress < 1) return;
          stop();
          if (willFail) {
            options.log(`upload failed: ${file.name}`, "error");
            reject(new Error("The storage bucket rejected this file. Try again."));
            return;
          }
          const url = fakeRemoteUrl(file);
          options.log(`upload finished: ${file.name}`);
          resolve(toContentPart(file, url));
        }, TICK_MS);
      }),

    remove: (part) => {
      const label =
        part.type === "file"
          ? part.filename
          : part.type === "image"
            ? (part.alt ?? "image")
            : part.type;
      options.log(`adapter.remove released ${label}`);
    },
  };
}
