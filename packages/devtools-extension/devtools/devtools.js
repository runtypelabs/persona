// Create the "Persona" DevTools panel
chrome.devtools.panels.create(
  'Persona',
  'icons/icon32.png',
  'panel/panel.html',
  (panel) => {
    // Panel created successfully
  }
);
