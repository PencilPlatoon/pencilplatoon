"""Static import-integrity across the pencil-vector modules.

Catches the class of break where one module imports a symbol another module no longer
defines -- e.g. dropping the clothoid primitive deleted `fit._turning`/`TV_KAPPA_W` while
the `spline_pipeline` inspector still imported them (an ImportError only hit when that
inspector was actually run, which the suite never did). This is pure AST: no module is
executed, so the slow, asset-heavy inspector scripts get checked for free.
"""
import ast
import glob
import os

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
PY_FILES = sorted(glob.glob(os.path.join(HERE, "*.py")))
LOCAL_MODULES = sorted(os.path.splitext(os.path.basename(p))[0] for p in PY_FILES)

_TREES, _PARSE_ERR = {}, {}
for _p in PY_FILES:
    _m = os.path.splitext(os.path.basename(_p))[0]
    try:
        _TREES[_m] = ast.parse(open(_p, encoding="utf-8").read(), _p)
    except SyntaxError as _e:                             # a syntax error surfaces as that module's test
        _PARSE_ERR[_m] = _e


def _target_names(node):
    """Names bound by an assignment target (handles tuple/list unpacking, ignores subscript/attr)."""
    if isinstance(node, ast.Name):
        return {node.id}
    if isinstance(node, (ast.Tuple, ast.List)):
        out = set()
        for e in node.elts:
            out |= _target_names(e)
        return out
    if isinstance(node, ast.Starred):
        return _target_names(node.value)
    return set()


def _collect(stmts, names):
    """Names bound at one lexical scope: def/class/assign/import + bindings inside top-level
    if/try/for/while/with blocks (some inspectors run at module scope). Does NOT descend into a
    nested def/class body -- those open a new scope and would over-collect their locals."""
    for node in stmts:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            names.add(node.name)
        elif isinstance(node, ast.Assign):
            for t in node.targets:
                names |= _target_names(t)
        elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
            names.add(node.target.id)
        elif isinstance(node, ast.Import):
            for a in node.names:
                names.add(a.asname or a.name.split(".")[0])
        elif isinstance(node, ast.ImportFrom):
            for a in node.names:
                names.add("*" if a.name == "*" else (a.asname or a.name))
        elif isinstance(node, (ast.For, ast.AsyncFor)):
            names |= _target_names(node.target)
            _collect(node.body, names); _collect(node.orelse, names)
        elif isinstance(node, ast.While):
            _collect(node.body, names); _collect(node.orelse, names)
        elif isinstance(node, ast.If):
            _collect(node.body, names); _collect(node.orelse, names)
        elif isinstance(node, ast.With):
            for item in node.items:
                if item.optional_vars is not None:
                    names |= _target_names(item.optional_vars)
            _collect(node.body, names)
        elif isinstance(node, ast.Try):
            for block in (node.body, node.orelse, node.finalbody):
                _collect(block, names)
            for h in node.handlers:
                _collect(h.body, names)


def _exports(mod):
    """(top-level names the module defines/imports, whether it does `from x import *`)."""
    names = set()
    _collect(_TREES[mod].body, names)
    star = "*" in names
    names.discard("*")
    return names, star


def _local_from_imports(mod):
    """(target_module, [names]) for each `from <sibling> import ...` in this module."""
    out = []
    for node in ast.walk(_TREES[mod]):
        if isinstance(node, ast.ImportFrom) and node.level <= 1 and node.module in LOCAL_MODULES:
            out.append((node.module, [a.name for a in node.names if a.name != "*"]))
    return out


@pytest.mark.parametrize("mod", LOCAL_MODULES)
def test_local_imports_resolve(mod):
    """Every symbol a module imports from a sibling module actually exists there."""
    if mod in _PARSE_ERR:
        pytest.fail(f"{mod}.py does not parse: {_PARSE_ERR[mod]}")
    missing = []
    for target, names in _local_from_imports(mod):
        if target in _PARSE_ERR:
            missing.append(f"{mod} imports from {target}, which does not parse")
            continue
        exports, star = _exports(target)
        if star:
            continue                                     # opaque: `import *` hides the export set
        for n in names:
            if n not in exports:
                missing.append(f"{mod} imports `{n}` from {target}, which no longer defines it")
    assert not missing, "\n".join(missing)
