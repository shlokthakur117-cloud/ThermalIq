/**
 * ThermalIQ — Scoring Engine Unit Tests
 * 
 * Comprehensive tests verifying mathematical correctness, input validation,
 * policy weight checks, risk tier classification, and deterministic ranking.
 * All formula tests compare against independent hand-calculated expected values.
 * 
 * Execution:
 * node --test --experimental-strip-types src/lib/scoring.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateHRS,
  calculatePVS,
  calculateEGS,
  calculateCPS,
  determineRiskTier,
  roundToOneDecimal,
  validateNormalizedInput,
  validatePolicyWeights,
  normalizeLST,
  calculateVCIDeficit,
  scoreZone,
  scoreAndRankZones,
  DEFAULT_POLICY_WEIGHTS,
} from './scoring.ts';
import { MOCK_ZONES } from './mock-data.ts';
import type { ZoneRaw, PhysicalHazardInputs, PopulationVulnerabilityInputs, EquityGovernanceInputs } from '../types/zone.ts';

// ----------------------------------------------------------------------------
// 1. Correct HRS Calculation (Independent Hand-Calculated Expected Value)
// ----------------------------------------------------------------------------
test('1. calculateHRS: matches independent hand-calculated expected value', () => {
  // L = 0.80, I = 0.60, V = 0.50, A = 0.70, N = 0.40
  // Formula: 0.35*0.80 + 0.25*0.60 + 0.20*0.50 + 0.10*0.70 + 0.10*0.40
  // Hand calculation:
  // 0.35 * 0.80 = 0.280
  // 0.25 * 0.60 = 0.150
  // 0.20 * 0.50 = 0.100
  // 0.10 * 0.70 = 0.070
  // 0.10 * 0.40 = 0.040
  // Total expected raw = 0.280 + 0.150 + 0.100 + 0.070 + 0.040 = 0.640
  // Expected display (0-100 scale) = 64.0
  const inputs: PhysicalHazardInputs = {
    lst_celsius: 46.0,
    lst_index: 0.80,
    isf: 0.60,
    ndvi: 0.0,
    vci_deficit: 0.50,
    albedo: 0.30,
    albedo_deficit: 0.70,
    ncd: 0.40,
    uhi_delta_celsius: 4.5,
  };

  const result = calculateHRS(inputs);
  assert.ok(Math.abs(result.hrs_raw - 0.640) < 1e-10, `Expected raw 0.640, received ${result.hrs_raw}`);
  assert.equal(result.hrs, 64.0);
});

// ----------------------------------------------------------------------------
// 2. Correct PVS Calculation (Independent Hand-Calculated Expected Value)
// ----------------------------------------------------------------------------
test('2. calculatePVS: matches independent hand-calculated expected value', () => {
  // E = 0.20, O = 0.40, L = 0.30, H = 0.75 (so 1 - H = 0.25), D = 0.50
  // Formula: 0.25*0.20 + 0.25*0.40 + 0.20*0.30 + 0.20*0.25 + 0.10*0.50
  // Hand calculation:
  // 0.25 * 0.20 = 0.050
  // 0.25 * 0.40 = 0.100
  // 0.20 * 0.30 = 0.060
  // 0.20 * 0.25 = 0.050
  // 0.10 * 0.50 = 0.050
  // Total expected raw = 0.050 + 0.100 + 0.060 + 0.050 + 0.050 = 0.310
  // Expected display (0-100 scale) = 31.0
  const inputs: PopulationVulnerabilityInputs = {
    epf: 0.20,
    owf: 0.40,
    lif: 0.30,
    hca: 0.75,
    dcc_normalized: 0.50,
  };

  const result = calculatePVS(inputs);
  assert.ok(Math.abs(result.pvs_raw - 0.310) < 1e-10, `Expected raw 0.310, received ${result.pvs_raw}`);
  assert.equal(result.pvs, 31.0);
});

// ----------------------------------------------------------------------------
// 3. Correct EGS Calculation (Independent Hand-Calculated Expected Value)
// ----------------------------------------------------------------------------
test('3. calculateEGS: matches independent hand-calculated expected value', () => {
  // G = 0.60, C = 0.40, I = 0.80
  // Formula: 0.40*0.60 + 0.35*0.40 + 0.25*0.80
  // Hand calculation:
  // 0.40 * 0.60 = 0.240
  // 0.35 * 0.40 = 0.140
  // 0.25 * 0.80 = 0.200
  // Total expected raw = 0.240 + 0.140 + 0.200 = 0.580
  // Expected display (0-100 scale) = 58.0
  const inputs: EquityGovernanceInputs = {
    gid: 0.60,
    cid_inverted: 0.40,
    hii_inverted: 0.80,
  };

  const result = calculateEGS(inputs);
  assert.ok(Math.abs(result.egs_raw - 0.580) < 1e-10, `Expected raw 0.580, received ${result.egs_raw}`);
  assert.equal(result.egs, 58.0);
});

// ----------------------------------------------------------------------------
// 4. Correct Default CPS Calculation
// ----------------------------------------------------------------------------
test('4. calculateCPS: matches independent hand-calculated value with default weights', () => {
  // HRS = 0.640, PVS = 0.310, EGS = 0.580
  // Default weights: alpha = 0.40, beta = 0.35, gamma = 0.25
  // Formula: 0.40*0.640 + 0.35*0.310 + 0.25*0.580
  // Hand calculation:
  // 0.40 * 0.640 = 0.2560
  // 0.35 * 0.310 = 0.1085
  // 0.25 * 0.580 = 0.1450
  // Total expected raw = 0.2560 + 0.1085 + 0.1450 = 0.5095
  // Expected display (0-100 scale) = round(50.95, 1) = 51.0
  const result = calculateCPS(0.640, 0.310, 0.580, DEFAULT_POLICY_WEIGHTS);
  assert.ok(Math.abs(result.cps_raw - 0.5095) < 1e-10, `Expected raw 0.5095, received ${result.cps_raw}`);
  assert.equal(result.cps, 51.0);
});

// ----------------------------------------------------------------------------
// 5. Custom Valid Weights
// ----------------------------------------------------------------------------
test('5. calculateCPS: supports custom valid policy weights', () => {
  // HRS = 0.640, PVS = 0.310, EGS = 0.580
  // Custom weights: alpha = 0.50, beta = 0.30, gamma = 0.20 (sum = 1.00)
  // Hand calculation:
  // 0.50 * 0.640 = 0.3200
  // 0.30 * 0.310 = 0.0930
  // 0.20 * 0.580 = 0.1160
  // Total expected raw = 0.3200 + 0.0930 + 0.1160 = 0.5290
  // Expected display = 52.9
  const customWeights = { alpha: 0.50, beta: 0.30, gamma: 0.20 };
  const result = calculateCPS(0.640, 0.310, 0.580, customWeights);
  assert.ok(Math.abs(result.cps_raw - 0.5290) < 1e-10, `Expected raw 0.5290, received ${result.cps_raw}`);
  assert.equal(result.cps, 52.9);
});

// ----------------------------------------------------------------------------
// 6. Invalid Negative Weights
// ----------------------------------------------------------------------------
test('6. validatePolicyWeights: rejects negative weights', () => {
  assert.throws(
    () => validatePolicyWeights({ alpha: -0.10, beta: 0.60, gamma: 0.50 }),
    RangeError,
    'Should reject negative alpha'
  );
  assert.throws(
    () => validatePolicyWeights({ alpha: 0.60, beta: -0.20, gamma: 0.60 }),
    RangeError,
    'Should reject negative beta'
  );
  assert.throws(
    () => validatePolicyWeights({ alpha: 0.60, beta: 0.50, gamma: -0.10 }),
    RangeError,
    'Should reject negative gamma'
  );
});

// ----------------------------------------------------------------------------
// 7. Invalid Weight Sums
// ----------------------------------------------------------------------------
test('7. validatePolicyWeights: rejects weights that do not sum to 1.0', () => {
  // Sum = 1.10
  assert.throws(
    () => validatePolicyWeights({ alpha: 0.50, beta: 0.35, gamma: 0.25 }),
    RangeError,
    'Should reject weight sum greater than 1.0'
  );
  // Sum = 0.90
  assert.throws(
    () => validatePolicyWeights({ alpha: 0.30, beta: 0.35, gamma: 0.25 }),
    RangeError,
    'Should reject weight sum less than 1.0'
  );
});

// ----------------------------------------------------------------------------
// 8. Missing and Null Inputs
// ----------------------------------------------------------------------------
test('8. validateNormalizedInput: rejects missing and null inputs', () => {
  assert.throws(() => validateNormalizedInput(null, 'testField'), TypeError);
  assert.throws(() => validateNormalizedInput(undefined, 'testField'), TypeError);
  assert.throws(() => validateNormalizedInput('0.5', 'testField'), TypeError);
  assert.throws(() => validateNormalizedInput({}, 'testField'), TypeError);
});

// ----------------------------------------------------------------------------
// 9. NaN and Infinity
// ----------------------------------------------------------------------------
test('9. validateNormalizedInput: rejects NaN and Infinity', () => {
  assert.throws(() => validateNormalizedInput(Number.NaN, 'testField'), TypeError);
  assert.throws(() => validateNormalizedInput(Infinity, 'testField'), TypeError);
  assert.throws(() => validateNormalizedInput(-Infinity, 'testField'), TypeError);
});

// ----------------------------------------------------------------------------
// 10. Values Below 0 and Above 1
// ----------------------------------------------------------------------------
test('10. validateNormalizedInput: rejects values outside [0, 1]', () => {
  assert.throws(() => validateNormalizedInput(-0.001, 'testField'), RangeError);
  assert.throws(() => validateNormalizedInput(-5.0, 'testField'), RangeError);
  assert.throws(() => validateNormalizedInput(1.001, 'testField'), RangeError);
  assert.throws(() => validateNormalizedInput(2.5, 'testField'), RangeError);
  // Exact boundaries must pass
  assert.equal(validateNormalizedInput(0.0, 'testField'), 0.0);
  assert.equal(validateNormalizedInput(1.0, 'testField'), 1.0);
});

// ----------------------------------------------------------------------------
// 11. Correct Rounding to One Decimal
// ----------------------------------------------------------------------------
test('11. roundToOneDecimal: rounds correctly without floating-point artifacts', () => {
  assert.equal(roundToOneDecimal(50.94), 50.9);
  assert.equal(roundToOneDecimal(50.95), 51.0);
  assert.equal(roundToOneDecimal(50.96), 51.0);
  assert.equal(roundToOneDecimal(0.0), 0.0);
  assert.equal(roundToOneDecimal(100.0), 100.0);
  assert.equal(roundToOneDecimal(83.12), 83.1);
  assert.equal(roundToOneDecimal(94.24), 94.2);
});

// ----------------------------------------------------------------------------
// 12. All Four Risk-Tier Boundaries and Range Validation
// ----------------------------------------------------------------------------
test('12. determineRiskTier: assigns correct tier across boundaries and validates [0, 100] range', () => {
  // CRITICAL: CPS >= 80
  assert.equal(determineRiskTier(100.0), 'CRITICAL');
  assert.equal(determineRiskTier(80.0), 'CRITICAL');

  // HIGH: CPS >= 60 and < 80
  assert.equal(determineRiskTier(79.9), 'HIGH');
  assert.equal(determineRiskTier(60.0), 'HIGH');

  // MODERATE: CPS >= 40 and < 60
  assert.equal(determineRiskTier(59.9), 'MODERATE');
  assert.equal(determineRiskTier(40.0), 'MODERATE');

  // LOW: CPS < 40
  assert.equal(determineRiskTier(39.9), 'LOW');
  assert.equal(determineRiskTier(0.0), 'LOW');

  // Range validation: CPS must reside within [0, 100]
  assert.throws(() => determineRiskTier(-0.1), RangeError);
  assert.throws(() => determineRiskTier(100.1), RangeError);
  assert.throws(() => determineRiskTier(-50.0), RangeError);
  assert.throws(() => determineRiskTier(150.0), RangeError);

  // Type validation: non-numeric, NaN, Infinity
  assert.throws(() => determineRiskTier(Number.NaN), TypeError);
  assert.throws(() => determineRiskTier(Infinity), TypeError);
  assert.throws(() => determineRiskTier(-Infinity), TypeError);
  assert.throws(() => determineRiskTier('80' as unknown as number), TypeError);
});

// ----------------------------------------------------------------------------
// 13. Deterministic Ranking (Descending Raw CPS)
// ----------------------------------------------------------------------------
test('13. scoreAndRankZones: ranks zones strictly by descending raw CPS', () => {
  const dummyZone1: ZoneRaw = {
    ...MOCK_ZONES[0],
    id: 'pmc-z-low',
    code: 'PMC-LOW',
    name: 'Low Risk Zone',
    // Low hazard, low vuln, low equity deficit
    lst_index: 0.20,
    isf: 0.20,
    vci_deficit: 0.20,
    albedo_deficit: 0.20,
    ncd: 0.20,
    epf: 0.10,
    owf: 0.10,
    lif: 0.10,
    hca: 0.90,
    dcc_normalized: 0.10,
    gid: 0.10,
    cid_inverted: 0.10,
    hii_inverted: 0.10,
  };

  const dummyZone2: ZoneRaw = {
    ...MOCK_ZONES[0],
    id: 'pmc-z-high',
    code: 'PMC-HIGH',
    name: 'High Risk Zone',
    // High hazard, high vuln, high equity deficit
    lst_index: 0.90,
    isf: 0.90,
    vci_deficit: 0.90,
    albedo_deficit: 0.90,
    ncd: 0.90,
    epf: 0.50,
    owf: 0.50,
    lif: 0.50,
    hca: 0.10,
    dcc_normalized: 0.90,
    gid: 0.90,
    cid_inverted: 0.90,
    hii_inverted: 0.90,
  };

  const ranked = scoreAndRankZones([dummyZone1, dummyZone2]);
  assert.equal(ranked.length, 2);
  assert.equal(ranked[0].id, 'pmc-z-high');
  assert.equal(ranked[0].rank, 1);
  assert.equal(ranked[1].id, 'pmc-z-low');
  assert.equal(ranked[1].rank, 2);
  assert.ok(ranked[0].cps_raw > ranked[1].cps_raw);
});

// ----------------------------------------------------------------------------
// 14. Equal-Score Tie-Breaking by Ascending Zone ID
// ----------------------------------------------------------------------------
test('14. scoreAndRankZones: breaks ties deterministically by ascending zone ID on exact equality', () => {
  // Two zones with identical inputs and identical raw CPS
  const zoneB: ZoneRaw = {
    ...MOCK_ZONES[0],
    id: 'pmc-z02-tie',
    code: 'PMC-Z02',
    name: 'Zone B',
  };

  const zoneA: ZoneRaw = {
    ...MOCK_ZONES[0],
    id: 'pmc-z01-tie',
    code: 'PMC-Z01',
    name: 'Zone A',
  };

  // Provide in reverse alphabetical order [zoneB, zoneA]
  const ranked1 = scoreAndRankZones([zoneB, zoneA]);
  assert.equal(ranked1.length, 2);
  assert.equal(ranked1[0].cps !== undefined, true);
  // Both have identical cps_raw, so zoneA ('pmc-z01-tie') must be Rank 1
  assert.equal(ranked1[0].id, 'pmc-z01-tie');
  assert.equal(ranked1[0].rank, 1);
  assert.equal(ranked1[1].id, 'pmc-z02-tie');
  assert.equal(ranked1[1].rank, 2);

  // Reversing the input array [zoneA, zoneB] must produce identical ranking
  const ranked2 = scoreAndRankZones([zoneA, zoneB]);
  assert.equal(ranked2[0].id, 'pmc-z01-tie');
  assert.equal(ranked2[0].rank, 1);
  assert.equal(ranked2[1].id, 'pmc-z02-tie');
  assert.equal(ranked2[1].rank, 2);
});

test('scoreAndRankZones: ranks by exact raw CPS difference even when smaller than 1e-12', () => {
  // Zone A with base inputs
  const zoneA: ZoneRaw = {
    ...MOCK_ZONES[0],
    id: 'pmc-z01-sub-epsilon',
    code: 'PMC-Z01',
    name: 'Zone A',
    lst_index: 0.500000000000000,
  };

  // Zone B with lst_index differing by only 1e-13 (which creates a raw CPS difference of 0.40 * 0.35 * 1e-13 = 1.4e-14 < 1e-12)
  const zoneB: ZoneRaw = {
    ...MOCK_ZONES[0],
    id: 'pmc-z02-sub-epsilon',
    code: 'PMC-Z02',
    name: 'Zone B',
    lst_index: 0.500000000000001,
  };

  // Despite zoneB having alphabetically higher ID ('pmc-z02' > 'pmc-z01'),
  // zoneB has strictly higher raw CPS, so it must rank 1
  const rankedForward = scoreAndRankZones([zoneA, zoneB]);
  assert.equal(rankedForward[0].id, 'pmc-z02-sub-epsilon');
  assert.equal(rankedForward[0].rank, 1);
  assert.equal(rankedForward[1].id, 'pmc-z01-sub-epsilon');
  assert.equal(rankedForward[1].rank, 2);

  // Reversing input array must produce identical ranking
  const rankedReverse = scoreAndRankZones([zoneB, zoneA]);
  assert.equal(rankedReverse[0].id, 'pmc-z02-sub-epsilon');
  assert.equal(rankedReverse[0].rank, 1);
  assert.equal(rankedReverse[1].id, 'pmc-z01-sub-epsilon');
  assert.equal(rankedReverse[1].rank, 2);
});

test('scoreZone: evaluates all sub-scores and risk tier for a single zone without ranking', () => {
  const result = scoreZone(MOCK_ZONES[0]);
  assert.ok(result.hrs_raw >= 0 && result.hrs_raw <= 1);
  assert.ok(result.hrs >= 0 && result.hrs <= 100);
  assert.ok(result.pvs_raw >= 0 && result.pvs_raw <= 1);
  assert.ok(result.egs_raw >= 0 && result.egs_raw <= 1);
  assert.ok(result.cps_raw >= 0 && result.cps_raw <= 1);
  assert.ok(result.cps >= 0 && result.cps <= 100);
  assert.ok(['CRITICAL', 'HIGH', 'MODERATE', 'LOW'].includes(result.riskTier));
});

// ----------------------------------------------------------------------------
// 15. All 15 Synthetic Demonstration Zones Score Successfully
// ----------------------------------------------------------------------------
test('15. scoreAndRankZones: all 15 synthetic zones score and rank successfully', () => {
  assert.equal(MOCK_ZONES.length, 15);
  const scored = scoreAndRankZones(MOCK_ZONES);

  assert.equal(scored.length, 15);

  // Verify rank progression 1..15
  for (let i = 0; i < scored.length; i++) {
    assert.equal(scored[i].rank, i + 1);
    assert.ok(scored[i].cps_raw >= 0 && scored[i].cps_raw <= 1);
    assert.ok(scored[i].cps >= 0 && scored[i].cps <= 100);
    assert.ok(scored[i].hrs >= 0 && scored[i].hrs <= 100);
    assert.ok(scored[i].pvs >= 0 && scored[i].pvs <= 100);
    assert.ok(scored[i].egs >= 0 && scored[i].egs <= 100);
    assert.ok(['CRITICAL', 'HIGH', 'MODERATE', 'LOW'].includes(scored[i].riskTier));
  }

  // Verify valid top zone properties without hardcoding preferred rankings
  const topZone = scored[0];
  assert.ok(topZone.id.startsWith('pmc-z'));
  assert.ok(['CRITICAL', 'HIGH', 'MODERATE', 'LOW'].includes(topZone.riskTier));
  assert.equal(topZone.rank, 1);

  // Verify descending score invariant
  for (let i = 0; i < scored.length - 1; i++) {
    assert.ok(
      scored[i].cps_raw >= scored[i + 1].cps_raw,
      `Zone ${scored[i].name} (${scored[i].cps_raw}) should have >= score than ${scored[i + 1].name} (${scored[i + 1].cps_raw})`
    );
  }
});

// ----------------------------------------------------------------------------
// Additional Helper Function Tests: normalizeLST & calculateVCIDeficit
// ----------------------------------------------------------------------------
test('normalizeLST: converts temperature to [0, 1] index with 30°C–50°C bounds', () => {
  assert.equal(normalizeLST(30.0), 0.0);
  assert.equal(normalizeLST(50.0), 1.0);
  assert.equal(normalizeLST(40.0), 0.5);
  assert.ok(Math.abs(normalizeLST(44.2) - 0.71) < 1e-10); // Shivajinagar mock value
  // Clamping outside bounds
  assert.equal(normalizeLST(25.0), 0.0);
  assert.equal(normalizeLST(55.0), 1.0);
  assert.throws(() => normalizeLST(Number.NaN), TypeError);
});

test('calculateVCIDeficit: converts NDVI to vegetation deficit [0, 1]', () => {
  // NDVI = 1.0 (maximum lush green) -> NDVI_norm = 1.0 -> deficit = 0.0
  assert.equal(calculateVCIDeficit(1.0), 0.0);
  // NDVI = -1.0 (barren / water) -> NDVI_norm = 0.0 -> deficit = 1.0
  assert.equal(calculateVCIDeficit(-1.0), 1.0);
  // NDVI = 0.0 -> NDVI_norm = 0.5 -> deficit = 0.5
  assert.equal(calculateVCIDeficit(0.0), 0.5);
  assert.throws(() => calculateVCIDeficit(1.5), RangeError);
});
