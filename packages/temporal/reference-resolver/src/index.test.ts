import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyTemporalContext,
  materializeFraction,
  materializeGap,
  materializePositiveLeap,
  referenceGoogle24HourSmear,
  referenceHypotheticalNegativeSmear,
  referenceLeapAuthority,
  referenceMelbourneAuthority,
  resolveTemporalClaim,
  selectTemporalCandidate,
  validateCalendarValue,
  type TemporalAuthorityRef,
  type TimezoneTransitionAuthority,
} from './index.js';

const authorities = {
  leapSeconds: referenceLeapAuthority,
  timezone: referenceMelbourneAuthority,
  smears: [referenceGoogle24HourSmear],
};

test('classifies WTC context without treating every suffix as a timezone', () => {
  assert.equal(classifyTemporalContext('local'), 'local');
  assert.equal(classifyTemporalContext('TAI'), 'timescale');
  assert.equal(classifyTemporalContext('+/Antarctica/Elisabeth'), 'namedPlace');
  assert.equal(classifyTemporalContext('-37.814/144.96332'), 'geographic');
  assert.equal(classifyTemporalContext('Australia/Melbourne'), 'unresolved');
  assert.equal(classifyTemporalContext('Australia/Melbourne', new Set(['Australia/Melbourne'])), 'timezone');
  assert.equal(classifyTemporalContext('Melbourne'), 'unresolved');
});

test('keeps profile admission separate from authority assessment and mapping', () => {
  const gp = resolveTemporalClaim('2016-12-31T23:59:60Z', {
    profile: 'aeon.gp.temporal.v1',
    authorities,
  });
  assert.equal(gp.profileStatus, 'rejected');
  assert.equal(gp.mappingCardinality, 'unresolved');

  const leap = resolveTemporalClaim('2016-12-31T23:59:60.3400Z', {
    profile: 'aeon.test.temporal.leap-aware.v1',
    authorities,
  });
  assert.equal(leap.profileStatus, 'admitted');
  assert.equal(leap.authorityAssessment, 'confirmed');
  assert.equal(leap.mappingCardinality, 'one');
  assert.equal(leap.candidates[0]?.fraction, '3400');

  const falseLeap = resolveTemporalClaim('2016-12-30T23:59:60Z', {
    profile: 'aeon.test.temporal.leap-aware.v1',
    authorities,
  });
  assert.equal(falseLeap.authorityAssessment, 'contradicted');
  assert.equal(falseLeap.mappingCardinality, 'zero');

  const futureLeap = resolveTemporalClaim('2027-12-31T23:59:60Z', {
    profile: 'aeon.test.temporal.leap-aware.v1',
    authorities,
  });
  assert.equal(futureLeap.authorityAssessment, 'unresolved');
  assert.equal(futureLeap.mappingCardinality, 'unresolved');

  const tai = resolveTemporalClaim('2016-12-31T23:59:60&TAI', {
    profile: 'aeon.test.temporal.leap-aware.v1',
    authorities,
  });
  assert.equal(tai.authorityAssessment, 'contradicted');
  assert.equal(tai.mappingCardinality, 'zero');
});

test('maps offset projections of the same leap instant without requiring local 23:59', () => {
  const claims = [
    '2016-12-31T23:59:60Z',
    '2016-12-31T18:59:60-05:00',
    '2017-01-01T12:59:60+13:00',
    '2017-01-01T10:59:60+11:00&Australia/Melbourne',
  ];
  const mapped = claims.map((claim) => resolveTemporalClaim(claim, {
    profile: 'aeon.test.temporal.leap-aware.v1',
    authorities,
  }));
  assert.deepEqual(new Set(mapped.map((result) => result.candidates[0]?.epochSecond)).size, 1);
  assert.ok(mapped.every((result) => result.authorityAssessment === 'confirmed'));
});

test('does not infer an unsmeared source clock from lexical Z', () => {
  const ordinary = resolveTemporalClaim('2025-01-01T00:00:00Z', {
    profile: 'aeon.test.temporal.leap-aware.v1',
  });
  assert.equal(ordinary.mappingCardinality, 'one');
  assert.equal(ordinary.authorityAssessment, 'unresolved');

  const clockAuthority: TemporalAuthorityRef = {
    kind: 'clockRealization',
    id: 'fixture:unsmeared-utc-clock',
    version: '1',
    retrievedAt: '2026-09-28T00:00:00Z',
  };
  const attested = resolveTemporalClaim('2025-01-01T00:00:00Z', {
    profile: 'aeon.test.temporal.leap-aware.v1',
    sourceClock: { model: 'direct', authority: clockAuthority },
  });
  assert.equal(attested.authorityAssessment, 'confirmed');
  assert.deepEqual(attested.authorities, [clockAuthority]);

  const smeared = resolveTemporalClaim('2025-01-01T00:00:00Z', {
    profile: 'aeon.test.temporal.leap-aware.v1',
    sourceClock: { model: 'smear', smearId: referenceGoogle24HourSmear.id, authority: referenceGoogle24HourSmear.ref },
  });
  assert.equal(smeared.authorityAssessment, 'confirmed');
  assert.equal(smeared.mappingCardinality, 'unresolved');
  assert.deepEqual(smeared.authorities, [referenceGoogle24HourSmear.ref]);

  const incompleteSmear = resolveTemporalClaim('2025-01-01T00:00:00Z', {
    profile: 'aeon.test.temporal.leap-aware.v1',
    sourceClock: { model: 'smear' },
  });
  assert.equal(incompleteSmear.authorityAssessment, 'unresolved');
  assert.equal(incompleteSmear.mappingCardinality, 'unresolved');

  const conflictingClock = resolveTemporalClaim('2025-01-01T00:00:00Z', {
    profile: 'aeon.test.temporal.leap-aware.v1',
    sourceClock: { model: 'direct', smearId: referenceGoogle24HourSmear.id, authority: clockAuthority },
  });
  assert.equal(conflictingClock.authorityAssessment, 'contradicted');

  assert.equal(referenceHypotheticalNegativeSmear.adjustmentSeconds, -1);
});

test('reports Melbourne gap and overlap before applying a policy', () => {
  const overlap = resolveTemporalClaim('2025-04-06T02:30:00.25&Australia/Melbourne', {
    profile: 'aeon.test.temporal.tz-transition.v1',
    authorities,
  });
  assert.equal(overlap.authorityAssessment, 'confirmed');
  assert.equal(overlap.mappingCardinality, 'many');
  assert.equal(overlap.candidates.length, 2);
  assert.notEqual(selectTemporalCandidate(overlap, 'earlier')?.epochSecond, selectTemporalCandidate(overlap, 'later')?.epochSecond);
  assert.equal(selectTemporalCandidate(overlap, 'reject'), null);

  const gap = resolveTemporalClaim('2025-10-05T02:30:00.25&Australia/Melbourne', {
    profile: 'aeon.test.temporal.tz-transition.v1',
    authorities,
  });
  assert.equal(gap.authorityAssessment, 'confirmed');
  assert.equal(gap.mappingCardinality, 'zero');
  assert.equal(materializeGap(gap, 'null', referenceMelbourneAuthority).outcome, 'null');
  const previous = materializeGap(gap, 'previousValid', referenceMelbourneAuthority);
  const next = materializeGap(gap, 'nextValid', referenceMelbourneAuthority);
  assert.equal(previous.outcome, 'transformed');
  assert.equal(next.outcome, 'transformed');
  assert.match(previous.outcome === 'transformed' ? previous.value : '', /T01:59:59\.99\+10:00/);
  assert.match(next.outcome === 'transformed' ? next.value : '', /T03:00:00\.00\+11:00/);
  assert.equal(materializeGap(gap, 'preserveClaim', referenceMelbourneAuthority).outcome, 'exact');

  const unavailable = resolveTemporalClaim('2025-04-06T02:30:00.25&Australia/Melbourne', {
    profile: 'aeon.test.temporal.tz-transition.v1',
  });
  assert.equal(unavailable.mappingCardinality, 'unresolved');

  const changedAuthority: TimezoneTransitionAuthority = {
    ...referenceMelbourneAuthority,
    ref: { ...referenceMelbourneAuthority.ref, version: 'changed-rules-fixture' },
    overlap: { ...referenceMelbourneAuthority.overlap, offsets: ['+11:00', '+09:30'] },
  };
  const changed = resolveTemporalClaim('2025-04-06T02:30:00.25&Australia/Melbourne', {
    profile: 'aeon.test.temporal.tz-transition.v1',
    authorities: { ...authorities, timezone: changedAuthority },
  });
  assert.equal(changed.mappingCardinality, 'many');
  assert.notDeepEqual(changed.candidates, overlap.candidates);
});

test('checks explicit zone offsets and preserves unknown-offset precedence', () => {
  const agreement = resolveTemporalClaim('2025-04-06T02:30:00+11:00&Australia/Melbourne', {
    profile: 'aeon.test.temporal.tz-transition.v1',
    authorities,
  });
  assert.equal(agreement.authorityAssessment, 'confirmed');
  assert.equal(agreement.mappingCardinality, 'one');

  const conflict = resolveTemporalClaim('2025-04-06T02:30:00+09:00&Australia/Melbourne', {
    profile: 'aeon.test.temporal.tz-transition.v1',
    authorities,
  });
  assert.equal(conflict.authorityAssessment, 'contradicted');
  assert.equal(conflict.mappingCardinality, 'one');

  const unknown = resolveTemporalClaim('2025-04-06T02:30:00-00:00&Australia/Melbourne', {
    profile: 'aeon.test.temporal.tz-transition.v1',
    authorities,
  });
  assert.equal(unknown.mappingCardinality, 'unresolved');
});

test('implements distinct positive leap materialization policies with visible loss', () => {
  const claim = '2016-12-31T23:59:60.25Z';
  assert.equal(materializePositiveLeap(claim, 'preserve').outcome, 'exact');
  assert.equal(materializePositiveLeap(claim, 'reject').outcome, 'rejected');
  assert.deepEqual(materializePositiveLeap(claim, 'foldPrevious', { targetFractionDigits: 3 }), {
    outcome: 'transformed', value: '2016-12-31T23:59:59.250Z', provenance: ['policy:foldPrevious'], collision: true, invertible: false,
  });
  assert.deepEqual(materializePositiveLeap(claim, 'foldNext', { targetFractionDigits: 3 }), {
    outcome: 'transformed', value: '2017-01-01T00:00:00.250Z', provenance: ['policy:foldNext'], collision: true, invertible: false,
  });
  assert.deepEqual(materializePositiveLeap(claim, 'clampDown', { targetFractionDigits: 3 }), {
    outcome: 'transformed', value: '2016-12-31T23:59:59.999Z', provenance: ['policy:clampDown'], collision: true, invertible: false,
  });
  assert.deepEqual(materializePositiveLeap(claim, 'clampUp', { targetFractionDigits: 3 }), {
    outcome: 'transformed', value: '2017-01-01T00:00:00.000Z', provenance: ['policy:clampUp'], collision: true, invertible: false,
  });
  const smear = materializePositiveLeap(claim, 'smear', {
    smearId: referenceGoogle24HourSmear.id,
    authorities,
  });
  assert.equal(smear.outcome, 'rationalCoordinate');
  assert.equal(smear.invertible, false);
});

test('makes precision-limited runtime loss explicit', () => {
  assert.deepEqual(materializeFraction('2027-01-31T23:59:59.340000Z', 3, 'truncate'), {
    outcome: 'transformed',
    value: '2027-01-31T23:59:59.340Z',
    provenance: ['policy:truncate', 'targetPrecision:3', 'sourceScale:6'],
    collision: true,
    invertible: false,
  });
  assert.equal(materializeFraction('2027-01-31T23:59:59.340000Z', 3, 'reject').outcome, 'rejected');
  assert.equal(materializeFraction('2027-01-31T23:59:59.340Z', 3, 'truncate').outcome, 'exact');
});

test('validates common calendar fields without pretending to know observational calendars', () => {
  assert.deepEqual(validateCalendarValue({ calendar: 'gregory', year: 2029, monthCode: 'M01', month: 1, monthName: 'January', day: 19, time: '23:00:01' }), {
    profileStatus: 'admitted', authorityAssessment: 'confirmed',
  });
  assert.equal(validateCalendarValue({ calendar: 'gregory', year: 2029, monthCode: 'M02', month: 1, day: 19 }).profileStatus, 'rejected');
  assert.deepEqual(validateCalendarValue({ calendar: 'hebrew', year: 5779, monthCode: 'M05L', day: 23 }), {
    profileStatus: 'admitted', authorityAssessment: 'unresolved',
  });
});
