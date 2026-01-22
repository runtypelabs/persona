import "@runtypelabs/persona/widget.css";
import {
  createAgentExperience,
  markdownPostprocessor,
  DEFAULT_WIDGET_CONFIG,
  createTypingIndicator
} from "@runtypelabs/persona";
import type { LoadingIndicatorRenderContext, IdleIndicatorRenderContext } from "@runtypelabs/persona";

const proxyPort = import.meta.env.VITE_PROXY_PORT ?? 43111;
const proxyUrl =
  import.meta.env.VITE_PROXY_URL
    ? `${import.meta.env.VITE_PROXY_URL}/api/chat/dispatch`
    : `http://localhost:${proxyPort}/api/chat/dispatch`;

// Function to create the animated SVG loading indicator
function createRuntypeLoader(): HTMLElement {
  const container = document.createElement("div");
  container.style.cssText = "width: 40px; height: 35px; perspective: 500px;";
  // Add data-preserve-animation to prevent morphing from interrupting the animation
  container.setAttribute("data-preserve-animation", "true");

  container.innerHTML = `
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 5.761835 5.0342874"
      version="1.1"
      xmlns="http://www.w3.org/2000/svg">
      <defs>
        <style>
          @keyframes rotateIn {
            0% {
              opacity: 0;
              transform: rotateY(90deg) rotateX(45deg);
            }
            50% {
              opacity: 1;
            }
            100% {
              opacity: 1;
              transform: rotateY(0deg) rotateX(0deg);
            }
          }
          @keyframes rRotateIn {
            0% {
              opacity: 0;
              transform: rotateY(-180deg) rotateZ(45deg);
            }
            100% {
              opacity: 1;
              transform: rotateY(0deg) rotateZ(0deg);
            }
          }
          .bg-square {
            fill: none;
            stroke: #9ca3af;
            stroke-width: 0.03;
            opacity: 0;
            transform-origin: center;
            transform-box: fill-box;
          }
          .r-square-group {
            opacity: 0;
            transform-origin: center;
            transform-box: fill-box;
          }
          .r-square-group rect {
            fill: none;
            stroke: #1f2937;
            stroke-width: 0.03;
          }
          .r-square-group line {
            stroke: #1f2937;
            stroke-width: 0.03;
          }
          /* Staggered 3D rotation for each square */
          .sq0 { animation: rotateIn 0.6s ease-out forwards; animation-delay: 0s; }
          .sq1 { animation: rotateIn 0.6s ease-out forwards; animation-delay: 0.04s; }
          .sq2 { animation: rotateIn 0.6s ease-out forwards; animation-delay: 0.08s; }
          .sq3 { animation: rotateIn 0.6s ease-out forwards; animation-delay: 0.12s; }
          .sq4 { animation: rotateIn 0.6s ease-out forwards; animation-delay: 0.16s; }
          .sq5 { animation: rotateIn 0.6s ease-out forwards; animation-delay: 0.2s; }
          .sq6 { animation: rotateIn 0.6s ease-out forwards; animation-delay: 0.24s; }
          .sq7 { animation: rotateIn 0.6s ease-out forwards; animation-delay: 0.28s; }
          .sq8 { animation: rotateIn 0.6s ease-out forwards; animation-delay: 0.06s; }
          .sq9 { animation: rotateIn 0.6s ease-out forwards; animation-delay: 0.1s; }
          .sq10 { animation: rotateIn 0.6s ease-out forwards; animation-delay: 0.14s; }
          .sq11 { animation: rotateIn 0.6s ease-out forwards; animation-delay: 0.18s; }
          .sq12 { animation: rotateIn 0.6s ease-out forwards; animation-delay: 0.22s; }
          .sq13 { animation: rotateIn 0.6s ease-out forwards; animation-delay: 0.26s; }
          .sq14 { animation: rotateIn 0.6s ease-out forwards; animation-delay: 0.3s; }
          .sq15 { animation: rotateIn 0.6s ease-out forwards; animation-delay: 0.34s; }
          .sq16 { animation: rotateIn 0.6s ease-out forwards; animation-delay: 0.12s; }
          .sq17 { animation: rotateIn 0.6s ease-out forwards; animation-delay: 0.16s; }
          .sq18 { animation: rotateIn 0.6s ease-out forwards; animation-delay: 0.2s; }
          .sq19 { animation: rotateIn 0.6s ease-out forwards; animation-delay: 0.24s; }
          .sq20 { animation: rotateIn 0.6s ease-out forwards; animation-delay: 0.28s; }
          .sq21 { animation: rotateIn 0.6s ease-out forwards; animation-delay: 0.32s; }
          .sq22 { animation: rotateIn 0.6s ease-out forwards; animation-delay: 0.36s; }
          .sq23 { animation: rotateIn 0.6s ease-out forwards; animation-delay: 0.4s; }
          .sq24 { animation: rotateIn 0.6s ease-out forwards; animation-delay: 0.18s; }
          .sq25 { animation: rotateIn 0.6s ease-out forwards; animation-delay: 0.22s; }
          .sq26 { animation: rotateIn 0.6s ease-out forwards; animation-delay: 0.26s; }
          .sq27 { animation: rotateIn 0.6s ease-out forwards; animation-delay: 0.3s; }
          .sq28 { animation: rotateIn 0.6s ease-out forwards; animation-delay: 0.34s; }
          .sq29 { animation: rotateIn 0.6s ease-out forwards; animation-delay: 0.38s; }
          .sq30 { animation: rotateIn 0.6s ease-out forwards; animation-delay: 0.42s; }
          .sq31 { animation: rotateIn 0.6s ease-out forwards; animation-delay: 0.46s; }
          .sq32 { animation: rotateIn 0.6s ease-out forwards; animation-delay: 0.24s; }
          .sq33 { animation: rotateIn 0.6s ease-out forwards; animation-delay: 0.28s; }
          .sq34 { animation: rotateIn 0.6s ease-out forwards; animation-delay: 0.32s; }
          .sq35 { animation: rotateIn 0.6s ease-out forwards; animation-delay: 0.36s; }
          .sq36 { animation: rotateIn 0.6s ease-out forwards; animation-delay: 0.4s; }
          .sq37 { animation: rotateIn 0.6s ease-out forwards; animation-delay: 0.44s; }
          .sq38 { animation: rotateIn 0.6s ease-out forwards; animation-delay: 0.48s; }
          .sq39 { animation: rotateIn 0.6s ease-out forwards; animation-delay: 0.52s; }
          .sq40 { animation: rotateIn 0.6s ease-out forwards; animation-delay: 0.3s; }
          .sq41 { animation: rotateIn 0.6s ease-out forwards; animation-delay: 0.34s; }
          .sq42 { animation: rotateIn 0.6s ease-out forwards; animation-delay: 0.38s; }
          .sq43 { animation: rotateIn 0.6s ease-out forwards; animation-delay: 0.42s; }
          .sq44 { animation: rotateIn 0.6s ease-out forwards; animation-delay: 0.46s; }
          .sq45 { animation: rotateIn 0.6s ease-out forwards; animation-delay: 0.5s; }
          .sq46 { animation: rotateIn 0.6s ease-out forwards; animation-delay: 0.54s; }
          .sq47 { animation: rotateIn 0.6s ease-out forwards; animation-delay: 0.58s; }
          .sq48 { animation: rotateIn 0.6s ease-out forwards; animation-delay: 0.36s; }
          .sq49 { animation: rotateIn 0.6s ease-out forwards; animation-delay: 0.4s; }
          .sq50 { animation: rotateIn 0.6s ease-out forwards; animation-delay: 0.44s; }
          .sq51 { animation: rotateIn 0.6s ease-out forwards; animation-delay: 0.48s; }
          .sq52 { animation: rotateIn 0.6s ease-out forwards; animation-delay: 0.52s; }
          .sq53 { animation: rotateIn 0.6s ease-out forwards; animation-delay: 0.56s; }
          .sq54 { animation: rotateIn 0.6s ease-out forwards; animation-delay: 0.6s; }
          .sq55 { animation: rotateIn 0.6s ease-out forwards; animation-delay: 0.64s; }
          /* R letter squares rotate in with staggered delays */
          .r-sq0 { animation: rRotateIn 0.8s ease-out forwards; animation-delay: 1.2s; }
          .r-sq1 { animation: rRotateIn 0.8s ease-out forwards; animation-delay: 1.3s; }
          .r-sq2 { animation: rRotateIn 0.8s ease-out forwards; animation-delay: 1.4s; }
          .r-sq3 { animation: rRotateIn 0.8s ease-out forwards; animation-delay: 1.5s; }
          .r-sq4 { animation: rRotateIn 0.8s ease-out forwards; animation-delay: 1.6s; }
          .r-sq5 { animation: rRotateIn 0.8s ease-out forwards; animation-delay: 1.7s; }
          .r-sq6 { animation: rRotateIn 0.8s ease-out forwards; animation-delay: 1.8s; }
          .r-sq7 { animation: rRotateIn 0.8s ease-out forwards; animation-delay: 1.9s; }
          .r-sq8 { animation: rRotateIn 0.8s ease-out forwards; animation-delay: 2.0s; }
        </style>
      </defs>
      <g transform="matrix(0.75837457,0,0,0.75837457,-597.36163,-129.28708)">
        <!-- Background grid squares - 8 columns x 7 rows = 56 squares -->
        <!-- Row 0 -->
        <rect class="bg-square sq0" x="787.68679" y="170.47919" width="0.79733" height="0.79733" />
        <rect class="bg-square sq1" x="788.65759" y="170.47919" width="0.79733" height="0.79733" />
        <rect class="bg-square sq2" x="789.62839" y="170.47919" width="0.79733" height="0.79733" />
        <rect class="bg-square sq3" x="790.59919" y="170.47919" width="0.79733" height="0.79733" />
        <rect class="bg-square sq4" x="791.56999" y="170.47919" width="0.79733" height="0.79733" />
        <rect class="bg-square sq5" x="792.54079" y="170.47919" width="0.79733" height="0.79733" />
        <rect class="bg-square sq6" x="793.51159" y="170.47919" width="0.79733" height="0.79733" />
        <rect class="bg-square sq7" x="794.48239" y="170.47919" width="0.79733" height="0.79733" />
        <!-- Row 1 -->
        <rect class="bg-square sq8" x="787.68679" y="171.45086" width="0.79733" height="0.79733" />
        <rect class="bg-square sq9" x="788.65759" y="171.45086" width="0.79733" height="0.79733" />
        <rect class="bg-square sq10" x="789.62839" y="171.45086" width="0.79733" height="0.79733" />
        <rect class="bg-square sq11" x="790.59919" y="171.45086" width="0.79733" height="0.79733" />
        <rect class="bg-square sq12" x="791.56999" y="171.45086" width="0.79733" height="0.79733" />
        <rect class="bg-square sq13" x="792.54079" y="171.45086" width="0.79733" height="0.79733" />
        <rect class="bg-square sq14" x="793.51159" y="171.45086" width="0.79733" height="0.79733" />
        <rect class="bg-square sq15" x="794.48239" y="171.45086" width="0.79733" height="0.79733" />
        <!-- Row 2 -->
        <rect class="bg-square sq16" x="787.68679" y="172.42253" width="0.79733" height="0.79733" />
        <rect class="bg-square sq17" x="788.65759" y="172.42253" width="0.79733" height="0.79733" />
        <rect class="bg-square sq18" x="789.62839" y="172.42253" width="0.79733" height="0.79733" />
        <rect class="bg-square sq19" x="790.59919" y="172.42253" width="0.79733" height="0.79733" />
        <rect class="bg-square sq20" x="791.56999" y="172.42253" width="0.79733" height="0.79733" />
        <rect class="bg-square sq21" x="792.54079" y="172.42253" width="0.79733" height="0.79733" />
        <rect class="bg-square sq22" x="793.51159" y="172.42253" width="0.79733" height="0.79733" />
        <rect class="bg-square sq23" x="794.48239" y="172.42253" width="0.79733" height="0.79733" />
        <!-- Row 3 -->
        <rect class="bg-square sq24" x="787.68679" y="173.39419" width="0.79733" height="0.79733" />
        <rect class="bg-square sq25" x="788.65759" y="173.39419" width="0.79733" height="0.79733" />
        <rect class="bg-square sq26" x="789.62839" y="173.39419" width="0.79733" height="0.79733" />
        <rect class="bg-square sq27" x="790.59919" y="173.39419" width="0.79733" height="0.79733" />
        <rect class="bg-square sq28" x="791.56999" y="173.39419" width="0.79733" height="0.79733" />
        <rect class="bg-square sq29" x="792.54079" y="173.39419" width="0.79733" height="0.79733" />
        <rect class="bg-square sq30" x="793.51159" y="173.39419" width="0.79733" height="0.79733" />
        <rect class="bg-square sq31" x="794.48239" y="173.39419" width="0.79733" height="0.79733" />
        <!-- Row 4 -->
        <rect class="bg-square sq32" x="787.68679" y="174.36586" width="0.79733" height="0.79733" />
        <rect class="bg-square sq33" x="788.65759" y="174.36586" width="0.79733" height="0.79733" />
        <rect class="bg-square sq34" x="789.62839" y="174.36586" width="0.79733" height="0.79733" />
        <rect class="bg-square sq35" x="790.59919" y="174.36586" width="0.79733" height="0.79733" />
        <rect class="bg-square sq36" x="791.56999" y="174.36586" width="0.79733" height="0.79733" />
        <rect class="bg-square sq37" x="792.54079" y="174.36586" width="0.79733" height="0.79733" />
        <rect class="bg-square sq38" x="793.51159" y="174.36586" width="0.79733" height="0.79733" />
        <rect class="bg-square sq39" x="794.48239" y="174.36586" width="0.79733" height="0.79733" />
        <!-- Row 5 -->
        <rect class="bg-square sq40" x="787.68679" y="175.33752" width="0.79733" height="0.79733" />
        <rect class="bg-square sq41" x="788.65759" y="175.33752" width="0.79733" height="0.79733" />
        <rect class="bg-square sq42" x="789.62839" y="175.33752" width="0.79733" height="0.79733" />
        <rect class="bg-square sq43" x="790.59919" y="175.33752" width="0.79733" height="0.79733" />
        <rect class="bg-square sq44" x="791.56999" y="175.33752" width="0.79733" height="0.79733" />
        <rect class="bg-square sq45" x="792.54079" y="175.33752" width="0.79733" height="0.79733" />
        <rect class="bg-square sq46" x="793.51159" y="175.33752" width="0.79733" height="0.79733" />
        <rect class="bg-square sq47" x="794.48239" y="175.33752" width="0.79733" height="0.79733" />
        <!-- Row 6 -->
        <rect class="bg-square sq48" x="787.68679" y="176.30919" width="0.79733" height="0.79733" />
        <rect class="bg-square sq49" x="788.65759" y="176.30919" width="0.79733" height="0.79733" />
        <rect class="bg-square sq50" x="789.62839" y="176.30919" width="0.79733" height="0.79733" />
        <rect class="bg-square sq51" x="790.59919" y="176.30919" width="0.79733" height="0.79733" />
        <rect class="bg-square sq52" x="791.56999" y="176.30919" width="0.79733" height="0.79733" />
        <rect class="bg-square sq53" x="792.54079" y="176.30919" width="0.79733" height="0.79733" />
        <rect class="bg-square sq54" x="793.51159" y="176.30919" width="0.79733" height="0.79733" />
        <rect class="bg-square sq55" x="794.48239" y="176.30919" width="0.79733" height="0.79733" />

        <!-- "r" letter as outlined squares with diagonal lines (polygon style) -->
        <!-- Row 2: columns 3, 5, 6 -->
        <g class="r-square-group r-sq0">
          <rect x="790.59919" y="172.42253" width="0.79733" height="0.79733" />
          <line x1="790.59919" y1="172.42253" x2="791.39652" y2="173.21986" />
        </g>
        <g class="r-square-group r-sq1">
          <rect x="792.54079" y="172.42253" width="0.79733" height="0.79733" />
          <line x1="792.54079" y1="172.42253" x2="793.33812" y2="173.21986" />
        </g>
        <g class="r-square-group r-sq2">
          <rect x="793.51159" y="172.42253" width="0.79733" height="0.79733" />
          <line x1="793.51159" y1="172.42253" x2="794.30892" y2="173.21986" />
        </g>
        <!-- Row 3: columns 3, 4, 7 -->
        <g class="r-square-group r-sq3">
          <rect x="790.59919" y="173.39419" width="0.79733" height="0.79733" />
          <line x1="790.59919" y1="173.39419" x2="791.39652" y2="174.19152" />
        </g>
        <g class="r-square-group r-sq4">
          <rect x="791.56999" y="173.39419" width="0.79733" height="0.79733" />
          <line x1="791.56999" y1="173.39419" x2="792.36732" y2="174.19152" />
        </g>
        <g class="r-square-group r-sq5">
          <rect x="794.48239" y="173.39419" width="0.79733" height="0.79733" />
          <line x1="794.48239" y1="173.39419" x2="795.27972" y2="174.19152" />
        </g>
        <!-- Row 4: column 3 -->
        <g class="r-square-group r-sq6">
          <rect x="790.59919" y="174.36586" width="0.79733" height="0.79733" />
          <line x1="790.59919" y1="174.36586" x2="791.39652" y2="175.16319" />
        </g>
        <!-- Row 5: column 3 -->
        <g class="r-square-group r-sq7">
          <rect x="790.59919" y="175.33752" width="0.79733" height="0.79733" />
          <line x1="790.59919" y1="175.33752" x2="791.39652" y2="176.13485" />
        </g>
        <!-- Row 6: column 3 -->
        <g class="r-square-group r-sq8">
          <rect x="790.59919" y="176.30919" width="0.79733" height="0.79733" />
          <line x1="790.59919" y1="176.30919" x2="791.39652" y2="177.10652" />
        </g>
      </g>
    </svg>
  `;

  return container;
}

// Function to create the randomized color assembly idle indicator using CSS animations
function createIdleIndicator(): HTMLElement {
  const container = document.createElement("div");
  container.style.cssText = "display: flex; align-items: center; gap: 10px;";
  // Add data-preserve-animation to prevent morphing from interrupting the animation
  container.setAttribute("data-preserve-animation", "true");

  // Create icon container
  const iconContainer = document.createElement("div");
  iconContainer.style.cssText = "width: 24px; height: 21px; flex-shrink: 0;";

  // Generate CSS keyframes for each square with random color cycling
  // Total animation: 8s cycle (4s color cycling, 2s settle to gray, 2s show R)
  const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9', '#F8B500', '#00CED1'];

  // Generate unique random color sequences for each of the 56 squares
  let squareKeyframes = '';
  for (let i = 0; i < 56; i++) {
    // Each square gets ~40 color changes over 4 seconds (every 100ms = 10% of 4s out of 8s = 5%)
    // We'll use 8 keyframe stops for the color cycling phase (0-50% of animation)
    const colorStops = [];
    for (let j = 0; j <= 8; j++) {
      const percent = (j * 50 / 8).toFixed(1);
      const color = colors[Math.floor(Math.random() * colors.length)];
      colorStops.push(`${percent}% { fill: ${color}; fill-opacity: 0.8; }`);
    }
    // Settle phase: transition to gray (50% to 75%)
    const settleDelay = (i * 0.4).toFixed(1); // Staggered settle
    colorStops.push(`${Math.min(50 + parseFloat(settleDelay), 74).toFixed(1)}% { fill: ${colors[Math.floor(Math.random() * colors.length)]}; fill-opacity: 0.8; }`);
    colorStops.push(`${Math.min(52 + parseFloat(settleDelay), 75).toFixed(1)}% { fill: #333333; fill-opacity: 0.15; }`);
    colorStops.push(`100% { fill: #333333; fill-opacity: 0.15; }`);

    squareKeyframes += `
      @keyframes idle-sq${i} {
        ${colorStops.join('\n        ')}
      }
    `;
  }

  iconContainer.innerHTML = `
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 5.761835 5.0342874"
      version="1.1"
      xmlns="http://www.w3.org/2000/svg">
      <defs>
        <style>
          ${squareKeyframes}

          @keyframes idle-r-fade {
            0%, 70% { fill-opacity: 0; }
            80%, 100% { fill-opacity: 1; }
          }

          .idle-bg-square {
            fill: #333333;
            fill-opacity: 0.15;
          }
          ${Array.from({length: 56}, (_, i) => `.idle-sq${i} { animation: idle-sq${i} 8s ease-in-out forwards; }`).join('\n          ')}

          .idle-r-square {
            fill: #333333;
            fill-opacity: 0;
            animation: idle-r-fade 8s ease-in-out forwards;
          }
        </style>
      </defs>
      <g transform="matrix(0.75837457,0,0,0.75837457,-597.36163,-129.28708)">
        <!-- Background grid squares - 8 columns x 7 rows = 56 squares -->
        <!-- Row 0 -->
        <rect class="idle-bg-square idle-sq0" x="787.68679" y="170.47919" width="0.79733" height="0.79733" />
        <rect class="idle-bg-square idle-sq1" x="788.65759" y="170.47919" width="0.79733" height="0.79733" />
        <rect class="idle-bg-square idle-sq2" x="789.62839" y="170.47919" width="0.79733" height="0.79733" />
        <rect class="idle-bg-square idle-sq3" x="790.59919" y="170.47919" width="0.79733" height="0.79733" />
        <rect class="idle-bg-square idle-sq4" x="791.56999" y="170.47919" width="0.79733" height="0.79733" />
        <rect class="idle-bg-square idle-sq5" x="792.54079" y="170.47919" width="0.79733" height="0.79733" />
        <rect class="idle-bg-square idle-sq6" x="793.51159" y="170.47919" width="0.79733" height="0.79733" />
        <rect class="idle-bg-square idle-sq7" x="794.48239" y="170.47919" width="0.79733" height="0.79733" />
        <!-- Row 1 -->
        <rect class="idle-bg-square idle-sq8" x="787.68679" y="171.45086" width="0.79733" height="0.79733" />
        <rect class="idle-bg-square idle-sq9" x="788.65759" y="171.45086" width="0.79733" height="0.79733" />
        <rect class="idle-bg-square idle-sq10" x="789.62839" y="171.45086" width="0.79733" height="0.79733" />
        <rect class="idle-bg-square idle-sq11" x="790.59919" y="171.45086" width="0.79733" height="0.79733" />
        <rect class="idle-bg-square idle-sq12" x="791.56999" y="171.45086" width="0.79733" height="0.79733" />
        <rect class="idle-bg-square idle-sq13" x="792.54079" y="171.45086" width="0.79733" height="0.79733" />
        <rect class="idle-bg-square idle-sq14" x="793.51159" y="171.45086" width="0.79733" height="0.79733" />
        <rect class="idle-bg-square idle-sq15" x="794.48239" y="171.45086" width="0.79733" height="0.79733" />
        <!-- Row 2 -->
        <rect class="idle-bg-square idle-sq16" x="787.68679" y="172.42253" width="0.79733" height="0.79733" />
        <rect class="idle-bg-square idle-sq17" x="788.65759" y="172.42253" width="0.79733" height="0.79733" />
        <rect class="idle-bg-square idle-sq18" x="789.62839" y="172.42253" width="0.79733" height="0.79733" />
        <rect class="idle-bg-square idle-sq19" x="790.59919" y="172.42253" width="0.79733" height="0.79733" />
        <rect class="idle-bg-square idle-sq20" x="791.56999" y="172.42253" width="0.79733" height="0.79733" />
        <rect class="idle-bg-square idle-sq21" x="792.54079" y="172.42253" width="0.79733" height="0.79733" />
        <rect class="idle-bg-square idle-sq22" x="793.51159" y="172.42253" width="0.79733" height="0.79733" />
        <rect class="idle-bg-square idle-sq23" x="794.48239" y="172.42253" width="0.79733" height="0.79733" />
        <!-- Row 3 -->
        <rect class="idle-bg-square idle-sq24" x="787.68679" y="173.39419" width="0.79733" height="0.79733" />
        <rect class="idle-bg-square idle-sq25" x="788.65759" y="173.39419" width="0.79733" height="0.79733" />
        <rect class="idle-bg-square idle-sq26" x="789.62839" y="173.39419" width="0.79733" height="0.79733" />
        <rect class="idle-bg-square idle-sq27" x="790.59919" y="173.39419" width="0.79733" height="0.79733" />
        <rect class="idle-bg-square idle-sq28" x="791.56999" y="173.39419" width="0.79733" height="0.79733" />
        <rect class="idle-bg-square idle-sq29" x="792.54079" y="173.39419" width="0.79733" height="0.79733" />
        <rect class="idle-bg-square idle-sq30" x="793.51159" y="173.39419" width="0.79733" height="0.79733" />
        <rect class="idle-bg-square idle-sq31" x="794.48239" y="173.39419" width="0.79733" height="0.79733" />
        <!-- Row 4 -->
        <rect class="idle-bg-square idle-sq32" x="787.68679" y="174.36586" width="0.79733" height="0.79733" />
        <rect class="idle-bg-square idle-sq33" x="788.65759" y="174.36586" width="0.79733" height="0.79733" />
        <rect class="idle-bg-square idle-sq34" x="789.62839" y="174.36586" width="0.79733" height="0.79733" />
        <rect class="idle-bg-square idle-sq35" x="790.59919" y="174.36586" width="0.79733" height="0.79733" />
        <rect class="idle-bg-square idle-sq36" x="791.56999" y="174.36586" width="0.79733" height="0.79733" />
        <rect class="idle-bg-square idle-sq37" x="792.54079" y="174.36586" width="0.79733" height="0.79733" />
        <rect class="idle-bg-square idle-sq38" x="793.51159" y="174.36586" width="0.79733" height="0.79733" />
        <rect class="idle-bg-square idle-sq39" x="794.48239" y="174.36586" width="0.79733" height="0.79733" />
        <!-- Row 5 -->
        <rect class="idle-bg-square idle-sq40" x="787.68679" y="175.33752" width="0.79733" height="0.79733" />
        <rect class="idle-bg-square idle-sq41" x="788.65759" y="175.33752" width="0.79733" height="0.79733" />
        <rect class="idle-bg-square idle-sq42" x="789.62839" y="175.33752" width="0.79733" height="0.79733" />
        <rect class="idle-bg-square idle-sq43" x="790.59919" y="175.33752" width="0.79733" height="0.79733" />
        <rect class="idle-bg-square idle-sq44" x="791.56999" y="175.33752" width="0.79733" height="0.79733" />
        <rect class="idle-bg-square idle-sq45" x="792.54079" y="175.33752" width="0.79733" height="0.79733" />
        <rect class="idle-bg-square idle-sq46" x="793.51159" y="175.33752" width="0.79733" height="0.79733" />
        <rect class="idle-bg-square idle-sq47" x="794.48239" y="175.33752" width="0.79733" height="0.79733" />
        <!-- Row 6 -->
        <rect class="idle-bg-square idle-sq48" x="787.68679" y="176.30919" width="0.79733" height="0.79733" />
        <rect class="idle-bg-square idle-sq49" x="788.65759" y="176.30919" width="0.79733" height="0.79733" />
        <rect class="idle-bg-square idle-sq50" x="789.62839" y="176.30919" width="0.79733" height="0.79733" />
        <rect class="idle-bg-square idle-sq51" x="790.59919" y="176.30919" width="0.79733" height="0.79733" />
        <rect class="idle-bg-square idle-sq52" x="791.56999" y="176.30919" width="0.79733" height="0.79733" />
        <rect class="idle-bg-square idle-sq53" x="792.54079" y="176.30919" width="0.79733" height="0.79733" />
        <rect class="idle-bg-square idle-sq54" x="793.51159" y="176.30919" width="0.79733" height="0.79733" />
        <rect class="idle-bg-square idle-sq55" x="794.48239" y="176.30919" width="0.79733" height="0.79733" />

        <!-- Solid "r" letter squares -->
        <path
           class="idle-r-square"
           d="m 790.61041,172.43346 v 0 h -0.01 v 0.01 0.77733 0.01 h 0.01 0.77733 0.01 v -0.01 -0.77733 -0.01 h -0.01 z m 1.94333,0 v 0 h -0.01 v 0.01 0.77733 0.01 h 0.01 0.77733 0.01 v -0.01 -0.77733 -0.01 h -0.01 z m 0.97166,0 v 0 h -0.01 v 0.01 0.77733 0.01 h 0.01 0.77733 0.01 v -0.01 -0.77733 -0.01 h -0.01 z m -2.91499,0.97166 v 0 h -0.01 v 0.01 0.77733 0.01 h 0.01 0.77733 0.01 v -0.01 -0.77733 -0.01 h -0.01 z m 0.97167,0 v 0 h -0.01 v 0.01 0.77733 0.01 h 0.01 0.77733 0.01 v -0.01 -0.77733 -0.01 h -0.01 z m 2.91499,0 v 0 h -0.01 v 0.01 0.77733 0.01 h 0.01 0.77733 0.01 v -0.01 -0.77733 -0.01 h -0.01 z m -3.88666,0.97167 v 0 h -0.01 v 0.01 0.77734 0.01 h 0.01 0.77733 0.01 v -0.01 -0.77734 -0.01 h -0.01 z m 0,0.97166 v 0 h -0.01 v 0.01 0.77733 0.01 h 0.01 0.77733 0.01 v -0.01 -0.77733 -0.01 h -0.01 z m 0,0.97167 v 0 h -0.01 v 0.01 0.77733 0.01 h 0.01 0.77733 0.01 v -0.01 -0.77733 -0.01 h -0.01 z"
           aria-label="r" />
      </g>
    </svg>
  `;

  // Create text element
  const textElement = document.createElement("span");
  textElement.style.cssText = "font-size: 13px; font-weight: 300; color: #6b7280;";
  textElement.textContent = "What would you like to do next?";

  // Assemble the container
  container.appendChild(iconContainer);
  container.appendChild(textElement);

  return container;
}

// Initialize widget
const mount = document.getElementById("loading-widget");
if (!mount) throw new Error("Widget mount not found");

// Track current visibility states
let showBubble = false;
let showIdleIndicator = false;

function createWidget(showBubbleOption: boolean, showIdleOption: boolean) {
  // Clear existing content
  mount.innerHTML = "";

  return createAgentExperience(mount, {
    ...DEFAULT_WIDGET_CONFIG,
    apiUrl: proxyUrl,
    launcher: {
      ...DEFAULT_WIDGET_CONFIG.launcher,
      enabled: false,
      width: "100%"
    },
    theme: {
      ...DEFAULT_WIDGET_CONFIG.theme,
      primary: "#1a1a2e",
      accent: "#00ff88",
      surface: "#ffffff"
    },
    copy: {
      ...DEFAULT_WIDGET_CONFIG.copy,
      welcomeTitle: "Custom Loading Demo",
      welcomeSubtitle: "Send a message to see the custom loading indicator!",
      inputPlaceholder: "Type a message..."
    },
    suggestionChips: [
      "Tell me a story",
      "What's the weather like?",
      "Help me plan a trip"
    ],

    // Custom loading indicator configuration
    loadingIndicator: {
      // Control bubble background/border visibility
      showBubble: showBubbleOption,
      render: (context: LoadingIndicatorRenderContext) => {
        // Use custom Runtype loader for standalone indicator
        // Use default bouncing dots for inline (inside message bubble)
        if (context.location === "standalone") {
          return createRuntypeLoader();
        }
        return createTypingIndicator();
      },
      // Idle state indicator - shows when assistant is waiting for next message
      renderIdle: (context: IdleIndicatorRenderContext) => {
        // Only show idle indicator if enabled and after assistant responses
        if (!showIdleOption) return null;
        if (context.lastMessage?.role !== "assistant") return null;
        return createIdleIndicator();
      }
    },

    postprocessMessage: ({ text }) => markdownPostprocessor(text)
  });
}

// Create initial widget
let controller = createWidget(showBubble, showIdleIndicator);

// Set up toggle listeners
const bubbleToggle = document.getElementById("bubble-toggle") as HTMLInputElement | null;
const toggleStatus = document.getElementById("toggle-status");
const idleToggle = document.getElementById("idle-toggle") as HTMLInputElement | null;
const idleToggleStatus = document.getElementById("idle-toggle-status");

function updateToggleStatus(checked: boolean) {
  if (toggleStatus) {
    toggleStatus.textContent = checked
      ? "Bubble: visible (showBubble: true)"
      : "Bubble: hidden (showBubble: false)";
  }
}

function updateIdleToggleStatus(checked: boolean) {
  if (idleToggleStatus) {
    idleToggleStatus.textContent = checked
      ? "Idle indicator: enabled (renderIdle returns element)"
      : "Idle indicator: disabled (renderIdle returns null)";
  }
}

function recreateWidget() {
  controller = createWidget(showBubble, showIdleIndicator);
  // Update window reference
  (window as unknown as { loadingController: typeof controller }).loadingController = controller;
}

if (bubbleToggle) {
  // Set initial state
  bubbleToggle.checked = showBubble;
  updateToggleStatus(showBubble);

  bubbleToggle.addEventListener("change", () => {
    showBubble = bubbleToggle.checked;
    updateToggleStatus(showBubble);
    recreateWidget();
    console.log(`Bubble visibility changed to: ${showBubble}`);
  });
}

if (idleToggle) {
  // Set initial state
  idleToggle.checked = showIdleIndicator;
  updateIdleToggleStatus(showIdleIndicator);

  idleToggle.addEventListener("change", () => {
    showIdleIndicator = idleToggle.checked;
    updateIdleToggleStatus(showIdleIndicator);
    recreateWidget();
    console.log(`Idle indicator changed to: ${showIdleIndicator}`);
  });
}

// Make controller available for debugging
(window as unknown as { loadingController: typeof controller }).loadingController = controller;

console.log("Custom loading indicator demo initialized");
