#!/usr/bin/env python3
import os
import io
import sys
from pathlib import Path

try:
    import markdown
except Exception:
    print("Missing 'markdown' package. Please run: python3 -m pip install --user markdown")
    sys.exit(2)

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / '_site'
INCLUDES = ROOT / '_includes'

def read_include(name):
    p = INCLUDES / name
    if p.exists():
        return p.read_text(encoding='utf-8')
    return ''

HEADER = read_include('header.html')
FOOTER = read_include('footer.html')

HTML_TMPL = '''<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>{title}</title>
  <link rel="icon" type="image/svg+xml" href="/assets/img/favicon.svg">
  <link rel="stylesheet" href="/assets/css/styles.css">
</head>
<body>
{header}
<main id="content" class="site-main container">{content}</main>
{footer}
</body>
</html>'''

def parse_front_matter(text):
    title = ''
    description = ''
    body = text
    if text.startswith('---'):
        parts = text.split('---', 2)
        if len(parts) >= 3:
            fm = parts[1]
            body = parts[2]
            for line in fm.splitlines():
                if ':' in line:
                    k, v = line.split(':', 1)
                    k = k.strip()
                    v = v.strip().strip('"')
                    if k == 'title':
                        title = v
                    if k == 'description':
                        description = v
    return title or 'Jugaad Labs', description, body

def render_md(md_text):
    return markdown.markdown(md_text, extensions=['fenced_code', 'codehilite', 'tables'])

def build():
    SITE.mkdir(exist_ok=True)
    # copy assets directory if exists
    assets_src = ROOT / 'assets'
    assets_dst = SITE / 'assets'
    if assets_src.exists():
        import shutil
        if assets_dst.exists():
            shutil.rmtree(assets_dst)
        shutil.copytree(assets_src, assets_dst)

    # process markdown files in root
    for md in ROOT.glob('*.md'):
        text = md.read_text(encoding='utf-8')
        title, desc, body = parse_front_matter(text)
        html = render_md(body)
        out_html = HTML_TMPL.format(title=title, header=HEADER, content=html, footer=FOOTER)
        out_path = SITE / (md.stem + '.html' if md.name != 'index.md' else 'index.html')
        out_path.write_text(out_html, encoding='utf-8')
        print('Wrote', out_path)

    print('Build complete. Site at', SITE)

if __name__ == '__main__':
    build()
