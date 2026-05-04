import {
  formatAeonGraphSummaryText,
  graphAeonFiles,
  summarizeAeonGraph,
  type AeonGraphSummary,
} from '../../aeon-graph/dist/index.js';
import {
  formatAeonLintSarif,
  formatAeonLintText,
  lintAeonFiles,
  type AeonLintResult,
} from '../../aeon-lint/dist/index.js';

export type AeonGuardCommand =
  | 'clone-into'
  | 'decide'
  | 'edit-preflight'
  | 'incoming'
  | 'pointer-under'
  | 'pointers'
  | 'summary';

export type AeonGuardFormat = 'json' | 'sarif' | 'text';
export type AeonGuardAdvice = 'block' | 'proceed' | 'warn';
export type AeonGuardAdviceExit = 'block' | 'proceed' | 'warn';

export interface AeonGuardOptions {
  readonly adviceOnly?: boolean;
  readonly adviceExit?: AeonGuardAdviceExit;
  readonly cloneScope?: string;
  readonly command: AeonGuardCommand;
  readonly scope?: string;
  readonly format?: AeonGuardFormat;
  readonly graphPrefix?: boolean;
  readonly external?: boolean;
  readonly target?: string;
}

export interface AeonGuardPreflightCheck {
  readonly kind: 'clone-into' | 'incoming' | 'pointer-under';
  readonly ok: boolean;
  readonly result: AeonLintResult;
}

export interface AeonGuardPreflightResult {
  readonly advice: AeonGuardAdvice;
  readonly format: 'aeon.guard.preflight';
  readonly version: 1;
  readonly ok: boolean;
  readonly summary: AeonGraphSummary;
  readonly checks: readonly AeonGuardPreflightCheck[];
}

export interface AeonGuardRunResult {
  readonly command: AeonGuardCommand;
  readonly format: AeonGuardFormat;
  readonly ok: boolean;
  readonly exitCode: 0 | 1 | 2;
  readonly output: string;
  readonly result: AeonLintResult | AeonGraphSummary | AeonGuardPreflightResult;
}

export async function runAeonGuard(
  inputs: readonly string[],
  options: AeonGuardOptions,
): Promise<AeonGuardRunResult> {
  const format = options.format ?? 'text';
  if (options.command === 'edit-preflight' || options.command === 'decide') {
    const preflight = await runEditPreflight(inputs, options);
    const adviceExit = options.adviceExit ?? 'warn';
    const adviceOnly = options.command === 'decide' || options.adviceOnly === true;
    return {
      command: options.command,
      format,
      ok: preflight.ok,
      exitCode: adviceOnly
        ? adviceExitCode(preflight.advice, adviceExit)
        : (preflight.summary.counts.diagnostics > 0 ? 2 : (preflight.ok ? 0 : 1)),
      output: formatPreflight(preflight, format, adviceOnly),
      result: preflight,
    };
  }
  if (options.command === 'summary') {
    const graph = await graphAeonFiles(inputs);
    const summary = summarizeAeonGraph(graph);
    return {
      command: options.command,
      format,
      ok: summary.counts.diagnostics === 0,
      exitCode: summary.counts.diagnostics === 0 ? 0 : 2,
      output: formatSummary(summary, format),
      result: summary,
    };
  }

  const lint = await lintForCommand(inputs, options);
  return {
    command: options.command,
    format,
    ok: lint.ok,
    exitCode: lint.ok ? 0 : 1,
    output: formatLint(lint, format),
    result: lint,
  };
}

async function runEditPreflight(
  inputs: readonly string[],
  options: AeonGuardOptions,
): Promise<AeonGuardPreflightResult> {
  if (options.target === undefined && options.scope === undefined && options.cloneScope === undefined) {
    throw new Error('edit-preflight requires --target, --scope, --clone-scope, or some combination of them.');
  }
  const graph = await graphAeonFiles(inputs);
  const summary = summarizeAeonGraph(graph);
  const checks: AeonGuardPreflightCheck[] = [];

  if (options.target !== undefined) {
    checks.push({
      kind: 'incoming',
      result: await lintAeonFiles(inputs, {
        references: options.target,
        rules: [options.external ? 'no-external-reference' : 'no-incoming-reference'],
      }),
      ok: false,
    });
    checks[checks.length - 1] = {
      ...checks[checks.length - 1]!,
      ok: checks[checks.length - 1]!.result.ok,
    };
  }

  if (options.scope !== undefined) {
    const result = await lintAeonFiles(inputs, options.graphPrefix
      ? { pointerUnderGraphPrefixes: [options.scope] }
      : { pointerUnder: [options.scope] });
    checks.push({
      kind: 'pointer-under',
      result,
      ok: result.ok,
    });
  }

  if (options.cloneScope !== undefined) {
    const result = await lintAeonFiles(inputs, options.graphPrefix
      ? { cloneIntoGraphPrefixes: [options.cloneScope] }
      : { cloneInto: [options.cloneScope] });
    checks.push({
      kind: 'clone-into',
      result,
      ok: result.ok,
    });
  }

  return {
    format: 'aeon.guard.preflight',
    version: 1,
    advice: advisePreflight(summary, checks),
    ok: summary.counts.diagnostics === 0 && checks.every((check) => check.ok),
    summary,
    checks,
  };
}

function advisePreflight(
  summary: AeonGraphSummary,
  checks: readonly AeonGuardPreflightCheck[],
): AeonGuardAdvice {
  if (summary.counts.diagnostics > 0) {
    return 'block';
  }
  if (checks.some((check) => check.ok === false)) {
    return 'warn';
  }
  return 'proceed';
}

function adviceExitCode(
  advice: AeonGuardAdvice,
  adviceExit: AeonGuardAdviceExit,
): 0 | 1 {
  const severity = adviceSeverity(advice);
  const threshold = adviceSeverity(adviceExit);
  return severity >= threshold ? 1 : 0;
}

function adviceSeverity(advice: AeonGuardAdvice | AeonGuardAdviceExit): number {
  if (advice === 'proceed') {
    return 0;
  }
  if (advice === 'warn') {
    return 1;
  }
  return 2;
}

async function lintForCommand(inputs: readonly string[], options: AeonGuardOptions): Promise<AeonLintResult> {
  if (options.command === 'pointers') {
    return lintAeonFiles(inputs, { rules: ['no-pointer'] });
  }
  if (options.command === 'incoming') {
    if (options.target === undefined) {
      throw new Error('incoming requires a target path.');
    }
    return lintAeonFiles(inputs, {
      references: options.target,
      rules: [options.external ? 'no-external-reference' : 'no-incoming-reference'],
    });
  }
  if (options.command === 'pointer-under') {
    if (options.target === undefined) {
      throw new Error('pointer-under requires a scope path.');
    }
    return lintAeonFiles(inputs, options.graphPrefix
      ? { pointerUnderGraphPrefixes: [options.target] }
      : { pointerUnder: [options.target] });
  }
  if (options.target === undefined) {
    throw new Error('clone-into requires a scope path.');
  }
  return lintAeonFiles(inputs, options.graphPrefix
    ? { cloneIntoGraphPrefixes: [options.target] }
    : { cloneInto: [options.target] });
}

function formatLint(result: AeonLintResult, format: AeonGuardFormat): string {
  if (format === 'json') {
    return `${JSON.stringify(result, null, 2)}\n`;
  }
  if (format === 'sarif') {
    return formatAeonLintSarif(result);
  }
  return formatAeonLintText(result);
}

function formatSummary(summary: AeonGraphSummary, format: AeonGuardFormat): string {
  if (format === 'json') {
    return `${JSON.stringify(summary, null, 2)}\n`;
  }
  if (format === 'sarif') {
    throw new Error('summary does not support sarif output.');
  }
  return formatAeonGraphSummaryText(summary);
}

function formatPreflight(
  result: AeonGuardPreflightResult,
  format: AeonGuardFormat,
  adviceOnly: boolean,
): string {
  if (adviceOnly) {
    if (format === 'json') {
      return `${JSON.stringify({
        format: 'aeon.guard.advice',
        version: 1,
        ok: result.ok,
        advice: result.advice,
      }, null, 2)}\n`;
    }
    if (format === 'sarif') {
      throw new Error('edit-preflight advice does not support sarif output.');
    }
    return `${result.advice}\n`;
  }
  if (format === 'json') {
    return `${JSON.stringify(result, null, 2)}\n`;
  }
  if (format === 'sarif') {
    throw new Error('edit-preflight does not support sarif output.');
  }
  const lines = [
    `AEON guard edit-preflight: ${result.ok ? 'ok' : 'failed'} (${result.checks.length} checks)`,
    `advice: ${result.advice}`,
    `summary: ${result.summary.counts.files} files, ${result.summary.counts.nodes} nodes, ${result.summary.counts.edges} edges, ${result.summary.counts.diagnostics} diagnostics`,
    `pointer risk paths: ${result.summary.highRisk.pointerPaths.length === 0 ? 'none' : result.summary.highRisk.pointerPaths.join(', ')}`,
    ...result.checks.map((check) => `${check.kind}: ${check.ok ? 'ok' : `failed (${check.result.findings.length} findings)`}`),
  ];
  return `${lines.join('\n')}\n`;
}
