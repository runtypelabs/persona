---
"@runtypelabs/persona": patch
---

Fix push-dock reveal breaking `position: fixed` host chrome. The push track was offset with a CSS `transform`, which made it the containing block for any `position: fixed` descendant — so viewport-fixed elements rendered inside the pushed content (e.g. a host app's `fixed top-0 right-0` toolbar) resolved against the track and landed the panel width off-screen. The track now uses a `margin-left` offset, which produces the identical visual push without establishing a containing block, so fixed (and sticky) descendants resolve against the viewport again.
