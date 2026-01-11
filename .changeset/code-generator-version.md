---
"@runtypelabs/persona": patch
---

Use pinned package version in generated CDN URLs instead of @latest

- Code generator now uses the installed package version in CDN URLs
- Generated snippets use exact version (e.g., `@runtypelabs/persona@1.36.1`) instead of `@latest`
- Ensures reproducible deployments where generated code matches the installed widget version
- Export `VERSION` constant from package for programmatic access
