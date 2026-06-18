const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) =>
    char === "&"
      ? "&amp;"
      : char === "<"
        ? "&lt;"
        : char === ">"
          ? "&gt;"
          : char === '"'
            ? "&quot;"
            : "&#39;",
  );

const QUOTED_HTML_STRING = "&quot;(?:\\\\.|(?!&quot;)[\\s\\S])*?&quot;";

export function highlightVariantConfig(source: string): string {
  return escapeHtml(source)
    .replace(/^([A-Za-z_$][\w$]*)(?=:)/gm, '<span class="prop">$1</span>')
    .replace(
      new RegExp(`(${QUOTED_HTML_STRING})(?=\\s*:)`, "g"),
      '<span class="property">$1</span>',
    )
    .replace(
      new RegExp(`(:\\s*)(${QUOTED_HTML_STRING})`, "g"),
      '$1<span class="string">$2</span>',
    )
    .replace(/\b(true|false|null)\b/g, '<span class="keyword">$1</span>')
    .replace(/(:\s*)(-?\d+(?:\.\d+)?)(?=[,\n}])/g, '$1<span class="keyword">$2</span>');
}
