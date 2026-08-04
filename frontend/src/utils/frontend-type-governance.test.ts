import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const srcRoot = dirname(dirname(fileURLToPath(import.meta.url)));

function toProjectPath(path: string): string {
  return relative(srcRoot, path).split(sep).join('/');
}

function isTestSourceFile(fileName: string): boolean {
  return /\.(test|spec)\.(ts|tsx)$/.test(fileName);
}

function collectSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...collectSourceFiles(path));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry)) continue;
    if (isTestSourceFile(entry)) continue;
    files.push(path);
  }
  return files;
}

function hasExportModifier(node: ts.Node): boolean {
  return Boolean(ts.canHaveModifiers(node) && ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword));
}

function isFunctionTypedDeclaration(typeNode: ts.TypeNode | undefined): boolean {
  if (!typeNode) return false;
  return typeNode.kind === ts.SyntaxKind.FunctionType || typeNode.kind === ts.SyntaxKind.TypeReference;
}

function exportedFunctionsWithoutReturnType(path: string): string[] {
  const source = ts.createSourceFile(
    path,
    readFileSync(path, 'utf-8'),
    ts.ScriptTarget.Latest,
    true,
    path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const findings: string[] = [];

  function visit(node: ts.Node): void {
    if (ts.isFunctionDeclaration(node) && hasExportModifier(node) && node.name && !node.type) {
      const { line } = source.getLineAndCharacterOfPosition(node.name.getStart(source));
      findings.push(`${toProjectPath(path)}:${line + 1}:${node.name.text}`);
    }

    if (ts.isVariableStatement(node) && hasExportModifier(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) continue;
        const initializer = declaration.initializer;
        if (!initializer || (!ts.isArrowFunction(initializer) && !ts.isFunctionExpression(initializer))) continue;
        if (initializer.type || isFunctionTypedDeclaration(declaration.type)) continue;
        const { line } = source.getLineAndCharacterOfPosition(declaration.name.getStart(source));
        findings.push(`${toProjectPath(path)}:${line + 1}:${declaration.name.text}`);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(source);
  return findings;
}

describe('前端类型契约治理', (): void => {
  it('导出函数必须显式声明返回类型', (): void => {
    const violations = collectSourceFiles(srcRoot).flatMap(exportedFunctionsWithoutReturnType);

    expect(violations).toEqual([]);
  });
});
