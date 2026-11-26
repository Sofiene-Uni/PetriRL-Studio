"""Static checks of the front-end modules: every exported name used in a file is imported or defined there, and
no optional (possibly null) child is passed to the native append / replaceChildren.
usage: python tools/check_js_imports.py   (exit code 1 if something is missing)"""
import os
import re
import sys

ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "studio", "static", "js")
files = {os.path.join(d, f): open(os.path.join(d, f), encoding="utf-8").read()
         for d, _, fs in os.walk(ROOT) for f in fs if f.endswith(".js")}
exported = {}
for path, src in files.items():
    for name in re.findall(r"export (?:async )?(?:function|class|const|let) (\w+)", src):
        exported[name] = path

missing = []
for path, src in files.items():
    code = re.sub(r"//[^\n]*|/\*.*?\*/|`(?:\\.|[^`\\])*`|\"(?:\\.|[^\"\\])*\"|'(?:\\.|[^'\\])*'", " ", src, flags=re.S)
    imported = set(re.findall(r"\b(\w+)\b", " ".join(re.findall(r"import \{([^}]*)\}", src))))
    defined = set(re.findall(r"(?:function|class|const|let|var) (\w+)", src))
    for params in re.findall(r"\(([^()]*)\)\s*(?:=>|\{)", code) + re.findall(r"(\w+)\s*=>", code):   # parameters
        defined |= set(re.findall(r"\b([A-Za-z_$][\w$]*)\b", params.split("=")[0] if "=" not in params else params))
    for name, origin in exported.items():
        if origin == path or name in imported or name in defined:
            continue
        if re.search(rf"(?<![\w.$]){name}(?![\w$])\s*(?!:)", code):
            missing.append(f"{os.path.relpath(path, ROOT)}: uses {name} (from {os.path.relpath(origin, ROOT)}) without importing it")

# native append / replaceChildren turn a null argument into the text "null": optional children must be filtered
def top_level_args(args):
    depth, cur, out = 0, "", []
    for c in args:
        if c in "([{": depth += 1
        if c in ")]}": depth -= 1
        if c == "," and depth == 0:
            out.append(cur); cur = ""
        else:
            cur += c
    return out + [cur]


for path, src in files.items():
    for m in re.finditer(r"\.(append|replaceChildren)\(", src):
        i, depth, j = m.end(), 1, m.end()
        while depth and j < len(src):
            depth += src[j] == "("
            depth -= src[j] == ")"
            j += 1
        for arg in top_level_args(src[i:j - 1]):
            if re.search(r"\?[^?]*:\s*null\s*$", arg.strip()):
                line = src[:m.start()].count("\n") + 1
                missing.append(f"{os.path.relpath(path, ROOT)}:{line}: a null child reaches {m.group(1)}() and renders as 'null'")

print("\n".join(missing) or f"ok: {len(files)} modules")
sys.exit(1 if missing else 0)
