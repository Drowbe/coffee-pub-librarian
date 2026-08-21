"""Librarian pre-flight. Run from the module root.

Parse check note: `node --check foo.js` parses as CommonJS *script*, which accepts
things ESM rejects — it passed a genuine SyntaxError that broke the world at load.
Every file is copied to a .mjs and checked there instead.
"""
import io
import json
import os
import re
import shutil
import subprocess
import tempfile

fail = []

js = []
for d, _, fs in os.walk('scripts'):
    for f in fs:
        if f.endswith('.js'):
            js.append(os.path.join(d, f).replace(os.sep, '/'))

# 1. every script parses AS A MODULE
tmp = tempfile.mkdtemp()
for f in js:
    mjs = os.path.join(tmp, os.path.basename(f) + '.mjs')
    shutil.copyfile(f, mjs)
    r = subprocess.run(['node', '--check', mjs], capture_output=True, text=True)
    if r.returncode:
        detail = ' | '.join(l.strip() for l in r.stderr.splitlines()[:4] if l.strip())
        fail.append('PARSE %s: %s' % (f, detail))
shutil.rmtree(tmp, ignore_errors=True)

# 2. manifest-declared paths exist
m = json.load(io.open('module.json', encoding='utf-8'))
for key in ('esmodules', 'styles', 'languages', 'packs'):
    for entry in m.get(key, []):
        path = entry if isinstance(entry, str) else entry.get('path', '')
        if path and not os.path.exists(path):
            fail.append('MANIFEST %s: missing %s' % (key, path))

# 3. static + dynamic import targets resolve
imp = re.compile(r"""(?:from\s+|import\s*\(\s*)['"](\.[^'"]+)['"]""")
for f in js:
    for spec in imp.findall(io.open(f, encoding='utf-8').read()):
        if not os.path.exists(os.path.normpath(os.path.join(os.path.dirname(f), spec))):
            fail.append('IMPORT %s -> %s' % (f, spec))

# 4. each named binding is actually exported by its target
named = re.compile(r"import\s*\{([^}]*)\}\s*from\s*['\"](\.[^'\"]+)['\"]")
dyn = re.compile(r"(?:const|let|var)\s*\{([^}]*)\}\s*=\s*await\s+import\(\s*['\"](\.[^'\"]+)['\"]\s*\)")


def exports_of(path):
    src = io.open(path, encoding='utf-8').read()
    out = set(re.findall(r"export\s+(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z0-9_$]+)", src))
    for block in re.findall(r"export\s*\{([^}]*)\}", src):
        for part in block.split(','):
            part = part.strip()
            if part:
                out.add(part.split(' as ')[-1].strip())
    if re.search(r"export\s+default", src):
        out.add('default')
    return out


for f in js:
    src = io.open(f, encoding='utf-8').read()
    for rx in (named, dyn):
        for names, spec in rx.findall(src):
            t = os.path.normpath(os.path.join(os.path.dirname(f), spec))
            if not os.path.exists(t):
                continue
            have = exports_of(t)
            for n in names.split(','):
                n = n.strip().split(' as ')[0].strip()
                if n and not n.startswith('//') and n not in have:
                    fail.append('EXPORT %s: %s does not export %s' % (f, spec, n))

# 5. CSS @import targets
for d, _, fs in os.walk('styles'):
    for f in fs:
        if not f.endswith('.css'):
            continue
        pth = os.path.join(d, f)
        for spec in re.findall(r"@import\s+(?:url\()?['\"]([^'\"]+)['\"]", io.open(pth, encoding='utf-8').read()):
            if not os.path.exists(os.path.normpath(os.path.join(d, spec))):
                fail.append('CSS @import %s -> %s' % (pth, spec))

# 6. any module-absolute asset referenced from a script or template
for d, _, fs in os.walk('.'):
    if '.git' in d or 'node_modules' in d:
        continue
    for f in fs:
        if not f.endswith(('.js', '.hbs')):
            continue
        pth = os.path.join(d, f)
        txt = io.open(pth, encoding='utf-8', errors='replace').read()
        for path in re.findall(r"modules/coffee-pub-librarian/([A-Za-z0-9_./-]+\.(?:hbs|css|json|js))", txt):
            if not os.path.exists(path):
                fail.append('ASSET %s -> %s' % (pth, path))

# 7. every Handlebars helper a template calls has someone registering it
#
# Handlebars fails at RENDER time with "Missing helper", not at load, so a helper
# used on one screen can go missing and every other screen still looks fine. That
# is exactly how `isArray` was nearly lost: the audit that decided which helpers to
# keep matched `{{helper` and missed `{{#if (isArray x)}}`, which is the only form
# it appears in. Subexpressions are counted here for that reason.
#
# Blacksmith's set is read from its source rather than assumed, so this also catches
# Blacksmith dropping one out from under us.
BUILTIN = {'if', 'unless', 'each', 'with', 'else', 'log', 'lookup', 'this'}
FOUNDRY = {'localize', 'numberFormat', 'lookup', 'ne', 'lt', 'lte', 'gte', 'not',
           'concat', 'editor', 'filePicker', 'colorPicker', 'rangePicker',
           'selectOptions', 'radioBoxes', 'checked', 'disabled', 'ifThen',
           'formInput', 'formGroup', 'formField', 'object'}

provided = set(re.findall(r"registerHelper\('([^']+)'",
                          io.open('scripts/helpers.js', encoding='utf-8').read()))
bs_helpers = '../coffee-pub-blacksmith/scripts/utility-handlebars.js'
if os.path.exists(bs_helpers):
    provided |= set(re.findall(r"registerHelper\('([^']+)'",
                               io.open(bs_helpers, encoding='utf-8').read()))
else:
    fail.append('HELPERS cannot verify: %s not found (is Blacksmith installed alongside?)' % bs_helpers)

for d, _, fs in os.walk('templates'):
    for f in fs:
        if not f.endswith('.hbs'):
            continue
        pth = os.path.join(d, f)
        txt = io.open(pth, encoding='utf-8').read()
        txt = re.sub(r'\{\{!--.*?--\}\}', '', txt, flags=re.S)   # Handlebars comments
        txt = re.sub(r'<!--.*?-->', '', txt, flags=re.S)         # HTML comments
        # Only look INSIDE {{ }}. Scanning the whole file for `(word ` finds prose --
        # "(GM only)", "(above location per design)", "(Not Started)" -- and reports
        # each as a missing helper.
        names = set()
        for expr in re.findall(r'\{\{(.*?)\}\}', txt, flags=re.S):
            expr = re.sub(r'"[^"]*"|\'[^\']*\'', '""', expr)     # drop string literals
            head = re.match(r'\s*[#/^]?\s*([a-zA-Z][\w-]*)\s', expr)
            if head:
                names.add(head.group(1))
            names |= set(re.findall(r'\(\s*([a-zA-Z][\w-]*)\s', expr))
        for n in sorted(names - BUILTIN - FOUNDRY - provided):
            fail.append('HELPER %s -> "%s" has no registered provider' % (pth, n))

print('\n'.join(sorted(set(fail))) if fail else 'ALL CHECKS PASS')
print('(%d js files checked, as modules)' % len(js))
