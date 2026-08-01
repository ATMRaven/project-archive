with open(r'z:\code\vibe code\projects\style.css', 'r', encoding='utf-8') as f:
    css = f.read()

# Replace minimal card url styling to add wrap rules
old_rules = '''.grid[data-view="minimal"] .card__url {
    grid-column: 1;
    grid-row: 2;
    font-size: 13px;
    margin-top: 2px;
  }'''

new_rules = '''.grid[data-view="minimal"] .card__url {
    grid-column: 1;
    grid-row: 2;
    font-size: 13px;
    margin-top: 2px;
    word-break: break-all !important;
    overflow-wrap: break-word !important;
    white-space: normal !important;
    max-width: 100% !important;
  }'''

if old_rules in css:
    css = css.replace(old_rules, new_rules)
    print("Minimal URL rules updated.")
else:
    # Try with different spacings
    import re
    pattern = r'\.grid\[data-view="minimal"\]\s+\.card__url\s*\{\s*grid-column:\s*1;\s*grid-row:\s*2;\s*font-size:\s*13px;\s*margin-top:\s*2px;\s*\}'
    if re.search(pattern, css):
        css = re.sub(pattern, new_rules, css)
        print("Minimal URL rules updated via regex.")
    else:
        print("Minimal URL rules NOT found.")

with open(r'z:\code\vibe code\projects\style.css', 'w', encoding='utf-8') as f:
    f.write(css)
