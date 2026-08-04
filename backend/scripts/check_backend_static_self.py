#!/usr/bin/env python3
"""当 @staticmethod 方法体误引用 ``self.`` 时让 CI 失败。"""

from __future__ import annotations

import ast
import sys
from pathlib import Path


def _staticmethod_uses_self(tree: ast.AST, path: Path) -> list[str]:
    issues: list[str] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.FunctionDef):
            continue
        if not any(isinstance(dec, ast.Name) and dec.id == "staticmethod" for dec in node.decorator_list):
            continue
        for child in ast.walk(node):
            if isinstance(child, ast.Attribute) and isinstance(child.value, ast.Name) and child.value.id == "self":
                issues.append(f"{path}:{node.lineno} staticmethod `{node.name}` references self.{child.attr}")
                break
    return issues


def main() -> int:
    root = Path(__file__).resolve().parents[1] / "app"
    all_issues: list[str] = []
    for path in sorted(root.rglob("*.py")):
        source = path.read_text(encoding="utf-8")
        try:
            tree = ast.parse(source, filename=str(path))
        except SyntaxError as exc:
            all_issues.append(f"{path}: syntax error ({exc})")
            continue
        all_issues.extend(_staticmethod_uses_self(tree, path))
    if all_issues:
        print("Backend staticmethod/self guard failed:")
        for item in all_issues:
            print(f"  - {item}")
        return 1
    print("Backend staticmethod/self guard passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
