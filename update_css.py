import re

css_path = r'z:\code\vibe code\projects\style.css'
with open(css_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace :root block
root_pattern = r':root \{(.*?)\}'
new_root = '''
  color-scheme: dark;

  --bg: #050507;
  --bg-elevated: #0f0f13;
  --surface: rgba(255, 255, 255, 0.03);
  --surface-hover: rgba(255, 255, 255, 0.08);
  --border: rgba(255, 255, 255, 0.06);
  --border-strong: rgba(255, 255, 255, 0.14);
  --border-glow: rgba(201, 168, 118, 0.4);

  --text-primary: #f8f6f0;
  --text-secondary: #a0a0ab;
  --text-tertiary: #6e6e76;

  --accent: #d4b484;
  --accent-bright: #f0d5a8;
  --accent-wash: rgba(212, 180, 132, 0.12);
  --accent-glow: rgba(212, 180, 132, 0.35);

  --emerald: #6fcf97;
  --danger: #e5766b;
  --danger-bright: #f29289;

  --shadow-soft: 0 2px 8px rgba(0, 0, 0, 0.4), 0 16px 32px -8px rgba(0, 0, 0, 0.6);
  --shadow-lift: 0 8px 24px rgba(0, 0, 0, 0.4), 0 32px 64px -12px rgba(0, 0, 0, 0.8), 0 0 20px rgba(212, 180, 132, 0.15);

  --font-display: "Fraunces", Georgia, serif;
  --font-body: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;

  --ease: cubic-bezier(0.2, 1, 0.3, 1);
  --radius-lg: 24px;
  --radius-md: 14px;
  --radius-sm: 8px;
'''
content = re.sub(root_pattern, f':root {{{new_root}}}', content, count=1, flags=re.DOTALL)


# Replace ambient background
ambient_pattern = r'/\* ==========================================================================\s*Ambient background — signature element\s*========================================================================== \*/.*?/\* ==========================================================================\s*Header\s*========================================================================== \*/'
new_ambient = '''/* ==========================================================================
   Ambient background — signature element
   ========================================================================== */
.ambient {
  position: fixed;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
  background: radial-gradient(circle at top right, rgba(212, 180, 132, 0.05), transparent 40%),
              radial-gradient(circle at bottom left, rgba(120, 90, 200, 0.04), transparent 40%);
}

.ambient__glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(120px);
  opacity: 0.6;
  animation: drift 20s ease-in-out infinite alternate;
  will-change: transform;
}
.ambient__glow--one {
  width: 700px;
  height: 700px;
  top: -200px;
  right: -200px;
  background: radial-gradient(circle, var(--accent-glow), transparent 60%);
  animation-duration: 25s;
}

.ambient__glow--two {
  width: 600px;
  height: 600px;
  bottom: -150px;
  left: -150px;
  background: radial-gradient(circle, rgba(140, 100, 255, 0.15), transparent 60%);
  animation-delay: -5s;
}

@keyframes drift {
  0% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(-30px, 40px) scale(1.05); }
  100% { transform: translate(20px, -20px) scale(0.95); }
}

:root[data-theme="light"] .ambient__glow,
:root:not([data-theme="dark"]) .ambient__glow {
  opacity: 0.45;
}

.ambient__grain {
  position: absolute;
  inset: 0;
  opacity: 0.04;
  mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}

/* ==========================================================================
   Header
   ========================================================================== */
'''
content = re.sub(ambient_pattern, new_ambient, content, flags=re.DOTALL)


# Replace .card definition
card_pattern = r'\.card \{[\s\S]*?/\* Body \*/'
new_card = '''.card {
  position: relative;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  box-shadow: var(--shadow-soft);
  overflow: hidden;
  opacity: 0;
  transform: translateY(16px);
  animation: card-in 400ms var(--ease) forwards;
  transition: transform 400ms var(--ease), box-shadow 400ms var(--ease), border-color 400ms var(--ease), background 400ms var(--ease);
  z-index: 1;
}

/* Ultra-premium glass gradient reflection */
.card::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  background: linear-gradient(135deg, rgba(255,255,255,0.08) 0%, transparent 40%, transparent 60%, rgba(255,255,255,0.03) 100%);
  z-index: 4;
}

.card:hover {
  transform: translateY(-6px) scale(1.02);
  border-color: var(--border-glow);
  box-shadow: var(--shadow-lift);
  background: var(--surface-hover);
  z-index: 2;
}

/* Thumbnail */
.card__thumb {
  width: 100%;
  aspect-ratio: 16 / 9;
  height: 200px;
  max-height: 220px;
  background: radial-gradient(circle at 50% 50%, var(--bg-elevated) 0%, var(--bg) 100%);
  overflow: hidden;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border-bottom: 1px solid var(--border);
}
.card__thumb-fallback {
  position: absolute;
  font-family: var(--font-display);
  font-size: 42px;
  font-weight: 600;
  color: var(--accent);
  opacity: 0.2;
  user-select: none;
  pointer-events: none;
  z-index: 1;
}
.card__thumb::before {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(110deg, transparent 20%, rgba(255,255,255,0.06) 50%, transparent 80%);
  animation: shimmer 2s ease infinite;
  z-index: 2;
  pointer-events: none;
}
@keyframes shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
.card__thumb-img {
  width: 100%;
  height: 100%;
  max-height: 220px;
  object-fit: cover;
  object-position: top center;
  display: block;
  transition: transform 600ms cubic-bezier(0.2, 1, 0.3, 1), opacity 500ms ease;
  opacity: 0;
  position: relative;
  z-index: 3;
}
:root[data-theme="dark"] .card__thumb-img,
:root:not([data-theme="light"]) .card__thumb-img {
  filter: brightness(0.9) contrast(1.05);
}
.card__thumb-img.loaded {
  opacity: 1;
}
.card:hover .card__thumb-img {
  transform: scale(1.06);
}

/* corner brackets — remove because we use ::after for glass gradient reflection now */
.card::before { display: none; }

/* Body */'''
content = re.sub(card_pattern, new_card, content, flags=re.DOTALL)


# Replace Mobile section
mobile_pattern = r'/\* ============================================================================\s*ULTRA-PREMIUM MOBILE ARCHITECTURE & APP EXPERIENCE\s*============================================================================ \*/[\s\S]*'
new_mobile = '''/* ============================================================================
   ULTRA-PREMIUM MOBILE ARCHITECTURE & APP EXPERIENCE
   ============================================================================ */
@media (max-width: 768px) {
  /* Prevent iOS/Android Safari Auto-Zoom */
  input[type="text"],
  input[type="password"],
  input[type="url"],
  input[type="email"],
  select,
  textarea {
    font-size: 16px !important;
  }

  body {
    padding-top: max(16px, env(safe-area-inset-top));
    padding-bottom: max(32px, env(safe-area-inset-bottom));
  }

  .wrap {
    padding-left: 20px;
    padding-right: 20px;
  }

  /* Compact Mobile Header */
  .site-header {
    padding: 24px 0 16px !important;
  }
  .site-header__top {
    margin-bottom: 16px !important;
  }
  .site-logo {
    width: 40px !important;
    height: 40px !important;
  }
  .site-title {
    font-size: 32px !important;
    letter-spacing: -0.02em;
  }
  .site-subtitle {
    font-size: 15px !important;
    line-height: 1.5 !important;
    margin-top: 8px !important;
    color: var(--text-secondary);
  }

  /* Mobile Sticky Glassmorphic Filter & Search Bar */
  .filter-bar {
    position: sticky;
    top: 0;
    z-index: 30;
    background: rgba(5, 5, 7, 0.85); /* Slightly transparent for glass effect */
    padding: 16px 0 12px;
    margin-bottom: 24px;
    margin-left: -20px;
    margin-right: -20px;
    padding-left: 20px;
    padding-right: 20px;
    border-bottom: 1px solid var(--border);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
  }

  :root[data-theme="light"] .filter-bar,
  :root:not([data-theme="dark"]) .filter-bar {
    background: rgba(250, 249, 246, 0.85);
  }

  .search-box {
    margin-bottom: 12px;
  }
  .search-box input {
    height: 48px;
    border-radius: 14px;
    font-size: 16px !important;
    padding-left: 44px;
    background: var(--bg-elevated);
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  }

  /* Category Chips - Fluid Touch Carousel */
  .category-chips {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    scroll-snap-type: x mandatory;
    padding: 2px 2px 8px 2px;
    scrollbar-width: none;
  }
  .category-chips::-webkit-scrollbar {
    display: none;
  }
  .chip {
    scroll-snap-align: start;
    flex-shrink: 0;
    height: 40px;
    padding: 0 18px;
    font-size: 14px;
    border-radius: 20px;
    white-space: nowrap;
    background: var(--surface);
    border: 1px solid var(--border);
    transition: all 200ms var(--ease);
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .chip:active {
    transform: scale(0.95);
  }
  .chip.is-active {
    background: var(--accent);
    color: #0b0c10;
    border-color: var(--accent);
    font-weight: 600;
    box-shadow: 0 4px 16px var(--accent-glow);
  }

  /* Mobile Toolbar Controls */
  .toolbar {
    flex-direction: column;
    align-items: stretch;
    gap: 16px;
    margin-bottom: 20px;
  }
  .toolbar__left {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    justify-content: space-between;
  }

  /* Admin Toolbar on Mobile */
  .admin-toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    overflow-x: auto;
    padding: 4px 0;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }
  .admin-toolbar::-webkit-scrollbar {
    display: none;
  }
  .admin-toolbar .btn {
    flex-shrink: 0;
    height: 44px;
    font-size: 14px;
    padding: 0 16px;
    border-radius: 12px;
    white-space: nowrap;
  }

  /* Full Stacked Card Layout for Mobile */
  .grid {
    display: grid !important;
    grid-template-columns: 1fr !important;
    gap: 24px !important;
  }
  .grid[data-view="minimal"] {
    gap: 16px !important;
  }

  .card {
    border-radius: 20px !important;
    background: var(--surface) !important;
    border: 1px solid var(--border) !important;
    box-shadow: var(--shadow-soft) !important;
    display: block !important;
  }
  .card:active {
    transform: scale(0.98);
  }

  .card__thumb {
    width: 100% !important;
    border-top-left-radius: 20px;
    border-top-right-radius: 20px;
    height: 220px !important;
    max-height: 220px !important;
    border-bottom: 1px solid var(--border);
    margin: 0 !important;
  }

  .card__body {
    padding: 24px 20px !important;
    display: block !important;
  }

  .card__head {
    margin-bottom: 12px !important;
    display: flex !important;
  }

  .card__title {
    font-size: 22px !important;
    font-weight: 600 !important;
    line-height: 1.3 !important;
    white-space: normal !important;
  }

  .card__desc {
    font-size: 15px !important;
    line-height: 1.6 !important;
    margin-bottom: 24px !important;
    color: var(--text-secondary) !important;
    display: block !important;
    -webkit-line-clamp: unset !important;
    overflow: visible !important;
  }

  .card__links {
    display: flex !important;
    align-items: center !important;
    gap: 12px !important;
  }
  .card__url {
    font-size: 14px !important;
    padding: 8px 0;
    max-width: none !important;
  }

  .icon-btn {
    width: 44px;
    height: 44px;
    border-radius: 12px;
  }
  .icon-btn svg {
    width: 20px;
    height: 20px;
  }
  
  .card__admin-controls {
    display: flex !important;
  }

  /* Native iOS/Android Bottom-Sheet Modals */
  .modal-overlay {
    align-items: flex-end;
    padding: 0;
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    background: rgba(0, 0, 0, 0.65);
  }

  .modal {
    width: 100% !important;
    max-width: 100% !important;
    border-bottom-left-radius: 0 !important;
    border-bottom-right-radius: 0 !important;
    border-top-left-radius: 32px !important;
    border-top-right-radius: 32px !important;
    max-height: 90vh;
    overflow-y: auto;
    padding: 32px 24px max(32px, env(safe-area-inset-bottom));
    box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.6);
    border-top: 1px solid var(--border-strong);
    animation: sheetSlideUp 400ms cubic-bezier(0.2, 1, 0.3, 1) forwards;
  }

  /* Drag handle at top of bottom sheets */
  .modal::before {
    content: "";
    display: block;
    width: 40px;
    height: 5px;
    background: var(--border-strong);
    border-radius: 4px;
    margin: 0 auto 24px;
  }

  @keyframes sheetSlideUp {
    from { transform: translateY(100%); }
    to { transform: translateY(0); }
  }

  /* AI Assistant Chat Drawer Mobile Fitting */
  .modal--ai {
    height: 92vh !important;
    display: flex;
    flex-direction: column;
  }
  .ai-chat {
    flex: 1;
    max-height: none !important;
  }
  .ai-msg {
    max-width: 90%;
    font-size: 15px;
  }
  .ai-input-bar {
    margin-top: 16px;
    height: 56px;
  }
  .ai-input {
    font-size: 16px !important;
  }
}
'''
content = re.sub(mobile_pattern, new_mobile, content, flags=re.DOTALL)


with open(css_path, 'w', encoding='utf-8') as f:
    f.write(content)

print('CSS Updated successfully.')
