/**
 * VENDORED type declarations: @mcp-b/smart-dom-reader v2.3.1 (MIT).
 * Copied verbatim from upstream dist/index.d.mts (only the trailing sourceMappingURL
 * comment removed). See ./index.js and ./README.md for why this is vendored.
 */
/* eslint-disable */
//#region src/types.d.ts
type ExtractionMode = 'interactive' | 'full' | 'structure' | 'content';
interface ElementSelector {
  css: string;
  xpath: string;
  textBased?: string;
  dataTestId?: string;
  ariaLabel?: string;
  candidates?: ElementSelectorCandidate[];
}
interface ElementSelectorCandidate {
  type: 'id' | 'data-testid' | 'role-aria' | 'name' | 'class-path' | 'css-path' | 'xpath' | 'text';
  value: string;
  score: number;
}
interface ElementContext {
  nearestForm?: string;
  nearestSection?: string;
  nearestMain?: string;
  nearestNav?: string;
  parentChain: string[];
}
interface ElementInteraction {
  click?: boolean;
  change?: boolean;
  submit?: boolean;
  nav?: boolean;
  disabled?: boolean;
  hidden?: boolean;
  role?: string;
  form?: string;
}
interface ExtractedElement {
  tag: string;
  text: string;
  selector: ElementSelector;
  attributes: Record<string, string>;
  context: ElementContext;
  interaction: ElementInteraction;
  children?: ExtractedElement[];
}
interface FormInfo {
  selector: string;
  action?: string;
  method?: string;
  inputs: ExtractedElement[];
  buttons: ExtractedElement[];
}
interface PageLandmarks {
  navigation: string[];
  main: string[];
  forms: string[];
  headers: string[];
  footers: string[];
  articles: string[];
  sections: string[];
}
interface PageState {
  url: string;
  title: string;
  hasErrors: boolean;
  isLoading: boolean;
  hasModals: boolean;
  hasFocus?: string;
}
interface SmartDOMResult {
  mode: ExtractionMode;
  timestamp: number;
  page: PageState;
  landmarks: PageLandmarks;
  interactive: {
    buttons: ExtractedElement[];
    links: ExtractedElement[];
    inputs: ExtractedElement[];
    forms: FormInfo[];
    clickable: ExtractedElement[];
  };
  semantic?: {
    headings: ExtractedElement[];
    images: ExtractedElement[];
    tables: ExtractedElement[];
    lists: ExtractedElement[];
    articles: ExtractedElement[];
  };
  metadata?: {
    totalElements: number;
    extractedElements: number;
    mainContent?: string;
    language?: string;
  };
}
interface FilterOptions {
  includeSelectors?: string[];
  excludeSelectors?: string[];
  textContains?: string[];
  textMatches?: RegExp[];
  hasAttributes?: string[];
  attributeValues?: Record<string, string | RegExp>;
  tags?: string[];
  interactionTypes?: Array<keyof ElementInteraction>;
  withinSelectors?: string[];
  nearText?: string;
}
interface ExtractionOptions {
  mode: ExtractionMode;
  maxDepth?: number;
  includeHidden?: boolean;
  includeShadowDOM?: boolean;
  includeIframes?: boolean;
  viewportOnly?: boolean;
  mainContentOnly?: boolean;
  customSelectors?: string[];
  attributeTruncateLength?: number;
  dataAttributeTruncateLength?: number;
  textTruncateLength?: number;
  filter?: FilterOptions;
}
interface RegionInfo {
  selector: string;
  label?: string;
  role?: string;
  interactiveCount: number;
  hasForm?: boolean;
  hasList?: boolean;
  hasTable?: boolean;
  hasMedia?: boolean;
  buttonCount?: number;
  linkCount?: number;
  inputCount?: number;
  textPreview?: string;
}
interface StructuralOverview {
  regions: {
    header?: RegionInfo;
    navigation?: RegionInfo[];
    main?: RegionInfo;
    sidebar?: RegionInfo[];
    footer?: RegionInfo;
    modals?: RegionInfo[];
    sections?: RegionInfo[];
  };
  forms: Array<{
    selector: string;
    location: string;
    inputCount: number;
    purpose?: string;
  }>;
  summary: {
    totalInteractive: number;
    totalForms: number;
    totalSections: number;
    hasModals: boolean;
    hasErrors: boolean;
    isLoading: boolean;
    mainContentSelector?: string;
  };
  suggestions?: string[];
}
interface ContentExtractionOptions {
  includeHeadings?: boolean;
  includeLists?: boolean;
  includeTables?: boolean;
  includeMedia?: boolean;
  preserveFormatting?: boolean;
  maxTextLength?: number;
}
interface ExtractedContent {
  selector: string;
  text: {
    headings?: Array<{
      level: number;
      text: string;
    }>;
    paragraphs?: string[];
    lists?: Array<{
      type: 'ul' | 'ol';
      items: string[];
    }>;
  };
  tables?: Array<{
    headers: string[];
    rows: string[][];
  }>;
  media?: Array<{
    type: 'img' | 'video' | 'audio';
    alt?: string;
    src?: string;
  }>;
  metadata: {
    wordCount: number;
    hasInteractive: boolean;
  };
}
//#endregion
//#region src/markdown-formatter.d.ts
type MarkdownDetailLevel = 'summary' | 'region' | 'deep';
interface MarkdownFormatOptions {
  detail?: MarkdownDetailLevel;
  maxTextLength?: number;
  maxElements?: number;
}
type PageMeta = {
  title?: string;
  url?: string;
};
declare class MarkdownFormatter {
  static structure(overview: StructuralOverview, _opts?: MarkdownFormatOptions, meta?: PageMeta): string;
  static region(result: SmartDOMResult, opts?: MarkdownFormatOptions, meta?: PageMeta): string;
  static content(content: ExtractedContent, opts?: MarkdownFormatOptions, meta?: PageMeta): string;
}
//#endregion
//#region src/bundle-types.d.ts
type ExtractionMethod = 'extractStructure' | 'extractRegion' | 'extractContent' | 'extractInteractive' | 'extractFull';
interface BaseExtractionArgs {
  frameSelector?: string;
  formatOptions?: MarkdownFormatOptions;
}
interface ExtractStructureArgs extends BaseExtractionArgs {
  selector?: string;
}
interface ExtractRegionArgs extends BaseExtractionArgs {
  selector: string;
  mode?: 'interactive' | 'full';
  options?: Partial<ExtractionOptions>;
}
interface ExtractContentArgs extends BaseExtractionArgs {
  selector: string;
  options?: ContentExtractionOptions;
}
interface ExtractInteractiveArgs extends BaseExtractionArgs {
  selector?: string;
  options?: Partial<ExtractionOptions>;
}
interface ExtractFullArgs extends BaseExtractionArgs {
  selector?: string;
  options?: Partial<ExtractionOptions>;
}
type ExtractionArgs = {
  extractStructure: ExtractStructureArgs;
  extractRegion: ExtractRegionArgs;
  extractContent: ExtractContentArgs;
  extractInteractive: ExtractInteractiveArgs;
  extractFull: ExtractFullArgs;
};
interface ExtractionError {
  error: string;
}
type ExtractionResult = string | ExtractionError;
interface SmartDOMReaderBundle {
  executeExtraction<M extends ExtractionMethod>(method: M, args: ExtractionArgs[M]): ExtractionResult;
}
declare global {
  interface Window {
    SmartDOMReaderBundle: SmartDOMReaderBundle;
  }
} //# sourceMappingURL=bundle-types.d.ts.map
//#endregion
//#region src/content-detection.d.ts
declare class ContentDetection {
  /**
   * Find the main content area of a page
   * Inspired by dom-to-semantic-markdown's approach
   */
  static findMainContent(doc: Document): Element;
  /**
   * Detect main content using scoring algorithm
   */
  private static detectMainContent;
  /**
   * Collect content candidates
   */
  private static collectCandidates;
  /**
   * Calculate content score for an element
   */
  static calculateContentScore(element: Element): number;
  /**
   * Calculate link density in an element
   */
  private static calculateLinkDensity;
  /**
   * Check if an element is likely navigation
   */
  static isNavigation(element: Element): boolean;
  /**
   * Check if element is likely supplementary content
   */
  static isSupplementary(element: Element): boolean;
  /**
   * Detect page landmarks
   */
  static detectLandmarks(doc: Document): Record<string, Element[]>;
}
//#endregion
//#region src/progressive.d.ts
type SmartDomReaderCtor = new (options?: Partial<ExtractionOptions>) => SmartDOMReader;
declare class ProgressiveExtractor {
  /**
   * Step 1: Extract high-level structural overview
   * This provides a "map" of the page for the AI to understand structure
   */
  static extractStructure(root: Document | Element): StructuralOverview;
  /**
   * Step 2: Extract detailed information from a specific region
   */
  static extractRegion(selector: string, doc: Document, options?: Partial<ExtractionOptions>, smartDomReaderCtor?: SmartDomReaderCtor): SmartDOMResult | null;
  /**
   * Step 3: Extract readable content from a region
   */
  static extractContent(selector: string, doc: Document, options?: ContentExtractionOptions): ExtractedContent | null;
  /**
   * Analyze a region and extract summary information
   */
  private static analyzeRegion;
  /**
   * Extract overview of forms on the page
   */
  private static extractFormOverview;
  /**
   * Calculate summary statistics
   */
  private static calculateSummary;
  /**
   * Generate AI-friendly suggestions
   */
  private static generateSuggestions;
  /**
   * Get text content with optional truncation
   */
  private static getTextContent;
}
//#endregion
//#region src/selectors.d.ts
declare class SelectorGenerator {
  /**
   * Generate multiple selector strategies for an element
   */
  static generateSelectors(element: Element): ElementSelector;
  /**
   * Generate a unique CSS selector for an element
   */
  private static generateCSSSelector;
  /**
   * Generate XPath for an element
   */
  private static generateXPath;
  /**
   * Generate a text-based selector for buttons and links
   */
  private static generateTextBasedSelector;
  /**
   * Get data-testid or similar attributes
   */
  private static getDataTestId;
  /**
   * Check if an ID is unique in the document
   */
  private static isUniqueId;
  /**
   * Check if a selector is unique within a container
   */
  private static isUniqueSelector;
  private static isUniqueSelectorSafe;
  /**
   * Get meaningful classes (filtering out utility classes)
   */
  private static getMeaningfulClasses;
  /**
   * Optimize the selector path by removing unnecessary parts
   */
  private static optimizePath;
  /**
   * Get a human-readable path description
   */
  static getContextPath(element: Element): string[];
}
//#endregion
//#region src/index.d.ts
/**
 * Smart DOM Reader - Full Extraction Approach
 *
 * This class provides complete DOM extraction in a single pass.
 * Use this when you need all information upfront and have sufficient
 * token budget for processing the complete output.
 *
 * Features:
 * - Single-pass extraction of all elements
 * - Two modes: 'interactive' (UI elements) or 'full' (includes content)
 * - Efficient for automation and testing scenarios
 * - Returns complete structured data immediately
 */
declare class SmartDOMReader {
  private options;
  constructor(options?: Partial<ExtractionOptions>);
  /**
   * Main extraction method - extracts all data in one pass
   * @param rootElement The document or element to extract from
   * @param runtimeOptions Options to override constructor options
   */
  extract(rootElement?: Document | Element, runtimeOptions?: Partial<ExtractionOptions>): SmartDOMResult;
  /**
   * Extract page state information
   */
  private extractPageState;
  /**
   * Extract page landmarks
   */
  private extractLandmarks;
  /**
   * Convert elements to selector strings
   */
  private elementsToSelectors;
  /**
   * Extract interactive elements
   */
  private extractInteractiveElements;
  /**
   * Extract form information
   */
  private extractForms;
  /**
   * Extract semantic elements (full mode only)
   */
  private extractSemanticElements;
  /**
   * Extract metadata
   */
  private extractMetadata;
  /**
   * Check if element should be included based on options
   */
  private shouldIncludeElement;
  /**
   * Detect errors on the page
   */
  private detectErrors;
  /**
   * Detect if page is loading
   */
  private detectLoading;
  /**
   * Detect modal dialogs
   */
  private detectModals;
  /**
   * Get currently focused element
   */
  private getFocusedElement;
  /**
   * Quick extraction for interactive elements only
   * @param doc The document to extract from
   * @param options Extraction options
   */
  static extractInteractive(doc: Document, options?: Partial<ExtractionOptions>): SmartDOMResult;
  /**
   * Quick extraction for full content
   * @param doc The document to extract from
   * @param options Extraction options
   */
  static extractFull(doc: Document, options?: Partial<ExtractionOptions>): SmartDOMResult;
  /**
   * Extract from a specific element
   * @param element The element to extract from
   * @param mode The extraction mode
   * @param options Additional options
   */
  static extractFromElement(element: Element, mode?: ExtractionMode, options?: Partial<ExtractionOptions>): SmartDOMResult;
}
//#endregion
export { ContentDetection, ContentExtractionOptions, ElementContext, ElementInteraction, ElementSelector, ElementSelectorCandidate, type ExtractContentArgs, type ExtractFullArgs, type ExtractInteractiveArgs, type ExtractRegionArgs, type ExtractStructureArgs, ExtractedContent, ExtractedElement, type ExtractionArgs, type ExtractionMethod, ExtractionMode, ExtractionOptions, type ExtractionResult, FilterOptions, FormInfo, type MarkdownFormatOptions, MarkdownFormatter, PageLandmarks, PageState, ProgressiveExtractor, RegionInfo, SelectorGenerator, SmartDOMReader, SmartDOMReader as default, SmartDOMResult, StructuralOverview };
