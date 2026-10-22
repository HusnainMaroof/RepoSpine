import { createHash } from "node:crypto";
import { ts } from "ts-morph";

/** Printer normalization preserves ASI and comments/directives; unsupported syntax stays unknown. */
export function semanticHash(path: string, content: string): string | undefined {
  if (!/\.[cm]?[jt]sx?$/i.test(path) || content.includes("\0")) return undefined;
  const source = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true);
  const diagnostics = (source as typeof source & { parseDiagnostics?: readonly unknown[] })
    .parseDiagnostics;
  if (!diagnostics || diagnostics.length) return undefined;
  const normalized = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed }).printFile(source);
  return createHash("sha256").update(normalized).digest("hex");
}

/** Conservative syntax contracts, not inferred semantic equivalence. Bodies remain when return
 * types are inferred so implementation changes cannot silently preserve an unknown contract. */
export function publicContracts(
  path: string,
  content: string,
): { id: string; name: string; hash: string }[] | undefined {
  if (!semanticHash(path, content)) return undefined;
  const source = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true);
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed, removeComments: true });
  let commonJS = false;
  const inspect = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && ["exports", "module", "require"].includes(node.text))
      commonJS = true;
    ts.forEachChild(node, inspect);
  };
  inspect(source);
  if (commonJS || !ts.isExternalModule(source)) return undefined;
  const exported = (statement: ts.Statement): boolean =>
    Boolean(
      ts.isExportDeclaration(statement) ||
        ts.isExportAssignment(statement) ||
        (ts.canHaveModifiers(statement) &&
          ts.getModifiers(statement)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)),
    );
  // Export aliases/default expressions may refer to private declarations. Include those
  // declarations conservatively rather than claiming a stable inferred shape from an alias.
  const support = source.statements
    .filter((statement) => !exported(statement))
    .map((statement) => printer.printNode(ts.EmitHint.Unspecified, statement, source))
    .join("\n");
  const contracts: { id: string; name: string; hash: string }[] = [];
  const occurrences = new Map<string, number>();
  for (const statement of source.statements) {
    if (!exported(statement)) continue;
    const named = statement as typeof statement & { name?: { getText(): string } };
    const name =
      named.name?.getText() ??
      (ts.isVariableStatement(statement)
        ? statement.declarationList.declarations.map((d) => d.name.getText(source)).join(",")
        : `export:${statement.kind}`);
    const occurrence = occurrences.get(name) ?? 0;
    occurrences.set(name, occurrence + 1);
    let declaration = statement;
    if (ts.isFunctionDeclaration(statement) && statement.type)
      declaration = ts.factory.updateFunctionDeclaration(
        statement,
        statement.modifiers,
        statement.asteriskToken,
        statement.name,
        statement.typeParameters,
        statement.parameters,
        statement.type,
        undefined,
      );
    contracts.push({
      id: createHash("sha256")
        .update(JSON.stringify([path, name, occurrence]))
        .digest("hex"),
      name,
      hash: createHash("sha256")
        .update(
          JSON.stringify([
            printer.printNode(ts.EmitHint.Unspecified, declaration, source),
            support,
          ]),
        )
        .digest("hex"),
    });
  }
  return contracts;
}
