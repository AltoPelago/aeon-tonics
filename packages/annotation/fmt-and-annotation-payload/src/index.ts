import type { AnnotationRecord } from '../../../../../aeon/implementations/typescript/packages/core/dist/index.js';
import type {
  FmtAndAndCoreBridgeOptions,
  FmtAndDocument,
  FmtAndParseTextOptions,
} from '../../../document/fmt-and-model/dist/index.js';
import { parseFmtAndDocument } from '../../../document/fmt-and-model/dist/index.js';

export interface ParseFmtAndAnnotationPayloadOptions extends FmtAndAndCoreBridgeOptions {
  readonly includeKinds?: readonly AnnotationRecord['kind'][];
}

export interface FmtAndAnnotationPayload {
  readonly record: AnnotationRecord;
  readonly text: string;
  readonly document: FmtAndDocument;
}

export interface FmtAndAnnotationPayloadIssue {
  readonly record: AnnotationRecord;
  readonly text: string;
  readonly message: string;
  readonly errorCode?: string;
  readonly diagnostic?: unknown;
}

export interface ParseFmtAndAnnotationPayloadsResult {
  readonly payloads: readonly FmtAndAnnotationPayload[];
  readonly issues: readonly FmtAndAnnotationPayloadIssue[];
}

export async function parseFmtAndAnnotationPayload(
  record: AnnotationRecord,
  options: ParseFmtAndAnnotationPayloadOptions = {},
): Promise<FmtAndAnnotationPayload> {
  const text = extractFmtAndAnnotationText(record);
  const parsed = await parseEmbeddedFmtAndDocument(text, options);
  if (!parsed.ok) {
    throw new Error(parsed.errorCode);
  }
  return {
    record,
    text,
    document: parsed.document,
  };
}

export async function parseFmtAndAnnotationPayloads(
  records: readonly AnnotationRecord[],
  options: ParseFmtAndAnnotationPayloadOptions = {},
): Promise<ParseFmtAndAnnotationPayloadsResult> {
  const payloads: FmtAndAnnotationPayload[] = [];
  const issues: FmtAndAnnotationPayloadIssue[] = [];
  const includeKinds = new Set(options.includeKinds ?? ['doc', 'annotation', 'hint']);

  for (const record of records) {
    if (!includeKinds.has(record.kind)) {
      continue;
    }

    const text = extractFmtAndAnnotationText(record);
    const parsed = await parseEmbeddedFmtAndDocument(text, options);
    if (!parsed.ok) {
      issues.push({
        record,
        text,
        message: parsed.errorCode,
        errorCode: parsed.errorCode,
        ...(parsed.diagnostic === undefined ? {} : { diagnostic: parsed.diagnostic }),
      });
      continue;
    }

    payloads.push({
      record,
      text,
      document: parsed.document,
    });
  }

  return { payloads, issues };
}

export function extractFmtAndAnnotationText(record: Pick<AnnotationRecord, 'form' | 'raw'>): string {
  return record.form === 'line'
    ? extractLineText(record.raw)
    : extractBlockText(record.raw);
}

function extractLineText(raw: string): string {
  const text = raw.trimStart();
  for (const marker of ['//#', '//@', '//?', '//{', '//[', '//(']) {
    if (text.startsWith(marker)) {
      return text.slice(marker.length).trimStart();
    }
  }
  return text;
}

function extractBlockText(raw: string): string {
  const text = raw.trim();
  const delimiters: readonly [string, string][] = [
    ['/#', '#/'],
    ['/@', '@/'],
    ['/?', '?/'],
    ['/{', '}/'],
    ['/[', ']/'],
    ['/(', ')/'],
  ];

  for (const [open, close] of delimiters) {
    if (text.startsWith(open) && text.endsWith(close)) {
      return text.slice(open.length, -close.length).trim();
    }
  }

  return text;
}

async function parseEmbeddedFmtAndDocument(
  text: string,
  options: ParseFmtAndAnnotationPayloadOptions,
) {
  const source = `&ND v1\n\n${text}`;
  const parseOptions: FmtAndParseTextOptions = options.andCoreModuleUrl === undefined
    ? {}
    : { andCoreModuleUrl: options.andCoreModuleUrl };
  return parseFmtAndDocument(source, parseOptions);
}
