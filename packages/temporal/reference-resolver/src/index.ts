export type ProfileStatus = 'admitted' | 'rejected';
export type AuthorityAssessment = 'confirmed' | 'contradicted' | 'unresolved';
export type MappingCardinality = 'zero' | 'one' | 'many' | 'unresolved';
export type TemporalContextKind =
  | 'local'
  | 'timescale'
  | 'namedPlace'
  | 'geographic'
  | 'timezone'
  | 'unresolved';

export interface TemporalAuthorityRef {
  readonly kind: 'leapSeconds' | 'tzdb' | 'clockRealization' | 'calendar' | 'coordinates' | 'smear';
  readonly id: string;
  readonly version: string;
  readonly retrievedAt: string;
  readonly effectiveInterval?: Readonly<{ from: string; through: string }>;
}

export interface ClockRealization {
  readonly model: 'direct' | 'smear' | 'posixLike' | 'unknown';
  readonly authority?: TemporalAuthorityRef;
  readonly smearId?: string;
}

export interface TemporalCandidate {
  readonly coordinate: 'unixLike' | 'utcLeap';
  readonly epochSecond: string;
  readonly fraction: string;
  readonly offset?: string;
}

export interface TemporalResolution {
  readonly claim: string;
  readonly profile: string;
  readonly profileStatus: ProfileStatus;
  readonly authorityAssessment: AuthorityAssessment;
  readonly mappingCardinality: MappingCardinality;
  readonly candidates: readonly TemporalCandidate[];
  readonly authorities: readonly TemporalAuthorityRef[];
  readonly contextKind?: TemporalContextKind;
  readonly reason?: string;
}

export interface LeapSecondAuthority {
  readonly ref: TemporalAuthorityRef;
  readonly positiveTransitionEpochSeconds: ReadonlySet<string>;
  readonly coverageThrough: string;
}

export interface TimezoneTransitionAuthority {
  readonly ref: TemporalAuthorityRef;
  readonly zone: string;
  readonly overlap: Readonly<{ date: string; hour: number; offsets: readonly [string, string] }>;
  readonly gap: Readonly<{ date: string; hour: number; previousOffset: string; nextOffset: string }>;
}

export interface SmearAuthority {
  readonly ref: TemporalAuthorityRef;
  readonly id: string;
  readonly transitionEpochSecond: string;
  readonly startEpochSecond: string;
  readonly nominalWindowSeconds: string;
  readonly adjustmentSeconds: 1 | -1;
}

export interface TemporalAuthorities {
  readonly leapSeconds?: LeapSecondAuthority;
  readonly timezone?: TimezoneTransitionAuthority;
  readonly smears?: readonly SmearAuthority[];
}

export interface ResolveTemporalOptions {
  readonly profile: 'aeon.gp.temporal.v1' | 'aeon.test.temporal.leap-aware.v1' | 'aeon.test.temporal.tz-transition.v1';
  readonly authorities?: TemporalAuthorities;
  readonly sourceClock?: ClockRealization;
}

export type PositiveLeapPolicy = 'preserve' | 'reject' | 'foldPrevious' | 'foldNext' | 'clampDown' | 'clampUp' | 'smear';
export type GapPolicy = 'reject' | 'null' | 'previousValid' | 'nextValid' | 'preserveClaim';
export type FractionMaterializationPolicy = 'reject' | 'truncate';

export type MaterializationResult =
  | Readonly<{ outcome: 'exact'; value: string; provenance: readonly string[] }>
  | Readonly<{ outcome: 'transformed'; value: string; provenance: readonly string[]; collision: boolean; invertible: boolean }>
  | Readonly<{ outcome: 'rationalCoordinate'; numerator: string; denominator: string; provenance: readonly string[]; collision: boolean; invertible: boolean }>
  | Readonly<{ outcome: 'null'; datatype: 'datetime'; reason: string; provenance: readonly string[] }>
  | Readonly<{ outcome: 'rejected'; reason: string; provenance: readonly string[] }>;

export const recognizedTimescales = Object.freeze(['UTC', 'TAI', 'UT1', 'TT', 'GPS'] as const);

const timescaleSet = new Set<string>(recognizedTimescales);
const gregorianMonthNames = Object.freeze([
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]);

interface ParsedClaim {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number | null;
  readonly second: number | null;
  readonly fraction: string;
  readonly anchor: string | null;
  readonly context: string | null;
}

export function classifyTemporalContext(context: string, knownTimezones: ReadonlySet<string> = new Set()): TemporalContextKind {
  if (context === 'local') return 'local';
  if (timescaleSet.has(context)) return 'timescale';
  if (/^\+\/[A-Za-z0-9_.+-]+(?:\/[A-Za-z0-9_.+-]+)*$/.test(context)) return 'namedPlace';
  if (isGeographicContext(context)) return 'geographic';
  if (knownTimezones.has(context)) return 'timezone';
  return 'unresolved';
}

export function resolveTemporalClaim(claim: string, options: ResolveTemporalOptions): TemporalResolution {
  const parsed = parseClaim(claim);
  if (parsed === null) return rejected(claim, options.profile, 'malformed temporal claim');

  const knownTimezones = options.authorities?.timezone === undefined
    ? new Set<string>()
    : new Set([options.authorities.timezone.zone]);
  const contextKind = parsed.context === null ? undefined : classifyTemporalContext(parsed.context, knownTimezones);
  const conflict = parsed.context !== null
    && timescaleSet.has(parsed.context)
    && parsed.context !== 'UTC'
    && parsed.anchor !== null
    && parsed.anchor !== '-00:00';
  if (conflict) return rejected(claim, options.profile, 'UTC-relative anchor conflicts with a non-UTC timescale', contextKind);
  if (options.profile === 'aeon.gp.temporal.v1' && parsed.second === 60) {
    return rejected(claim, options.profile, 'the general-purpose profile rejects second 60', contextKind);
  }
  if (parsed.second === 60 && parsed.context !== null && timescaleSet.has(parsed.context) && parsed.context !== 'UTC') {
    return {
      claim,
      profile: options.profile,
      profileStatus: 'admitted',
      authorityAssessment: 'contradicted',
      mappingCardinality: 'zero',
      candidates: [],
      authorities: [],
      ...(contextKind === undefined ? {} : { contextKind }),
      reason: 'UTC-style second 60 is not admitted by the selected continuous timescale',
    };
  }

  if (parsed.second === 60) return resolveLeapClaim(claim, parsed, options, contextKind);
  if (parsed.anchor === '-00:00') return unresolved(claim, options.profile, contextKind, 'unknown offset takes precedence over context inference');

  if (parsed.anchor !== null) {
    if (options.sourceClock?.model === 'smear' || options.sourceClock?.model === 'posixLike') {
      return {
        claim,
        profile: options.profile,
        profileStatus: 'admitted',
        authorityAssessment: options.sourceClock.authority === undefined ? 'unresolved' : 'confirmed',
        mappingCardinality: 'unresolved',
        candidates: [],
        authorities: options.sourceClock.authority === undefined ? [] : [options.sourceClock.authority],
        ...(contextKind === undefined ? {} : { contextKind }),
        reason: options.sourceClock.model === 'smear'
          ? 'smeared source coordinate requires an explicitly implemented inverse smear mapping'
          : 'POSIX-like clock behavior is insufficiently specific for exact inversion',
      };
    }
    const candidate = ordinaryCandidate(parsed);
    if (candidate === null) return unresolved(claim, options.profile, contextKind, 'reduced precision does not identify one instant');
    const zoneAssessment = assessAnchoredZone(parsed, options.authorities?.timezone);
    return {
      claim,
      profile: options.profile,
      profileStatus: 'admitted',
      authorityAssessment: zoneAssessment ?? assessClock(options.sourceClock),
      mappingCardinality: 'one',
      candidates: [candidate],
      authorities: collectAuthorities(options, zoneAssessment !== null),
      ...(contextKind === undefined ? {} : { contextKind }),
      ...(zoneAssessment === 'contradicted' ? { reason: 'numeric offset conflicts with the pinned timezone transition data' } : {}),
    };
  }

  if (parsed.context === 'UTC') {
    const candidate = ordinaryCandidate({ ...parsed, anchor: 'Z' });
    if (candidate === null) return unresolved(claim, options.profile, contextKind, 'reduced precision does not identify one instant');
    return admittedOne(claim, options.profile, candidate, assessClock(options.sourceClock), [], contextKind);
  }
  if (contextKind === 'timezone') return resolveTimezoneCivil(claim, parsed, options, contextKind);
  if (contextKind === 'timescale') return unresolved(claim, options.profile, contextKind, 'timescale conversion authority is unavailable');
  if (contextKind === 'namedPlace' || contextKind === 'geographic') {
    return unresolved(claim, options.profile, contextKind, 'place or coordinate context requires a domain resolver');
  }
  if (contextKind === 'local') return unresolved(claim, options.profile, contextKind, 'resolver-local context was not supplied');
  return unresolved(claim, options.profile, contextKind, 'civil claim has no instant anchor');
}

export function selectTemporalCandidate(
  resolution: TemporalResolution,
  policy: 'reject' | 'earlier' | 'later',
): TemporalCandidate | null {
  if (resolution.mappingCardinality !== 'many') return resolution.mappingCardinality === 'one' ? resolution.candidates[0] ?? null : null;
  if (policy === 'reject') return null;
  const sorted = [...resolution.candidates].sort((left, right) => compareBigIntText(left.epochSecond, right.epochSecond));
  return policy === 'earlier' ? sorted[0] ?? null : sorted.at(-1) ?? null;
}

export function materializePositiveLeap(
  claim: string,
  policy: PositiveLeapPolicy,
  options: Readonly<{ targetFractionDigits?: number; smearId?: string; authorities?: TemporalAuthorities }> = {},
): MaterializationResult {
  const parsed = parseClaim(claim);
  if (parsed === null || parsed.second !== 60) return { outcome: 'rejected', reason: 'claim is not a positive leap-second coordinate', provenance: [] };
  if (policy === 'preserve') return { outcome: 'exact', value: claim, provenance: ['policy:preserve'] };
  if (policy === 'reject') return { outcome: 'rejected', reason: 'target does not support positive leap seconds', provenance: ['policy:reject'] };
  const digits = options.targetFractionDigits ?? parsed.fraction.length;
  if (!Number.isInteger(digits) || digits < 0 || digits > 1000) {
    return { outcome: 'rejected', reason: 'targetFractionDigits must be an integer from 0 through 1000', provenance: [] };
  }
  if (policy === 'smear') {
    const smear = options.authorities?.smears?.find((candidate) => candidate.id === options.smearId);
    if (smear === undefined) return { outcome: 'rejected', reason: 'named smear authority is unavailable', provenance: ['policy:smear'] };
    const boundary = leapBoundaryEpochSecond(parsed);
    if (boundary === null || boundary.toString() !== smear.transitionEpochSecond) {
      return { outcome: 'rejected', reason: 'smear authority does not cover this leap transition', provenance: [`smear:${smear.id}`] };
    }
    const scale = 10n ** BigInt(parsed.fraction.length);
    const fractional = parsed.fraction.length === 0 ? 0n : BigInt(parsed.fraction);
    const actualScaled = (boundary - BigInt(smear.startEpochSecond)) * scale + fractional;
    const window = BigInt(smear.nominalWindowSeconds);
    const denominator = (window + BigInt(smear.adjustmentSeconds)) * scale;
    const numerator = BigInt(smear.startEpochSecond) * denominator + actualScaled * window;
    return {
      outcome: 'rationalCoordinate',
      numerator: numerator.toString(),
      denominator: denominator.toString(),
      provenance: [`policy:smear`, `smear:${smear.id}`, `authority:${smear.ref.id}@${smear.ref.version}`],
      collision: false,
      invertible: false,
    };
  }
  if (policy === 'foldPrevious') return transformed(replaceSecond(claim, '59', fitFraction(parsed.fraction, digits)), policy, true);
  const next = nextCivilSecond(parsed);
  if (next === null) return { outcome: 'rejected', reason: 'cannot represent transformed coordinate', provenance: [`policy:${policy}`] };
  if (policy === 'foldNext') return transformed(renderClaim(next, fitFraction(parsed.fraction, digits)), policy, true);
  if (policy === 'clampDown') return transformed(replaceSecond(claim, '59', digits === 0 ? '' : '9'.repeat(digits)), policy, true);
  return transformed(renderClaim(next, digits === 0 ? '' : '0'.repeat(digits)), 'clampUp', true);
}

export function materializeGap(
  resolution: TemporalResolution,
  policy: GapPolicy,
  authority?: TimezoneTransitionAuthority,
): MaterializationResult {
  if (resolution.mappingCardinality !== 'zero') {
    return { outcome: 'rejected', reason: 'gap policy requires a zero-candidate mapping', provenance: [`policy:${policy}`] };
  }
  if (policy === 'reject') return { outcome: 'rejected', reason: 'temporal coordinate falls in a gap', provenance: ['policy:reject'] };
  if (policy === 'null') return { outcome: 'null', datatype: 'datetime', reason: 'temporal coordinate falls in a gap', provenance: ['policy:null'] };
  if (policy === 'preserveClaim') return { outcome: 'exact', value: resolution.claim, provenance: ['policy:preserveClaim'] };
  if (authority === undefined) return { outcome: 'rejected', reason: 'gap authority is unavailable', provenance: [`policy:${policy}`] };
  const parsed = parseClaim(resolution.claim);
  if (parsed === null) return { outcome: 'rejected', reason: 'malformed temporal claim', provenance: [`policy:${policy}`] };
  const replacement = policy === 'previousValid'
    ? { ...parsed, hour: authority.gap.hour - 1, minute: 59, second: 59, anchor: authority.gap.previousOffset }
    : { ...parsed, hour: authority.gap.hour + 1, minute: 0, second: 0, anchor: authority.gap.nextOffset };
  const boundaryFraction = parsed.fraction.length === 0
    ? ''
    : (policy === 'previousValid' ? '9' : '0').repeat(parsed.fraction.length);
  return transformed(renderClaim(replacement, boundaryFraction), policy, false);
}

export function materializeFraction(
  claim: string,
  maximumFractionDigits: number,
  policy: FractionMaterializationPolicy,
): MaterializationResult {
  if (!Number.isInteger(maximumFractionDigits) || maximumFractionDigits < 0 || maximumFractionDigits > 1000) {
    return { outcome: 'rejected', reason: 'maximumFractionDigits must be an integer from 0 through 1000', provenance: [] };
  }
  const match = /\.(\d+)(?=Z|[+-]\d{2}:\d{2}|&|$)/.exec(claim);
  if (match === null || match[1]!.length <= maximumFractionDigits) {
    return { outcome: 'exact', value: claim, provenance: [`targetPrecision:${maximumFractionDigits}`] };
  }
  if (policy === 'reject') {
    return { outcome: 'rejected', reason: 'target precision cannot preserve the authored fractional scale', provenance: [`policy:reject`, `targetPrecision:${maximumFractionDigits}`] };
  }
  const kept = match[1]!.slice(0, maximumFractionDigits);
  const value = claim.slice(0, match.index)
    + (maximumFractionDigits === 0 ? '' : `.${kept}`)
    + claim.slice(match.index + match[0].length);
  return {
    outcome: 'transformed',
    value,
    provenance: ['policy:truncate', `targetPrecision:${maximumFractionDigits}`, `sourceScale:${match[1]!.length}`],
    collision: true,
    invertible: false,
  };
}

export interface CalendarDateValue {
  readonly calendar: string;
  readonly year: number;
  readonly monthCode: string;
  readonly day: number;
  readonly month?: number;
  readonly monthName?: string;
  readonly time?: string;
}

export function validateCalendarValue(value: CalendarDateValue): Readonly<{
  profileStatus: ProfileStatus;
  authorityAssessment: AuthorityAssessment;
  reason?: string;
}> {
  if (!Number.isInteger(value.year) || !Number.isInteger(value.day) || !/^M(?:0[1-9]|1[0-9])L?$/.test(value.monthCode)) {
    return { profileStatus: 'rejected', authorityAssessment: 'contradicted', reason: 'invalid common calendar fields' };
  }
  if (value.calendar !== 'gregory') return { profileStatus: 'admitted', authorityAssessment: 'unresolved' };
  const codeMonth = Number(value.monthCode.slice(1, 3));
  if (value.monthCode.endsWith('L') || codeMonth > 12 || (value.month !== undefined && value.month !== codeMonth)) {
    return { profileStatus: 'rejected', authorityAssessment: 'contradicted', reason: 'Gregorian redundant month fields conflict' };
  }
  if (value.monthName !== undefined && value.monthName !== gregorianMonthNames[codeMonth - 1]) {
    return { profileStatus: 'rejected', authorityAssessment: 'contradicted', reason: 'Gregorian monthName conflicts with monthCode' };
  }
  if (!validDate(value.year, codeMonth, value.day)) {
    return { profileStatus: 'rejected', authorityAssessment: 'contradicted', reason: 'invalid Gregorian date' };
  }
  return { profileStatus: 'admitted', authorityAssessment: 'confirmed' };
}

export const referenceLeapAuthority: LeapSecondAuthority = Object.freeze({
  ref: authority('leapSeconds', 'ietf:leap-seconds.list', '2017-01-01-fixture', '1972-01-01', '2026-12-31'),
  positiveTransitionEpochSeconds: new Set([gregorianEpochSecond(2017, 1, 1, 0, 0, 0).toString()]),
  coverageThrough: '2026-12-31',
});

export const referenceMelbourneAuthority: TimezoneTransitionAuthority = Object.freeze({
  ref: authority('tzdb', 'iana:tzdb', '2025b-fixture', '2025-01-01', '2025-12-31'),
  zone: 'Australia/Melbourne',
  overlap: { date: '2025-04-06', hour: 2, offsets: ['+11:00', '+10:00'] as const },
  gap: { date: '2025-10-05', hour: 2, previousOffset: '+10:00', nextOffset: '+11:00' },
});

export const referenceGoogle24HourSmear: SmearAuthority = Object.freeze({
  ref: authority('smear', 'google:leap-smear', 'linear-24h-fixture', '2016-12-31T12:00:00Z', '2017-01-01T12:00:00Z'),
  id: 'google:linear-24h',
  transitionEpochSecond: gregorianEpochSecond(2017, 1, 1, 0, 0, 0).toString(),
  startEpochSecond: gregorianEpochSecond(2016, 12, 31, 12, 0, 0).toString(),
  nominalWindowSeconds: '86400',
  adjustmentSeconds: 1,
});

export const referenceHypotheticalNegativeSmear: SmearAuthority = Object.freeze({
  ref: authority('smear', 'aeon-fixture:negative-linear-smear', '1', '2030-06-30T12:00:00Z', '2030-07-01T12:00:00Z'),
  id: 'aeon-fixture:negative-linear-24h',
  transitionEpochSecond: gregorianEpochSecond(2030, 7, 1, 0, 0, 0).toString(),
  startEpochSecond: gregorianEpochSecond(2030, 6, 30, 12, 0, 0).toString(),
  nominalWindowSeconds: '86400',
  adjustmentSeconds: -1,
});

function resolveLeapClaim(
  claim: string,
  parsed: ParsedClaim,
  options: ResolveTemporalOptions,
  contextKind: TemporalContextKind | undefined,
): TemporalResolution {
  const leapAuthority = options.authorities?.leapSeconds;
  if (leapAuthority === undefined) return unresolved(claim, options.profile, contextKind, 'leap-second authority is unavailable');
  if (parsed.anchor === null && parsed.context === 'UTC') parsed = { ...parsed, anchor: 'Z' };
  if (parsed.anchor === null || parsed.anchor === '-00:00') {
    return unresolved(claim, options.profile, contextKind, 'leap claim lacks a known UTC-relative offset');
  }
  const boundary = leapBoundaryEpochSecond(parsed);
  if (boundary === null) return unresolved(claim, options.profile, contextKind, 'reduced leap claim cannot map to one candidate');
  const confirmed = leapAuthority.positiveTransitionEpochSeconds.has(boundary.toString());
  return {
    claim,
    profile: options.profile,
    profileStatus: 'admitted',
    authorityAssessment: confirmed ? 'confirmed' : isAfterCoverage(parsed, leapAuthority.coverageThrough) ? 'unresolved' : 'contradicted',
    mappingCardinality: confirmed ? 'one' : isAfterCoverage(parsed, leapAuthority.coverageThrough) ? 'unresolved' : 'zero',
    candidates: confirmed ? [{ coordinate: 'utcLeap', epochSecond: boundary.toString(), fraction: parsed.fraction, offset: parsed.anchor }] : [],
    authorities: [leapAuthority.ref],
    ...(contextKind === undefined ? {} : { contextKind }),
    ...(!confirmed ? { reason: isAfterCoverage(parsed, leapAuthority.coverageThrough) ? 'claim is outside authority coverage' : 'authority has no leap at this instant' } : {}),
  };
}

function resolveTimezoneCivil(
  claim: string,
  parsed: ParsedClaim,
  options: ResolveTemporalOptions,
  contextKind: TemporalContextKind,
): TemporalResolution {
  const timezone = options.authorities?.timezone;
  if (timezone === undefined || parsed.context !== timezone.zone) return unresolved(claim, options.profile, contextKind, 'timezone authority is unavailable');
  if (parsed.minute === null || parsed.second === null) return unresolved(claim, options.profile, contextKind, 'fixture resolver requires complete clock fields');
  const date = formatDate(parsed);
  if (date === timezone.gap.date && parsed.hour === timezone.gap.hour) {
    return {
      claim,
      profile: options.profile,
      profileStatus: 'admitted',
      authorityAssessment: 'confirmed',
      mappingCardinality: 'zero',
      candidates: [],
      authorities: [timezone.ref],
      contextKind,
      reason: 'local coordinate falls in a pinned timezone gap',
    };
  }
  if (date === timezone.overlap.date && parsed.hour === timezone.overlap.hour) {
    const candidates = timezone.overlap.offsets.map((offset) => ordinaryCandidate({ ...parsed, anchor: offset })).filter(isCandidate);
    return {
      claim,
      profile: options.profile,
      profileStatus: 'admitted',
      authorityAssessment: 'confirmed',
      mappingCardinality: 'many',
      candidates,
      authorities: [timezone.ref],
      contextKind,
      reason: 'local coordinate falls in a pinned timezone overlap',
    };
  }
  return unresolved(claim, options.profile, contextKind, 'fixture authority intentionally covers transition windows only');
}

function assessAnchoredZone(parsed: ParsedClaim, timezone: TimezoneTransitionAuthority | undefined): AuthorityAssessment | null {
  if (parsed.context === null || timezone === undefined || parsed.context !== timezone.zone) return null;
  if (parsed.anchor === null) return 'unresolved';
  const date = formatDate(parsed);
  if (date === timezone.overlap.date && parsed.hour === timezone.overlap.hour) {
    return timezone.overlap.offsets.includes(parsed.anchor) ? 'confirmed' : 'contradicted';
  }
  if (date === timezone.gap.date && parsed.hour === timezone.gap.hour) return 'contradicted';
  return 'unresolved';
}

function parseClaim(claim: string): ParsedClaim | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})(?::(\d{2})?)?(?::(\d{2})(?:\.(\d+))?)?(Z|[+-]\d{2}:\d{2})?(?:&(.+))?$/.exec(claim);
  if (match === null) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = match[5] === undefined || match[5] === '' ? null : Number(match[5]);
  const second = match[6] === undefined ? null : Number(match[6]);
  const anchor = match[8] ?? null;
  if (!validDate(year, month, day) || hour > 23 || (minute !== null && minute > 59) || (second !== null && second > 60)) return null;
  if (anchor !== null && anchor !== 'Z' && (Number(anchor.slice(1, 3)) > 23 || Number(anchor.slice(4, 6)) > 59)) return null;
  return { year, month, day, hour, minute, second, fraction: match[7] ?? '', anchor, context: match[9] ?? null };
}

function ordinaryCandidate(parsed: ParsedClaim): TemporalCandidate | null {
  if (parsed.minute === null || parsed.second === null || parsed.second === 60 || parsed.anchor === null || parsed.anchor === '-00:00') return null;
  const offset = parsed.anchor === 'Z' ? 0 : offsetMinutes(parsed.anchor);
  const epochSecond = gregorianEpochSecond(parsed.year, parsed.month, parsed.day, parsed.hour, parsed.minute, parsed.second) - BigInt(offset * 60);
  return { coordinate: 'unixLike', epochSecond: epochSecond.toString(), fraction: parsed.fraction, offset: parsed.anchor };
}

function leapBoundaryEpochSecond(parsed: ParsedClaim): bigint | null {
  if (parsed.minute === null || parsed.second !== 60 || parsed.anchor === null || parsed.anchor === '-00:00') return null;
  const offset = parsed.anchor === 'Z' ? 0 : offsetMinutes(parsed.anchor);
  return gregorianEpochSecond(parsed.year, parsed.month, parsed.day, parsed.hour, parsed.minute, 59) + 1n - BigInt(offset * 60);
}

function gregorianEpochSecond(year: number, month: number, day: number, hour: number, minute: number, second: number): bigint {
  return (dateOrdinal(year, month, day) - dateOrdinal(1970, 1, 1)) * 86_400n
    + BigInt(hour * 3_600 + minute * 60 + second);
}

function dateOrdinal(year: number, month: number, day: number): bigint {
  const priorYear = BigInt(year - 1);
  const priorDays = priorYear * 365n + priorYear / 4n - priorYear / 100n + priorYear / 400n;
  const monthDays = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  return priorDays + BigInt(monthDays[month - 1]! + (month > 2 && isLeapYear(year) ? 1 : 0) + day - 1);
}

function validDate(year: number, month: number, day: number): boolean {
  if (year < 1 || year > 9999 || month < 1 || month > 12) return false;
  const days = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1]!;
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function offsetMinutes(offset: string): number {
  const magnitude = Number(offset.slice(1, 3)) * 60 + Number(offset.slice(4, 6));
  return offset.startsWith('-') ? -magnitude : magnitude;
}

function assessClock(clock: ClockRealization | undefined): AuthorityAssessment {
  if (clock?.model === 'direct' && clock.smearId !== undefined) return 'contradicted';
  return clock?.model === 'direct' && clock.authority !== undefined ? 'confirmed' : 'unresolved';
}

function collectAuthorities(options: ResolveTemporalOptions, includeTimezone: boolean): readonly TemporalAuthorityRef[] {
  const refs: TemporalAuthorityRef[] = [];
  if (options.sourceClock?.authority !== undefined) refs.push(options.sourceClock.authority);
  if (includeTimezone && options.authorities?.timezone !== undefined) refs.push(options.authorities.timezone.ref);
  return refs;
}

function authority(
  kind: TemporalAuthorityRef['kind'],
  id: string,
  version: string,
  from: string,
  through: string,
): TemporalAuthorityRef {
  return { kind, id, version, retrievedAt: '2026-09-28T00:00:00Z', effectiveInterval: { from, through } };
}

function rejected(claim: string, profile: string, reason: string, contextKind?: TemporalContextKind): TemporalResolution {
  return { claim, profile, profileStatus: 'rejected', authorityAssessment: 'unresolved', mappingCardinality: 'unresolved', candidates: [], authorities: [], ...(contextKind === undefined ? {} : { contextKind }), reason };
}

function unresolved(claim: string, profile: string, contextKind: TemporalContextKind | undefined, reason: string): TemporalResolution {
  return { claim, profile, profileStatus: 'admitted', authorityAssessment: 'unresolved', mappingCardinality: 'unresolved', candidates: [], authorities: [], ...(contextKind === undefined ? {} : { contextKind }), reason };
}

function admittedOne(
  claim: string,
  profile: string,
  candidate: TemporalCandidate,
  assessment: AuthorityAssessment,
  authorities: readonly TemporalAuthorityRef[],
  contextKind?: TemporalContextKind,
): TemporalResolution {
  return { claim, profile, profileStatus: 'admitted', authorityAssessment: assessment, mappingCardinality: 'one', candidates: [candidate], authorities, ...(contextKind === undefined ? {} : { contextKind }) };
}

function transformed(value: string, policy: string, collision: boolean): MaterializationResult {
  return { outcome: 'transformed', value, provenance: [`policy:${policy}`], collision, invertible: false };
}

function replaceSecond(claim: string, second: string, fraction: string): string {
  return claim.replace(/:60(?:\.\d+)?/, `:${second}${fraction === '' ? '' : `.${fraction}`}`);
}

function fitFraction(fraction: string, digits: number): string {
  if (digits === 0) return '';
  return fraction.slice(0, digits).padEnd(digits, '0');
}

function nextCivilSecond(parsed: ParsedClaim): ParsedClaim | null {
  const epoch = gregorianEpochSecond(parsed.year, parsed.month, parsed.day, parsed.hour, parsed.minute ?? 0, 59) + 1n;
  const next = fromEpochSecond(epoch, null, null);
  return next === null ? null : { ...next, anchor: parsed.anchor, context: parsed.context };
}

function fromEpochSecond(epoch: bigint, anchor: string | null, context: string | null): ParsedClaim | null {
  const localEpoch = anchor !== null && anchor !== 'Z' && anchor !== '-00:00' ? epoch + BigInt(offsetMinutes(anchor) * 60) : epoch;
  let day = floorDiv(localEpoch, 86_400n);
  let remainder = localEpoch - day * 86_400n;
  let year = 1970;
  if (day >= 0n) {
    while (day >= BigInt(isLeapYear(year) ? 366 : 365)) day -= BigInt(isLeapYear(year++) ? 366 : 365);
  } else {
    do { year -= 1; day += BigInt(isLeapYear(year) ? 366 : 365); } while (day < 0n);
  }
  if (year < 1 || year > 9999) return null;
  const monthLengths = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let month = 1;
  while (day >= BigInt(monthLengths[month - 1]!)) day -= BigInt(monthLengths[month++ - 1]!);
  const hour = Number(remainder / 3_600n);
  remainder %= 3_600n;
  const minute = Number(remainder / 60n);
  const second = Number(remainder % 60n);
  return { year, month, day: Number(day) + 1, hour, minute, second, fraction: '', anchor, context };
}

function floorDiv(value: bigint, divisor: bigint): bigint {
  const quotient = value / divisor;
  return value < 0n && value % divisor !== 0n ? quotient - 1n : quotient;
}

function renderClaim(parsed: ParsedClaim, fraction: string): string {
  const clock = `${two(parsed.hour)}:${two(parsed.minute ?? 0)}:${two(parsed.second ?? 0)}${fraction === '' ? '' : `.${fraction}`}`;
  return `${formatDate(parsed)}T${clock}${parsed.anchor ?? ''}${parsed.context === null ? '' : `&${parsed.context}`}`;
}

function formatDate(parsed: Pick<ParsedClaim, 'year' | 'month' | 'day'>): string {
  return `${String(parsed.year).padStart(4, '0')}-${two(parsed.month)}-${two(parsed.day)}`;
}

function two(value: number): string {
  return String(value).padStart(2, '0');
}

function isAfterCoverage(parsed: ParsedClaim, coverageThrough: string): boolean {
  return formatDate(parsed) > coverageThrough;
}

function isGeographicContext(context: string): boolean {
  return /^[-+]?\d+(?:\.\d+)?([/,])[-+]?\d+(?:\.\d+)?(?:\1[-+]?\d+(?:\.\d+)?)?$/.test(context);
}

function compareBigIntText(left: string, right: string): number {
  const a = BigInt(left);
  const b = BigInt(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

function isCandidate(candidate: TemporalCandidate | null): candidate is TemporalCandidate {
  return candidate !== null;
}
