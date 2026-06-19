import "./command-palette.css";

import {
  createPersonaCommandItems,
  installCommandPalette,
} from "./command-palette";
import { GALLERY_EXAMPLES } from "./examples-nav";
import { STANDALONE_EXAMPLES } from "./standalone-nav";

installCommandPalette({
  items: createPersonaCommandItems({
    advancedExamples: GALLERY_EXAMPLES,
    standaloneExamples: STANDALONE_EXAMPLES,
    currentPath: window.location.pathname,
    includeHomeSections: window.location.pathname === "/" || window.location.pathname === "/index.html",
  }),
  title: "Search Persona",
  subtitle: "Jump to pages, demos, examples, and integration recipes.",
  placeholder: "Search Persona...",
});
