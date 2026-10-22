import { version } from "../../package.json";

/**
 * A cached /latest/ entry must keep using its own release, even after another
 * release replaces latest. Only rewrite our published CDN layout; custom hosts
 * and explicitly versioned URLs retain their existing sibling resolution.
 * The bundler embeds this package version in each script-tag entry.
 */
export function pinCdnRelease(src: string): string {
  return src.replace(
    /^https:\/\/cdn\.runtype\.com\/persona\/latest\//,
    `https://cdn.runtype.com/persona/${version}/`,
  );
}
