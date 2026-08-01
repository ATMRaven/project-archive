import re

css_path = r'z:\code\vibe code\projects\style.css'
with open(css_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace .card__title { ... } in mobile block
title_match = re.search(r'\.card__title\s*\{[^\}]+white-space:\s*normal\s*!important;', content)
if title_match:
    content = content[:title_match.end()] + '\n    word-break: break-word !important;\n    overflow-wrap: break-word !important;' + content[title_match.end():]
else:
    print("title not found")

# Replace .card__url { ... max-width: none !important; } in mobile block
url_match = re.search(r'\.card__url\s*\{[^\}]+max-width:\s*none\s*!important;', content)
if url_match:
    start = url_match.start()
    end = url_match.end()
    # Replace 'max-width: none !important;' with 'max-width: 100% !important;'
    substr = content[start:end].replace('max-width: none !important;', 'max-width: 100% !important;\n    word-break: break-all !important;\n    overflow-wrap: break-word !important;\n    white-space: normal !important;')
    content = content[:start] + substr + content[end:]
else:
    print("url not found")

# Replace .card { ... display: block !important; } in mobile block
card_match = re.search(r'\.card\s*\{[^\}]+display:\s*block\s*!important;', content)
if card_match:
    content = content[:card_match.end()] + '\n    max-width: 100% !important;\n    overflow: hidden !important;' + content[card_match.end():]
else:
    print("card not found")

# Replace .card__head { ... display: flex !important; } in mobile block
head_match = re.search(r'\.card__head\s*\{[^\}]+display:\s*flex\s*!important;', content)
if head_match:
    content = content[:head_match.end()] + '\n    flex-wrap: wrap !important;' + content[head_match.end():]
else:
    print("head not found")

with open(css_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Replacement complete.")
