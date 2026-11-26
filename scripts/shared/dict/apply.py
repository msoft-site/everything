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
print('ok', {k: len(v) for k, v in dicts.items()})
