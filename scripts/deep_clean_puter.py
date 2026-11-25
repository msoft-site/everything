#!/usr/bin/env python3
import os
import re

EXCLUDES = {"node_modules", "dist", ".git", ".cf-deploy-dist", "tmp", "vendor", "tests", "fixtures", "e2e", "test"}
EXTS = {".js", ".ts", ".mjs", ".json", ".html"}

# Specific regexes or literal replacements
REPLACEMENTS = [
    # Chinese UI actions
    (re.compile(r"从\s*Puter\s*打开…?", re.I), "从本地打开…"),
    (re.compile(r"从\s*Puter\s*打开", re.I), "从本地打开"),
    (re.compile(r"从\s*Puter…", re.I), "从本地…"),
    (re.compile(r"保存到\s*Puter…?", re.I), "保存到本地"),
    (re.compile(r"在\s*Puter\s*中保存副本", re.I), "另存为本地副本"),
    (re.compile(r"另存为\s*Puter\s*副本", re.I), "另存为本地副本"),
    (re.compile(r"保存到\s*Puter\s*云盘", re.I), "保存到本地存储"),
    (re.compile(r"保存到\s*Puter\s*云端", re.I), "保存到本地存储"),
    (re.compile(r"从您的\s*Puter\s*云盘打开文件", re.I), "打开本地文件"),
    (re.compile(r"从\s*Puter\s*云端打开", re.I), "从本地打开"),
    (re.compile(r"在新\s*Puter\s*标签页中打开", re.I), "在新标签页中打开"),
    (re.compile(r"打开\s*Puter\s*版本", re.I), "打开本地存储版本"),
    (re.compile(r"在\s*Puter\s*中打开", re.I), "在本地打开"),

    # Chinese Auth / Account / System
    (re.compile(r"使用\s*Puter\s*登录以打开该空间", re.I), "打开本地空间"),
    (re.compile(r"请使用\s*Puter\s*登录以继续", re.I), "请登录账户以继续"),
    (re.compile(r"使用\s*Puter\s*登录", re.I), "登录账户"),
    (re.compile(r"登录\s*Puter", re.I), "登录账户"),
    (re.compile(r"连接\s*Puter", re.I), "连接本地环境"),
    (re.compile(r"由\s*Puter\s*提供技术支持", re.I), ""),
    (re.compile(r"由\s*Puter\s*提供支持", re.I), ""),
    (re.compile(r"由\s*Puter", re.I), "由本地"),
    (re.compile(r"正在等待\s*Puter…?", re.I), "正在加载本地工作区…"),
    (re.compile(r"正在等待\s*Puter\.\.\.", re.I), "正在加载本地工作区..."),
    (re.compile(r"Puter\s*SDK\s*加载失败[，,]?\s*请检查网络连接后重试[。.]?", re.I), "本地环境加载失败，请刷新重试。"),
    (re.compile(r"Puter\s*不可用[。.]?\s*请检查您的网络连接后重试[。.]?", re.I), "本地服务暂不可用，请重试。"),
    (re.compile(r"无法连接到\s*Puter", re.I), "无法连接到本地存储服务"),
    (re.compile(r"无法连接\s*Puter", re.I), "无法连接本地存储服务"),
    (re.compile(r"您的最新更改无法同步到\s*Puter", re.I), "您的最新更改尚未保存到本地"),
    (re.compile(r"同步到\s*Puter", re.I), "保存到本地"),
    (re.compile(r"Puter\s*云端", re.I), "本地存储"),
    (re.compile(r"Puter\s*云盘", re.I), "本地驱动器"),
    (re.compile(r"Puter\s*账户", re.I), "本地账户"),
    (re.compile(r"Puter\s*账号", re.I), "本地账户"),
    (re.compile(r"Puter\s*用户", re.I), "本地用户"),
    (re.compile(r"Puter\s*用户名", re.I), "用户名"),
    (re.compile(r"您的\s*Puter\s*存储空间已满", re.I), "您的本地存储空间已满"),
    (re.compile(r"Puter\s*存储空间已满", re.I), "本地存储空间已满"),
    (re.compile(r"Puter\s*AI", re.I), "本地智能引擎"),
    (re.compile(r"Puter\s*模型", re.I), "本地智能模型"),

    # English UI actions
    (re.compile(r"Open from Puter…?", re.I), "Open from Local…"),
    (re.compile(r"Open from Puter", re.I), "Open from Local"),
    (re.compile(r"Add from Puter", re.I), "Add from Local"),
    (re.compile(r"Save to Puter…?", re.I), "Save to Local"),
    (re.compile(r"Save to Puter", re.I), "Save to Local"),
    (re.compile(r"Saving to Puter…?", re.I), "Saving to Local…"),
    (re.compile(r"Save a copy to Puter", re.I), "Save a copy to Local"),
    (re.compile(r"Save a Copy in Puter", re.I), "Save a copy to Local"),
    (re.compile(r"Save a copy in Puter", re.I), "Save a copy to Local"),
    (re.compile(r"Save a copy in your Puter", re.I), "Save a copy in your Local Storage"),
    (re.compile(r"Save As\.\.\. Puter", re.I), "Save As... Local"),
    (re.compile(r"Save As Puter", re.I), "Save As Local"),
    (re.compile(r"Save to your Puter", re.I), "Save to Local Storage"),
    (re.compile(r"Save to Puter cloud", re.I), "Save to Local Storage"),
    (re.compile(r"Open in Puter", re.I), "Open in Local"),
    (re.compile(r"Powered by Puter\.?", re.I), ""),

    # English Auth / Account / System
    (re.compile(r"Sign in with Puter", re.I), "Sign in"),
    (re.compile(r"Signed in with Puter", re.I), "Signed in"),
    (re.compile(r"Signed in through Puter", re.I), "Signed in"),
    (re.compile(r"Sign in to Puter", re.I), "Sign in"),
    (re.compile(r"Connectez-vous avec Puter", re.I), "Connectez-vous"),
    (re.compile(r"Puter user", re.I), "Local user"),
    (re.compile(r"Puter username", re.I), "Username"),
    (re.compile(r"Enter a Puter username", re.I), "Enter a username"),
    (re.compile(r"Invite by Puter username", re.I), "Invite by username"),
    (re.compile(r"their Puter username", re.I), "their username"),
    (re.compile(r"your Puter username", re.I), "your username"),
    (re.compile(r"anyone signed in to Puter", re.I), "anyone signed in"),
    (re.compile(r"Anyone signed in to Puter", re.I), "Anyone signed in"),
    (re.compile(r"signed in to Puter", re.I), "signed in"),
    (re.compile(r"signed into Puter", re.I), "signed in"),

    # English Error / Readiness
    (re.compile(r"Could not reach Puter", re.I), "Could not reach storage service"),
    (re.compile(r"Couldn['’]t reach Puter", re.I), "Could not reach storage service"),
    (re.compile(r"Waiting for Puter…?", re.I), "Loading local workspace…"),
    (re.compile(r"waiting to reach Puter", re.I), "loading local workspace"),
    (re.compile(r"The Puter SDK failed to load\.? Check your connection and try again\.?", re.I), "Local storage engine failed to load. Please reload."),
    (re.compile(r"The Puter SDK did not load\.? Check your connection or content blockers, then reload\.?", re.I), "Local storage engine did not load. Please reload."),
    (re.compile(r"Offline:\s*Puter SDK not loaded", re.I), "Offline: Local storage not ready"),
    (re.compile(r"Offline:\s*Puter is unreachable", re.I), "Offline: Local storage unreachable"),
    (re.compile(r"Puter could not be loaded", re.I), "Storage service could not be loaded"),
    (re.compile(r"Puter could not be reached", re.I), "Storage service could not be reached"),
    (re.compile(r"Puter\.js could not be loaded", re.I), "Storage engine could not be loaded"),
    (re.compile(r"Puter\.js is not available", re.I), "Storage engine is not available"),
    (re.compile(r"Something went wrong talking to Puter\.?", re.I), "Could not connect to storage service."),
    (re.compile(r"talking to your Puter cloud", re.I), "talking to your local storage"),
    (re.compile(r"Something went wrong talking to your Puter cloud", re.I), "Something went wrong accessing local storage"),
    (re.compile(r"Your Puter storage is full", re.I), "Your local storage is full"),
    (re.compile(r"Newer copy in Puter", re.I), "Newer copy in local storage"),
    (re.compile(r"A newer copy of this board is saved in Puter", re.I), "A newer copy of this board is saved in local storage"),
    (re.compile(r"Your files remain in Puter", re.I), "Your files remain in local storage"),
    (re.compile(r"from Puter", re.I), "from local storage"),
    (re.compile(r"into Puter", re.I), "into local storage"),
    (re.compile(r"kept with the record in your own Puter cloud", re.I), "kept with the record in your own local storage"),
    (re.compile(r"in your own Puter cloud", re.I), "in your own local storage"),
    (re.compile(r"in your Puter cloud", re.I), "in your local storage"),
    (re.compile(r"Puter cloud", re.I), "local storage"),
    (re.compile(r"Puter drive", re.I), "local drive"),
    (re.compile(r"Puter files", re.I), "local files"),
    (re.compile(r"Puter account", re.I), "local account"),
    (re.compile(r"Puter session", re.I), "local session"),
    (re.compile(r"Puter['’]s AI", re.I), "local AI"),
]

changed_files = 0
total_replacements = 0

for root, dirs, files in os.walk("src"):
    dirs[:] = [d for d in dirs if d not in EXCLUDES]
    for f in files:
        if any(f.endswith(ext) for ext in EXTS):
            p = os.path.join(root, f)
            rel = os.path.relpath(p, "src")
            # Don't touch compiled worker artifacts
            if "public/worker/" in rel or rel.startswith("*/worker/"):
                continue
            try:
                with open(p, "r", encoding="utf-8") as fh:
                    content = fh.read()
            except Exception:
                continue

            new_content = content
            file_repls = 0
            for pat, repl in REPLACEMENTS:
                matches = len(pat.findall(new_content))
                if matches > 0:
                    # Be careful not to replace puter API calls like puter.fs, puter.kv, puter.auth, etc.
                    # Notice our regexes are mostly multi-word user phrases
                    new_content = pat.sub(repl, new_content)
                    file_repls += matches

            if new_content != content:
                with open(p, "w", encoding="utf-8") as fh:
                    fh.write(new_content)
                changed_files += 1
                total_replacements += file_repls
                print(f"Updated {p} ({file_repls} replacements)")

print(f"\nDone! Updated {changed_files} files with {total_replacements} replacements.")
