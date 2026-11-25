#!/usr/bin/env python3
import os
import re
import json

app_dirs = [d for d in os.listdir("src") if os.path.isdir(os.path.join("src", d)) and d != "assets"]

EXTS = {".js", ".ts", ".mjs", ".json", ".html"}
EXCLUDES = {"node_modules", "dist", ".git", ".cf-deploy-dist", "tmp", "vendor", "tests", "fixtures", "e2e", "test"}

# Patterns matching user-facing strings or file open/save
UI_PATTERNS = [
    re.compile(r"从\s*Puter", re.I),
    re.compile(r"保存到\s*Puter", re.I),
    re.compile(r"在\s*Puter", re.I),
    re.compile(r"另存为.*Puter", re.I),
    re.compile(r"Puter\s*(云端|云盘|账户|账号|存储|版本|文件)", re.I),
    re.compile(r"登录\s*Puter", re.I),
    re.compile(r"连接\s*Puter", re.I),
    re.compile(r"由\s*Puter", re.I),
    re.compile(r"Open from Puter", re.I),
    re.compile(r"Save to Puter", re.I),
    re.compile(r"Save a copy to Puter", re.I),
    re.compile(r"Save As.*Puter", re.I),
    re.compile(r"Powered by Puter", re.I),
    re.compile(r"Puter drive", re.I),
    re.compile(r"Puter account", re.I),
    re.compile(r"Sign in with Puter", re.I),
]

results = {}

for app in sorted(app_dirs):
    app_path = os.path.join("src", app)
    app_hits = []
    for root, dirs, files in os.walk(app_path):
        dirs[:] = [d for d in dirs if d not in EXCLUDES]
        for f in files:
            if any(f.endswith(ext) for ext in EXTS):
                p = os.path.join(root, f)
                try:
                    with open(p, "r", encoding="utf-8", errors="ignore") as fh:
                        lines = fh.readlines()
                    for line_no, line in enumerate(lines, 1):
                        trimmed = line.strip()
                        if trimmed.startswith("//") or trimmed.startswith("/*") or trimmed.startswith("*"):
                            continue
                        for pat in UI_PATTERNS:
                            if pat.search(trimmed):
                                app_hits.append({
                                    "file": os.path.relpath(p, app_path),
                                    "line": line_no,
                                    "text": trimmed
                                })
                                break
                except Exception as e:
                    pass
    if app_hits:
        results[app] = app_hits

print(f"Total apps with user-facing Puter strings: {len(results)}\n")
for app, hits in sorted(results.items(), key=lambda x: -len(x[1])):
    print(f"=== {app}: {len(hits)} hits ===")
    for h in hits[:8]:
        print(f"  {h['file']}:{h['line']} | {h['text'][:120]}")
    if len(hits) > 8:
        print(f"  ... and {len(hits) - 8} more in {app}")
    print()

with open("scripts/audit_results.json", "w", encoding="utf-8") as out:
    json.dump(results, out, ensure_ascii=False, indent=2)
print("Saved complete audit report to scripts/audit_results.json")
