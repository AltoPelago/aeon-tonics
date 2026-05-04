import {
  graphAeonFiles,
  type AeonGraphDiagnostic,
  type AeonGraphEdge,
  type AeonGraphOptions,
  type AeonGraphResult,
} from '../../aeon-graph/dist/index.js';

export type AeonLintRule =
  | 'no-clone-into'
  | 'no-diagnostic'
  | 'no-external-reference'
  | 'no-incoming-reference'
  | 'no-pointer'
  | 'no-pointer-under';

export interface AeonLintOptions extends AeonGraphOptions {
  readonly cloneInto?: readonly string[];
  readonly cloneIntoGraphPrefixes?: readonly string[];
  readonly pointerUnder?: readonly string[];
  readonly pointerUnderGraphPrefixes?: readonly string[];
  readonly rules?: readonly AeonLintRule[];
}

export interface AeonLintFinding {
  readonly rule: AeonLintRule;
  readonly file: string;
  readonly message: string;
  readonly path?: string;
  readonly from?: string;
  readonly to?: string;
}

export interface AeonLintResult {
  readonly format: 'aeon.lint';
  readonly version: 1;
  readonly ok: boolean;
  readonly rules: readonly AeonLintRule[];
  readonly findings: readonly AeonLintFinding[];
  readonly graph: AeonGraphResult;
}

export const DEFAULT_AEON_LINT_RULES = ['no-diagnostic', 'no-pointer'] as const satisfies readonly AeonLintRule[];

export async function lintAeonFiles(
  inputs: readonly string[],
  options: AeonLintOptions = {},
): Promise<AeonLintResult> {
  const hasScopedRules = (options.pointerUnder?.length ?? 0) > 0
    || (options.cloneInto?.length ?? 0) > 0
    || (options.pointerUnderGraphPrefixes?.length ?? 0) > 0
    || (options.cloneIntoGraphPrefixes?.length ?? 0) > 0;
  const explicitRules = options.rules === undefined || options.rules.length === 0
    ? (hasScopedRules ? [] : [...DEFAULT_AEON_LINT_RULES])
    : [...new Set(options.rules)];
  const graph = await graphAeonFiles(inputs, options);
  const pointerUnder = uniqueSorted([
    ...(options.pointerUnder ?? []),
    ...collectGraphDerivedScopes(graph, 'pointer', 'from', options.pointerUnderGraphPrefixes ?? []),
  ]);
  const cloneInto = uniqueSorted([
    ...(options.cloneInto ?? []),
    ...collectGraphDerivedScopes(graph, 'clone', 'from', options.cloneIntoGraphPrefixes ?? []),
  ]);
  const rules = [
    ...explicitRules,
    ...(pointerUnder.length === 0 ? [] : ['no-pointer-under']),
    ...(cloneInto.length === 0 ? [] : ['no-clone-into']),
  ] as AeonLintRule[];
  const findings = rules.flatMap((rule) => lintRule(rule, graph, {
    ...options,
    pointerUnder,
    cloneInto,
  }));

  return {
    format: 'aeon.lint',
    version: 1,
    ok: findings.length === 0,
    rules: [...new Set(rules)],
    findings,
    graph,
  };
}

export function formatAeonLintText(result: AeonLintResult): string {
  const lines = [
    `AEON lint: ${result.ok ? 'ok' : 'failed'} (${result.findings.length} findings across ${result.rules.length} rules)`,
    `rules: ${result.rules.join(', ')}`,
    ...result.findings.map((finding) => formatFindingText(finding)),
  ];
  return `${lines.join('\n')}\n`;
}

export function formatAeonLintSarif(result: AeonLintResult): string {
  const sarif = {
    version: '2.1.0',
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    runs: [{
      tool: {
        driver: {
          name: 'aeon-lint',
          informationUri: 'https://github.com/AltoPelago/aeon-family',
          rules: result.rules.map((rule) => ({
            id: rule,
            shortDescription: {
              text: sarifRuleDescription(rule),
            },
            defaultConfiguration: {
              level: sarifRuleLevel(rule),
            },
          })),
        },
      },
      results: result.findings.map((finding) => ({
        ruleId: finding.rule,
        level: sarifRuleLevel(finding.rule),
        message: {
          text: finding.message,
        },
        locations: [{
          physicalLocation: {
            artifactLocation: {
              uri: finding.file,
            },
          },
          logicalLocations: finding.path === undefined
            ? undefined
            : [{
              kind: 'aeon.path',
              name: finding.path,
            }],
        }],
        properties: {
          aeonRule: finding.rule,
          ...(finding.from === undefined ? {} : { fromPath: finding.from }),
          ...(finding.to === undefined ? {} : { toPath: finding.to }),
          ...(finding.path === undefined ? {} : { path: finding.path }),
        },
      })),
    }],
  };
  return `${JSON.stringify(sarif, null, 2)}\n`;
}

function lintRule(rule: AeonLintRule, graph: AeonGraphResult, options: AeonLintOptions): readonly AeonLintFinding[] {
  if (rule === 'no-diagnostic') {
    return graph.diagnostics.map((diagnostic) => diagnosticFinding(diagnostic));
  }
  if (rule === 'no-pointer') {
    return graph.edges
      .filter((edge) => edge.kind === 'pointer')
      .map((edge) => edgeFinding(rule, edge, `Pointer reference from ${edge.from} to ${edge.to}.`));
  }
  if (rule === 'no-pointer-under') {
    return (options.pointerUnder ?? []).flatMap((scope) => graph.edges
      .filter((edge) => edge.kind === 'pointer' && pathWithinScope(edge.from, scope))
      .map((edge) => edgeFinding(rule, edge, `Pointer reference from ${edge.from} to ${edge.to} under ${scope}.`)));
  }
  if (rule === 'no-incoming-reference') {
    return graph.edges
      .filter((edge) => edge.kind === 'clone' || edge.kind === 'pointer')
      .map((edge) => edgeFinding(rule, edge, `Incoming ${edge.kind} reference to ${edge.to} from ${edge.from}.`));
  }
  if (rule === 'no-clone-into') {
    return (options.cloneInto ?? []).flatMap((scope) => graph.edges
      .filter((edge) => edge.kind === 'clone' && pathWithinScope(edge.from, scope))
      .map((edge) => edgeFinding(rule, edge, `Clone reference into ${scope} from ${edge.from} to ${edge.to}.`)));
  }
  return graph.edges
    .filter((edge) => isExternalReference(edge, graph))
    .map((edge) => edgeFinding(rule, edge, `External ${edge.kind} reference from ${edge.from} to ${edge.to}.`));
}

function diagnosticFinding(diagnostic: AeonGraphDiagnostic): AeonLintFinding {
  return {
    rule: 'no-diagnostic',
    file: diagnostic.file,
    message: `${diagnostic.code}: ${diagnostic.message}`,
  };
}

function edgeFinding(rule: AeonLintRule, edge: AeonGraphEdge, message: string): AeonLintFinding {
  return {
    rule,
    file: edge.file,
    message,
    path: edge.to,
    from: edge.from,
    to: edge.to,
  };
}

function isExternalReference(edge: AeonGraphEdge, graph: AeonGraphResult): boolean {
  if (edge.kind === 'contains') {
    return false;
  }
  const targetFiles = new Set(
    graph.nodes
      .filter((node) => node.path === edge.to)
      .map((node) => node.file),
  );
  return targetFiles.size > 0 && !targetFiles.has(edge.file);
}

function formatFindingText(finding: AeonLintFinding): string {
  const location = finding.from === undefined
    ? finding.file
    : `${finding.file} ${finding.from}${finding.to === undefined ? '' : ` -> ${finding.to}`}`;
  return `${finding.rule}: ${location}: ${finding.message}`;
}

function sarifRuleDescription(rule: AeonLintRule): string {
  if (rule === 'no-clone-into') {
    return 'Disallow clone references that resolve into a protected AEON path scope.';
  }
  if (rule === 'no-diagnostic') {
    return 'Disallow AEON compile diagnostics.';
  }
  if (rule === 'no-pointer') {
    return 'Disallow pointer references.';
  }
  if (rule === 'no-pointer-under') {
    return 'Disallow pointer references originating under a protected AEON path scope.';
  }
  if (rule === 'no-incoming-reference') {
    return 'Disallow incoming clone or pointer references in the filtered graph scope.';
  }
  return 'Disallow cross-file clone or pointer references in the filtered graph scope.';
}

function sarifRuleLevel(rule: AeonLintRule): 'error' | 'warning' {
  return rule === 'no-external-reference' ? 'warning' : 'error';
}

function pathWithinScope(path: string, scope: string): boolean {
  return path === scope || path.startsWith(`${scope}.`) || path.startsWith(`${scope}[`);
}

function collectGraphDerivedScopes(
  graph: AeonGraphResult,
  kind: 'clone' | 'pointer',
  side: 'from' | 'to',
  prefixes: readonly string[],
): readonly string[] {
  if (prefixes.length === 0) {
    return [];
  }
  return uniqueSorted(graph.edges
    .filter((edge) => edge.kind === kind)
    .map((edge) => edge[side])
    .filter((path) => prefixes.some((prefix) => pathWithinScope(path, prefix))));
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort();
}
