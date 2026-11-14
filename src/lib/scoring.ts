/**
 * ThermalIQ — Deterministic Urban Heat Risk Scoring Engine
 * 
 * ============================================================================
 * MATHEMATICAL SPECIFICATION & HEURISTIC DEMONSTRATION NOTICE:
 * ----------------------------------------------------------------------------
 * This module implements pure, deterministic scoring functions for the
 * ThermalIQ municipal decision-support platform (Pune Municipal Corporation).
 * 
 * Formulas:
 * 1. Heat Risk Score (HRS):
 *    HRS_raw = 0.35 * lst_index + 0.25 * isf + 0.20 * vci_deficit +
 *              0.10 * albedo_deficit + 0.10 * ncd
 * 
 * 2. Population Vulnerability Score (PVS):
 *    PVS_raw = 0.25 * epf + 0.25 * owf + 0.20 * lif +
 *              0.20 * (1 - hca) + 0.10 * dcc_normalized
 * 
 * 3. Equity & Governance Score (EGS):
 *    EGS_raw = 0.40 * gid + 0.35 * cid_inverted + 0.25 * hii_inverted
 *    *NOTE: Higher EGS indicates GREATER infrastructural deficit and historical
 *     underinvestment, prioritizing these zones for intervention.
 * 
 * 4. Composite Priority Score (CPS):
 *    CPS_raw = alpha * HRS_raw + beta * PVS_raw + gamma * EGS_raw
 *    Default weights: alpha = 0.40, beta = 0.35, gamma = 0.25 (alpha + beta + gamma = 1.0)
 * 
 * Presentation Scale:
 *    Display scores are rounded to 1 decimal place on a 0–100 scale:
 *    Score_display = round(Score_raw * 100, 1)
 * ============================================================================
 * 
 * @module lib/scoring
 */

import type {
  ZoneRaw,
  ZoneScores,
  ZoneScored,
  RiskTier,
  PolicyWeights,
  PhysicalHazardInputs,
  PopulationVulnerabilityInputs,
  EquityGovernanceInputs,
} from '@/types/zone';

/**
 * Floating-point tolerance for policy weights summation (alpha + beta + gamma = 1.0).
 */
export const WEIGHT_SUM_TOLERANCE = 1e-6;

/**
 * Default municipal policy weights vector from approved architecture.
 */
export const DEFAULT_POLICY_WEIGHTS: PolicyWeights = Object.freeze({
  alpha: 0.40,
  beta: 0.35,
  gamma: 0.25,
});

/**
 * Validates that an input attribute is a finite, normalized number in [0.0, 1.0].
 * Rejects missing fields, null, undefined, NaN, +/-Infinity, non-numbers, and out-of-range values.
 * 
 * @param value - Value to validate
 * @param fieldName - Field name for descriptive error reporting
 * @returns The validated number
 * @throws {TypeError} If value is missing, non-numeric, NaN, or non-finite
 * @throws {RangeError} If value is outside [0.0, 1.0]
 */
export function validateNormalizedInput(value: unknown, fieldName: string): number {
  if (value === null || value === undefined) {
    throw new TypeError(`Validation error: '${fieldName}' is required and cannot be null or undefined.`);
  }
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
    throw new TypeError(
      `Validation error: '${fieldName}' must be a finite number. Received: ${String(value)} (${typeof value}).`
    );
  }
  if (value < 0 || value > 1) {
    throw new RangeError(
      `Validation error: '${fieldName}' must reside within bounded interval [0, 1]. Received: ${value}.`
    );
  }
  return value;
}

/**
 * Validates a policy weights vector.
 * Rejects non-finite numbers, negative weights, and weights that do not sum to 1.0 within tolerance.
 * 
 * @param weights - PolicyWeights vector to validate
 * @throws {TypeError} If any weight is missing or not a finite number
 * @throws {RangeError} If any weight is negative or weights do not sum to 1.0 within tolerance
 */
export function validatePolicyWeights(weights: PolicyWeights): void {
  if (!weights || typeof weights !== 'object') {
    throw new TypeError('Validation error: policy weights must be a defined object.');
  }

  const { alpha, beta, gamma } = weights;

  if (typeof alpha !== 'number' || Number.isNaN(alpha) || !Number.isFinite(alpha)) {
    throw new TypeError(`Validation error: 'alpha' must be a finite number. Received: ${String(alpha)}.`);
  }
  if (typeof beta !== 'number' || Number.isNaN(beta) || !Number.isFinite(beta)) {
    throw new TypeError(`Validation error: 'beta' must be a finite number. Received: ${String(beta)}.`);
  }
  if (typeof gamma !== 'number' || Number.isNaN(gamma) || !Number.isFinite(gamma)) {
    throw new TypeError(`Validation error: 'gamma' must be a finite number. Received: ${String(gamma)}.`);
  }

  if (alpha < 0 || beta < 0 || gamma < 0) {
    throw new RangeError(
      `Validation error: policy weights cannot be negative. Received alpha=${alpha}, beta=${beta}, gamma=${gamma}.`
    );
  }

  const sum = alpha + beta + gamma;
  if (Math.abs(sum - 1.0) > WEIGHT_SUM_TOLERANCE) {
    throw new RangeError(
      `Validation error: policy weights must sum to 1.0 within tolerance ${WEIGHT_SUM_TOLERANCE}. Current sum: ${sum} (alpha=${alpha}, beta=${beta}, gamma=${gamma}).`
    );
  }
}

/**
 * Rounds a number to exactly one decimal place using mathematically robust epsilon offset.
 * 
 * @param value - Number to round
 * @returns Number rounded to 1 decimal place
 */
export function roundToOneDecimal(value: number): number {
  if (!Number.isFinite(value)) {
    throw new TypeError(`Cannot round non-finite value: ${value}`);
  }
  // Offset by small epsilon to prevent IEEE 754 sub-representation boundary truncations
  // e.g. 0.5095 * 100 which evaluates to 50.949999999999996 in IEEE 754
  const factor = 10;
  return Math.round((value + 1e-12) * factor) / factor;
}

/**
 * Normalizes a raw Land Surface Temperature (°C) to bounded [0, 1] index
 * using the approved municipal demonstration bounds: 30°C to 50°C.
 * 
 * @param lstCelsius - Observed or simulated surface temperature in °C
 * @returns Normalized index clamped to [0.0, 1.0]
 */
export function normalizeLST(lstCelsius: number): number {
  if (typeof lstCelsius !== 'number' || Number.isNaN(lstCelsius) || !Number.isFinite(lstCelsius)) {
    throw new TypeError(`LST normalization requires a finite number. Received: ${lstCelsius}`);
  }
  const minLST = 30.0;
  const maxLST = 50.0;
  const rawIndex = (lstCelsius - minLST) / (maxLST - minLST);
  return Math.min(Math.max(rawIndex, 0.0), 1.0);
}

/**
 * Calculates Vegetation Condition Deficit (VCI deficit) from raw NDVI [-1.0, 1.0]
 * using the approved simplified demonstration normalization.
 * 
 * @param ndvi - Normalized Difference Vegetation Index in [-1.0, 1.0]
 * @returns Vegetation deficit index in [0.0, 1.0]
 */
export function calculateVCIDeficit(ndvi: number): number {
  if (typeof ndvi !== 'number' || Number.isNaN(ndvi) || !Number.isFinite(ndvi)) {
    throw new TypeError(`NDVI must be a finite number. Received: ${ndvi}`);
  }
  if (ndvi < -1.0 || ndvi > 1.0) {
    throw new RangeError(`NDVI must reside within [-1.0, 1.0]. Received: ${ndvi}`);
  }
  const ndviNorm = Math.min(Math.max((ndvi + 1.0) / 2.0, 0.0), 1.0);
  return 1.0 - ndviNorm;
}

/**
 * Calculates Heat Risk Score (HRS) from physical hazard inputs.
 * HRS captures physical thermal intensity and built-environment heat retention.
 * 
 * Formula:
 * HRS_raw = 0.35 * lst_index + 0.25 * isf + 0.20 * vci_deficit +
 *           0.10 * albedo_deficit + 0.10 * ncd
 * 
 * @param inputs - Physical hazard inputs
 * @returns Object containing raw [0, 1] score and rounded [0, 100] display score
 */
export function calculateHRS(inputs: PhysicalHazardInputs): { hrs_raw: number; hrs: number } {
  const lstIndex = validateNormalizedInput(inputs.lst_index, 'lst_index');
  const isf = validateNormalizedInput(inputs.isf, 'isf');
  const vciDeficit = validateNormalizedInput(inputs.vci_deficit, 'vci_deficit');
  const albedoDeficit = validateNormalizedInput(inputs.albedo_deficit, 'albedo_deficit');
  const ncd = validateNormalizedInput(inputs.ncd, 'ncd');

  const hrs_raw = 0.35 * lstIndex + 0.25 * isf + 0.20 * vciDeficit + 0.10 * albedoDeficit + 0.10 * ncd;
  const hrs = roundToOneDecimal(hrs_raw * 100);

  return { hrs_raw, hrs };
}

/**
 * Calculates Population Vulnerability Score (PVS) from socio-demographic indicators.
 * PVS captures human sensitivity, occupational exposure, and healthcare deficits.
 * 
 * Formula:
 * PVS_raw = 0.25 * epf + 0.25 * owf + 0.20 * lif +
 *           0.20 * (1 - hca) + 0.10 * dcc_normalized
 * 
 * @param inputs - Socio-demographic vulnerability inputs
 * @returns Object containing raw [0, 1] score and rounded [0, 100] display score
 */
export function calculatePVS(inputs: PopulationVulnerabilityInputs): { pvs_raw: number; pvs: number } {
  const epf = validateNormalizedInput(inputs.epf, 'epf');
  const owf = validateNormalizedInput(inputs.owf, 'owf');
  const lif = validateNormalizedInput(inputs.lif, 'lif');
  const hca = validateNormalizedInput(inputs.hca, 'hca');
  const dccNormalized = validateNormalizedInput(inputs.dcc_normalized, 'dcc_normalized');

  const pvs_raw = 0.25 * epf + 0.25 * owf + 0.20 * lif + 0.20 * (1.0 - hca) + 0.10 * dccNormalized;
  const pvs = roundToOneDecimal(pvs_raw * 100);

  return { pvs_raw, pvs };
}

/**
 * Calculates Equity & Governance Score (EGS) from historical infrastructure deficit metrics.
 * Higher EGS reflects greater historical underinvestment, shade deficits, and civic neglect.
 * 
 * Formula:
 * EGS_raw = 0.40 * gid + 0.35 * cid_inverted + 0.25 * hii_inverted
 * 
 * @param inputs - Equity and governance deficit inputs
 * @returns Object containing raw [0, 1] score and rounded [0, 100] display score
 */
export function calculateEGS(inputs: EquityGovernanceInputs): { egs_raw: number; egs: number } {
  const gid = validateNormalizedInput(inputs.gid, 'gid');
  const cidInverted = validateNormalizedInput(inputs.cid_inverted, 'cid_inverted');
  const hiiInverted = validateNormalizedInput(inputs.hii_inverted, 'hii_inverted');

  const egs_raw = 0.40 * gid + 0.35 * cidInverted + 0.25 * hiiInverted;
  const egs = roundToOneDecimal(egs_raw * 100);

  return { egs_raw, egs };
}

/**
 * Calculates Composite Priority Score (CPS) combining hazard, vulnerability, and equity.
 * 
 * Formula:
 * CPS_raw = alpha * HRS_raw + beta * PVS_raw + gamma * EGS_raw
 * 
 * @param hrs_raw - Raw Heat Risk Score in [0, 1]
 * @param pvs_raw - Raw Population Vulnerability Score in [0, 1]
 * @param egs_raw - Raw Equity & Governance Score in [0, 1]
 * @param weights - Optional policy weighting vector (defaults to 0.40, 0.35, 0.25)
 * @returns Object containing raw [0, 1] score and rounded [0, 100] display score
 */
export function calculateCPS(
  hrs_raw: number,
  pvs_raw: number,
  egs_raw: number,
  weights: PolicyWeights = DEFAULT_POLICY_WEIGHTS
): { cps_raw: number; cps: number } {
  const validHrs = validateNormalizedInput(hrs_raw, 'hrs_raw');
  const validPvs = validateNormalizedInput(pvs_raw, 'pvs_raw');
  const validEgs = validateNormalizedInput(egs_raw, 'egs_raw');
  validatePolicyWeights(weights);

  const cps_raw = weights.alpha * validHrs + weights.beta * validPvs + weights.gamma * validEgs;
  const cps = roundToOneDecimal(cps_raw * 100);

  return { cps_raw, cps };
}

/**
 * Determines municipal heat risk tier based on Composite Priority Score (0–100 display scale).
 * 
 * Thresholds:
 * - CRITICAL: CPS >= 80
 * - HIGH:     CPS >= 60 and < 80
 * - MODERATE: CPS >= 40 and < 60
 * - LOW:      CPS < 40
 * 
 * @param cps - Composite Priority Score (0–100 scale)
 * @returns The assigned RiskTier
 */
export function determineRiskTier(cps: number): RiskTier {
  if (typeof cps !== 'number' || Number.isNaN(cps) || !Number.isFinite(cps)) {
    throw new TypeError(`Cannot determine risk tier for non-numeric CPS: ${cps}`);
  }
  if (cps < 0 || cps > 100) {
    throw new RangeError(
      `Cannot determine risk tier: CPS must reside within [0, 100]. Received: ${cps}`
    );
  }
  if (cps >= 80) return 'CRITICAL';
  if (cps >= 60) return 'HIGH';
  if (cps >= 40) return 'MODERATE';
  return 'LOW';
}

/**
 * Evaluates all risk scores (HRS, PVS, EGS, CPS) and assigns risk tier for a single zone.
 * 
 * @param zone - Raw zone inputs and metadata
 * @param weights - Optional policy weighting vector
 * @returns Calculated score properties without priority rank
 */
export function scoreZone(
  zone: ZoneRaw,
  weights: PolicyWeights = DEFAULT_POLICY_WEIGHTS
): Omit<ZoneScores, 'rank'> {
  if (!zone || typeof zone !== 'object') {
    throw new TypeError('Zone record is required and must be an object.');
  }

  const { hrs_raw, hrs } = calculateHRS(zone);
  const { pvs_raw, pvs } = calculatePVS(zone);
  const { egs_raw, egs } = calculateEGS(zone);
  const { cps_raw, cps } = calculateCPS(hrs_raw, pvs_raw, egs_raw, weights);
  const riskTier = determineRiskTier(cps);

  return {
    hrs_raw,
    hrs,
    pvs_raw,
    pvs,
    egs_raw,
    egs,
    cps_raw,
    cps,
    riskTier,
  };
}

/**
 * Scores and deterministically ranks a collection of zones.
 * 
 * Ranking Rules:
 * - Ranked primarily by descending raw Composite Priority Score (`cps_raw`).
 * - Ties are broken deterministically by ascending zone ID (`id`).
 * - Assigned rank is 1-based (1 = highest urgency).
 * 
 * @param zones - Array of raw zone records
 * @param weights - Optional policy weighting vector
 * @returns Array of fully evaluated ZoneScored objects sorted by assigned rank
 */
export function scoreAndRankZones(
  zones: readonly ZoneRaw[],
  weights: PolicyWeights = DEFAULT_POLICY_WEIGHTS
): ZoneScored[] {
  if (!Array.isArray(zones)) {
    throw new TypeError('Expected an array of ZoneRaw records.');
  }

  validatePolicyWeights(weights);

  // 1. Calculate unranked scores for every zone
  const scoredWithoutRank = zones.map((zone) => ({
    zone,
    scores: scoreZone(zone, weights),
  }));

  // 2. Sort deterministically: strictly descending cps_raw, tie-break by ascending zone ID on exact equality
  scoredWithoutRank.sort((a, b) => {
    if (b.scores.cps_raw !== a.scores.cps_raw) {
      return b.scores.cps_raw - a.scores.cps_raw;
    }
    return a.zone.id.localeCompare(b.zone.id);
  });

  // 3. Assign 1-based ranks and construct complete ZoneScored objects
  return scoredWithoutRank.map(({ zone, scores }, index) => {
    const rank = index + 1;
    return {
      ...zone,
      ...scores,
      rank,
    };
  });
}
