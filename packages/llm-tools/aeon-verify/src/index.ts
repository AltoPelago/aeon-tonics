import { readFile } from 'node:fs/promises';
import { compile, type CompileOptions } from '../../../../../aeon/implementations/typescript/packages/core/dist/index.js';
import {
  parseLedgerJsonl,
  verifyLedger,
  ledgerPublicKeyFromKeyPair,
  type LedgerKeyPair,
  type LedgerKeyring,
  type LedgerVerificationResult,
} from '../../../provenance/signed-ledger/dist/index.js';

export type VerificationCheckKind = 'parse' | 'aes' | 'strict' | 'ledger';
export type VerificationSeverity = 'error' | 'warning';

export interface AeonVerificationCheck {
  readonly kind: VerificationCheckKind;
  readonly ok: boolean;
  readonly summary: string;
}

export interface AeonVerificationDiagnostic {
  readonly severity: VerificationSeverity;
  readonly code: string;
  readonly path?: string;
  readonly message: string;
}

export interface AeonVerificationResult {
  readonly ok: boolean;
  readonly format: 'aeon.verify';
  readonly version: 1;
  readonly file?: string;
  readonly checks: readonly AeonVerificationCheck[];
  readonly diagnostics: readonly AeonVerificationDiagnostic[];
  readonly events: number;
  readonly ledger?: LedgerVerificationResult;
}

export interface VerifyAeonSourceOptions {
  readonly file?: string;
  readonly strict?: boolean;
  readonly compileOptions?: CompileOptions;
  readonly ledgerText?: string;
  readonly ledgerKeyText?: string;
  readonly expectHead?: string;
}

export interface VerifyAeonFileOptions {
  readonly strict?: boolean;
  readonly compileOptions?: CompileOptions;
  readonly ledger?: string;
  readonly ledgerKey?: string;
  readonly expectHead?: string;
}

export async function verifyAeonFile(file: string, options: VerifyAeonFileOptions = {}): Promise<AeonVerificationResult> {
  const [source, ledgerText, ledgerKeyText] = await Promise.all([
    readFile(file, 'utf8'),
    options.ledger ? readFile(options.ledger, 'utf8') : Promise.resolve(undefined),
    options.ledgerKey ? readFile(options.ledgerKey, 'utf8') : Promise.resolve(undefined),
  ]);
  return verifyAeonSource(source, {
    file,
    ...(options.strict === undefined ? {} : { strict: options.strict }),
    ...(options.compileOptions === undefined ? {} : { compileOptions: options.compileOptions }),
    ...(ledgerText === undefined ? {} : { ledgerText }),
    ...(ledgerKeyText === undefined ? {} : { ledgerKeyText }),
    ...(options.expectHead === undefined ? {} : { expectHead: options.expectHead }),
  });
}

export function verifyAeonSource(source: string, options: VerifyAeonSourceOptions = {}): AeonVerificationResult {
  const compileResult = compile(source, {
    maxAttributeDepth: 2,
    ...options.compileOptions,
  });
  const diagnostics: AeonVerificationDiagnostic[] = compileResult.errors.map((error) => ({
    severity: 'error',
    code: errorCode(error),
    message: error instanceof Error ? error.message : String(error),
  }));
  const checks: AeonVerificationCheck[] = [
    {
      kind: 'parse',
      ok: compileResult.errors.length === 0,
      summary: compileResult.errors.length === 0
        ? 'AEON compiled without diagnostics.'
        : `AEON compile returned ${compileResult.errors.length} diagnostics.`,
    },
    {
      kind: 'aes',
      ok: compileResult.errors.length === 0 && compileResult.events.length > 0,
      summary: compileResult.errors.length === 0
        ? `Emitted ${compileResult.events.length} AES events.`
        : 'AES events are not trusted because compilation failed.',
    },
  ];

  if (options.strict) {
    const strictOk = hasStrictModeDeclaration(source);
    checks.push({
      kind: 'strict',
      ok: strictOk,
      summary: strictOk ? 'Strict mode declaration found.' : 'Missing aeon:mode = "strict" declaration.',
    });
    if (!strictOk) {
      diagnostics.push({
        severity: 'error',
        code: 'STRICT_MODE_REQUIRED',
        message: 'Expected aeon:mode = "strict".',
      });
    }
  }

  const ledger = options.ledgerText || options.ledgerKeyText || options.expectHead
    ? verifyLedgerInput(options.ledgerText, options.ledgerKeyText, options.expectHead, diagnostics, checks)
    : undefined;

  return {
    format: 'aeon.verify',
    version: 1,
    ok: diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length === 0,
    ...(options.file === undefined ? {} : { file: options.file }),
    checks,
    diagnostics,
    events: compileResult.events.length,
    ...(ledger === undefined ? {} : { ledger }),
  };
}

export function formatAeonVerificationText(result: AeonVerificationResult): string {
  return [
    `${result.ok ? 'ok' : 'failed'}${result.file ? ` ${result.file}` : ''}`,
    ...result.checks.map((check) => `${check.ok ? 'ok' : 'fail'} ${check.kind}: ${check.summary}`),
    ...result.diagnostics.map((diagnostic) => `${diagnostic.severity} ${diagnostic.code}: ${diagnostic.message}`),
    '',
  ].join('\n');
}

function verifyLedgerInput(
  ledgerText: string | undefined,
  ledgerKeyText: string | undefined,
  expectHead: string | undefined,
  diagnostics: AeonVerificationDiagnostic[],
  checks: AeonVerificationCheck[],
): LedgerVerificationResult | undefined {
  if (!ledgerText || !ledgerKeyText) {
    diagnostics.push({
      severity: 'error',
      code: 'LEDGER_INPUT_REQUIRED',
      message: 'Ledger verification requires both --ledger and --ledger-key.',
    });
    checks.push({
      kind: 'ledger',
      ok: false,
      summary: 'Ledger verification was requested but inputs were incomplete.',
    });
    return undefined;
  }

  const entries = parseLedgerJsonl(ledgerText);
  const keyring = parseLedgerKeyring(ledgerKeyText);
  const result = verifyLedger(entries, keyring);
  const headMismatch = expectHead !== undefined && result.head !== expectHead;

  checks.push({
    kind: 'ledger',
    ok: result.ok && !headMismatch,
    summary: result.ok && !headMismatch
      ? `Ledger verified with ${result.entries} entries.`
      : 'Ledger verification failed.',
  });

  for (const diagnostic of result.diagnostics) {
    diagnostics.push({
      severity: 'error',
      code: `LEDGER_${diagnostic.code}`,
      message: diagnostic.message,
    });
  }
  if (headMismatch) {
    diagnostics.push({
      severity: 'error',
      code: 'LEDGER_HEAD_MISMATCH',
      message: `Expected ledger head ${expectHead}, found ${result.head ?? '(empty)'}.`,
    });
  }
  return result;
}

function parseLedgerKeyring(text: string): LedgerKeyring {
  const parsed = JSON.parse(text) as LedgerKeyring | LedgerKeyPair;
  if ('privateJwk' in parsed && 'publicJwk' in parsed) {
    return {
      format: 'aeon.ledger.keyring',
      version: 1,
      keys: [ledgerPublicKeyFromKeyPair(parsed)],
    };
  }
  return parsed;
}

function hasStrictModeDeclaration(source: string): boolean {
  return /^\s*aeon:mode\s*=\s*"strict"\s*$/m.test(source);
}

function errorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && typeof (error as { readonly code?: unknown }).code === 'string') {
    return (error as { readonly code: string }).code;
  }
  return 'AEON_COMPILE_ERROR';
}
