#!/usr/bin/env python3
"""Regenerate the EXTRA_DICT region of everything-internal-runtime.js from scripts/shared/dict/*.json + patterns.js"""
import json, glob, os, re
root = os.path.dirname(os.path.abspath(__file__))
rt = os.path.join(root, '..', 'everything-internal-runtime.js')
dicts = {}
for f in sorted(glob.glob(os.path.join(root, '*.json'))):
    d = json.load(open(f, encoding='utf-8'))
    for k, v in list(d.items()):
        for suf in ('...', '…', ':', '：'):
            if k.endswith(suf):
                base = k[:-len(suf)].rstrip()
                d.setdefault(base, v[:-1].rstrip() if v.endswith(('…', ':', '：')) else v)
    dicts[os.path.basename(f)[:-5]] = d
pat = open(os.path.join(root, 'patterns.js'), encoding='utf-8').read()
block = "/* EXTRA_DICT_BEGIN */\n  const EXTRA_DICTS = " + json.dumps(dicts, ensure_ascii=False, separators=(',', ':')) + ";\n  const APP_ID = (typeof location !== 'undefined' && (location.pathname.match(/\\/app\\/([^/]+)/) || [])[1]) || '';\n  if (EXTRA_DICTS[APP_ID]) Object.assign(UI_DICTIONARY, EXTRA_DICTS[APP_ID]);\n  " + pat.strip().replace('\n', '\n  ') + "\n  /* EXTRA_DICT_END */"
s = open(rt, encoding='utf-8').read()
s2 = re.sub(r'/\* EXTRA_DICT_BEGIN \*/.*?/\* EXTRA_DICT_END \*/', lambda m: block, s, flags=re.S)
open(rt, 'w', encoding='utf-8').write(s2)

cf_dist = os.path.join(root, '..', '..', '..', '.cf-deploy-dist')
if os.path.isdir(cf_dist):
    assets_rt = os.path.join(cf_dist, 'assets', 'everything-internal-runtime.js')
    if os.path.exists(os.path.dirname(assets_rt)):
        open(assets_rt, 'w', encoding='utf-8').write(s2)
    inline_tag = f'<script id="everything-internal-runtime-inline">\n{s2}\n</script>'
    for html_file in glob.glob(os.path.join(cf_dist, 'app', '*', 'index.html')) + glob.glob(os.path.join(cf_dist, '*.html')):
        try:
            content = open(html_file, encoding='utf-8').read()
            if 'id="everything-internal-runtime-inline"' in content:
                new_content = re.sub(r'<script id="everything-internal-runtime-inline">[\s\S]*?</script>', lambda m: inline_tag, content)
            elif '<head>' in content:
                new_content = content.replace('<head>', f'<head>\n  {inline_tag}')
            else:
                new_content = f'{inline_tag}\n{content}'
            # Also clean external puter script
            new_content = re.sub(r'<script\b[^>]*src=["\']https://js\.puter\.com/[^"\']*["\'][^>]*></script>', '<!-- [Internal Puter Runtime Active] -->', new_content)
            open(html_file, 'w', encoding='utf-8').write(new_content)
        except Exception as e:
            print('error updating', html_file, e)

print('ok', {k: len(v) for k, v in dicts.items()})
