with open(r'z:\code\vibe code\projects\style.css', 'r', encoding='utf-8') as f:
    css = f.read()

# Fix grid-template-columns: 1fr in 640px media query
css = css.replace('.grid { grid-template-columns: 1fr; }', '.grid { grid-template-columns: minmax(0, 1fr) !important; }')

# Fix minimal view grid columns blowout
css = css.replace('grid-template-columns: 1fr auto;', 'grid-template-columns: minmax(0, 1fr) auto !important;')

with open(r'z:\code\vibe code\projects\style.css', 'w', encoding='utf-8') as f:
    f.write(css)

print("Grid blowout fixes applied to minimal view and 640px query.")
