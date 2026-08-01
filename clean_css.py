import re

css_path = r'z:\code\vibe code\projects\style.css'
with open(css_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Let's clean up the duplicated .card rules
# A clean .card definition should look like:
clean_card_mobile = '''  .card {
    border-radius: 20px !important;
    background: var(--surface) !important;
    border: 1px solid var(--border) !important;
    box-shadow: var(--shadow-soft) !important;
    display: block !important;
    min-width: 0 !important;
    max-width: 100% !important;
    overflow: hidden !important;
  }'''

# Replace whatever mess of duplicated attributes in the mobile query's .card block
mobile_query_match = re.search(r'@media \(max-width: 768px\) \{.*', content, re.DOTALL)
if mobile_query_match:
    mobile_css = mobile_query_match.group(0)
    # Find the .card selector inside the mobile block and clean it up
    cleaned_mobile = re.sub(r'\.card\s*\{[^}]*?\}', clean_card_mobile, mobile_css, count=1)
    content = content[:mobile_query_match.start()] + cleaned_mobile

# Let's clean up the top-level .card definition (in the desktop/global scope)
# It should look like:
clean_card_global = '''.card {
  min-width: 0;
  max-width: 100%;
  overflow-wrap: break-word;
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
}'''

# Find the first .card definition globally and replace it
content = re.sub(r'\.card\s*\{[^}]*?position:\s*relative;[^}]*?z-index:\s*1;[^}]*?\}', clean_card_global, content, count=1)

with open(css_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("CSS cleaned up.")
