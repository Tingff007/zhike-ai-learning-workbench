import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const srcRoot = dirname(dirname(fileURLToPath(import.meta.url)));

const allowedJsonParseFiles = new Set(['utils/json-parse.ts']);
const allowedBrowserStorageFiles = new Set(['utils/browser-storage.ts']);
const allowedAuthTokenStorageFiles = new Set(['utils/auth-storage.ts']);
const allowedGenericAssertionFiles = new Set(['api/client.ts']);

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

function createSourceFile(path: string): ts.SourceFile {
  const content = readFileSync(path, 'utf-8');
  return ts.createSourceFile(
    path,
    content,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

function findingForNode(path: string, source: ts.SourceFile, node: ts.Node, label: string): string {
  const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
  return `${toProjectPath(path)}:${line + 1}:${label}`;
}

function anyAssertionViolations(path: string): string[] {
  const source = createSourceFile(path);
  const findings: string[] = [];

  function visit(node: ts.Node): void {
    const isAnyAssertion = (
      (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node))
      && node.type.kind === ts.SyntaxKind.AnyKeyword
    );
    if (isAnyAssertion) {
      findings.push(findingForNode(path, source, node, 'any'));
    }
    ts.forEachChild(node, visit);
  }

  visit(source);
  return findings;
}

function genericTypeParameterAssertionViolations(path: string): string[] {
  const source = createSourceFile(path);
  const findings: string[] = [];
  const genericNames = new Set<string>();

  function visit(node: ts.Node): void {
    if (
      (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node))
      && node.typeParameters
    ) {
      for (const typeParameter of node.typeParameters) {
        genericNames.add(typeParameter.name.text);
      }
    }
    if (
      (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node))
      && ts.isTypeReferenceNode(node.type)
      && ts.isIdentifier(node.type.typeName)
      && genericNames.has(node.type.typeName.text)
    ) {
      findings.push(findingForNode(path, source, node, `as ${node.type.typeName.text}`));
    }
    ts.forEachChild(node, visit);
  }

  visit(source);
  return findings;
}

function jsonParseCalls(path: string): string[] {
  const source = createSourceFile(path);
  const findings: string[] = [];

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const callee = node.expression;
      if (
        ts.isIdentifier(callee.expression)
        && callee.expression.text === 'JSON'
        && callee.name.text === 'parse'
      ) {
        findings.push(findingForNode(path, source, node, 'JSON.parse'));
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(source);
  return findings;
}

function directStorageAccesses(path: string): string[] {
  const source = createSourceFile(path);
  const findings: string[] = [];

  function visit(node: ts.Node): void {
    if (ts.isIdentifier(node) && (node.text === 'localStorage' || node.text === 'sessionStorage')) {
      findings.push(findingForNode(path, source, node, node.text));
    }
    ts.forEachChild(node, visit);
  }

  visit(source);
  return findings;
}

describe('前端存储与 JSON 解析治理', (): void => {
  const sourceFiles = collectSourceFiles(srcRoot);

  it('生产代码不能使用 as any 绕过类型契约', (): void => {
    const violations = sourceFiles.flatMap(anyAssertionViolations);

    expect(violations).toEqual([]);
  });

  it('生产代码不能通过 as T 这类泛型断言绕过响应或存储契约', (): void => {
    const violations = sourceFiles
      .filter((path) => !allowedGenericAssertionFiles.has(toProjectPath(path)))
      .flatMap(genericTypeParameterAssertionViolations);

    expect(violations).toEqual([]);
  });

  it('生产代码只能通过统一入口调用 JSON.parse', (): void => {
    const violations = sourceFiles
      .filter((path) => !allowedJsonParseFiles.has(toProjectPath(path)))
      .flatMap(jsonParseCalls);

    expect(violations).toEqual([]);
  });

  it('生产代码只能通过 browser-storage 访问浏览器存储对象', (): void => {
    const violations = sourceFiles
      .filter((path) => !allowedBrowserStorageFiles.has(toProjectPath(path)))
      .flatMap(directStorageAccesses);

    expect(violations).toEqual([]);
  });

  it('认证存储键只能出现在 auth-storage 统一入口', (): void => {
    const authStoragePattern = /\bAUTH_(TOKEN|USER)_STORAGE_KEY\b|['"`]zhike_auth_(token|user)['"`]/;
    const violations = sourceFiles
      .map((path) => ({ path: toProjectPath(path), content: readFileSync(path, 'utf-8') }))
      .filter(({ path, content }) => authStoragePattern.test(content) && !allowedAuthTokenStorageFiles.has(path))
      .map(({ path }) => path);

    expect(violations).toEqual([]);
  });
});
