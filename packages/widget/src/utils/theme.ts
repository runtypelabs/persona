import { AgentWidgetConfig, AgentWidgetTheme } from "../types";

/**
 * Detects the current color scheme from the page.
 * 1. Checks if <html> element has 'dark' class
 * 2. Falls back to prefers-color-scheme media query
 */
export const detectColorScheme = (): 'light' | 'dark' => {
  // Check for 'dark' class on <html> element
  if (typeof document !== 'undefined' && document.documentElement.classList.contains('dark')) {
    return 'dark';
  }
  
  // Fall back to media query
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  
  return 'light';
};

/**
 * Gets the active theme based on colorScheme setting and current detection.
 */
export const getActiveTheme = (config?: AgentWidgetConfig): AgentWidgetTheme => {
  const colorScheme = config?.colorScheme ?? 'light';
  const lightTheme = config?.theme ?? {};
  const darkTheme = config?.darkTheme ?? lightTheme;
  
  if (colorScheme === 'light') {
    return lightTheme;
  }
  
  if (colorScheme === 'dark') {
    return darkTheme;
  }
  
  // colorScheme === 'auto'
  const detectedScheme = detectColorScheme();
  return detectedScheme === 'dark' ? darkTheme : lightTheme;
};

/**
 * Creates observers for theme changes (HTML class and media query).
 * Returns a cleanup function.
 */
export const createThemeObserver = (
  callback: (scheme: 'light' | 'dark') => void
): (() => void) => {
  const cleanupFns: Array<() => void> = [];
  
  // Observe HTML class changes
  if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver(() => {
      callback(detectColorScheme());
    });
    
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });
    
    cleanupFns.push(() => observer.disconnect());
  }
  
  // Observe media query changes
  if (typeof window !== 'undefined' && window.matchMedia) {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => callback(detectColorScheme());
    
    // Use addEventListener if available (modern browsers), otherwise addListener
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange);
      cleanupFns.push(() => mediaQuery.removeEventListener('change', handleChange));
    } else if (mediaQuery.addListener) {
      // Legacy Safari
      mediaQuery.addListener(handleChange);
      cleanupFns.push(() => mediaQuery.removeListener(handleChange));
    }
  }
  
  return () => {
    cleanupFns.forEach(fn => fn());
  };
};

export const applyThemeVariables = (
  element: HTMLElement,
  config?: AgentWidgetConfig
) => {
  const theme = getActiveTheme(config);
  Object.entries(theme).forEach(([key, value]) => {
    // Skip undefined or empty values
    if (value === undefined || value === null || value === "") {
      return;
    }
    // Convert camelCase to kebab-case (e.g., radiusSm → radius-sm)
    const kebabKey = key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
    element.style.setProperty(`--cw-${kebabKey}`, String(value));
  });
};




