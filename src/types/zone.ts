/**
 * ThermalIQ — Core Domain Type Definitions
 * 
 * Strict TypeScript interfaces for Pune Municipal Corporation (PMC)
 * synthetic demonstration heat-risk analysis zones, scoring inputs,
 * policy weights, and intervention models.
 * 
 * @module types/zone
 */

/**
 * Categorical heat risk tiers for municipal prioritization.
 */
export type RiskTier = 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW';

/**
 * Categories of urban cooling interventions.
 */
export type InterventionCategory = 'SURFACE' | 'NATURE_BASED' | 'SHADING' | 'PAVEMENT';

/**
 * Geographic centroid coordinates [longitude, latitude] in WGS84 (EPSG:4326).
 */
export type CoordinatePair = [number, number];

/**
 * Core metadata for an urban heat analysis zone.
 */
export interface ZoneMeta {
  /** Unique system identifier (e.g., 'pmc-z01') */
  readonly id: string;
  /** Municipal zone code (e.g., 'PMC-Z01') */
  readonly code: string;
  /** Display name of the zone/ward */
  readonly name: string;
  /** Administrative prabhag identifier */
  readonly prabhag: string;
  /** Urban characterization and functional description */
  readonly description: string;
  /**
   * Demonstration spatial reference / proxy administrative ward in GeoJSON.
   * NOTE: This is a visualization reference and is NOT a certified geographic
   * or legal 1:1 equivalence to official PMC administrative boundaries.
   */
  readonly adminWardName: string;
  /** Geographic centroid [longitude, latitude] */
  readonly centroid: CoordinatePair;
  /** Estimated resident population within the zone */
  readonly population: number;
  /** Mandatory indicator that data is synthetic demonstration */
  readonly isSynthetic: true;
  /** Mandatory provenance notice */
  readonly syntheticNotice: string;
}

/**
 * Raw physical hazard and thermal environment metrics.
 * All normalized indices must reside strictly within [0.0, 1.0].
 */
export interface PhysicalHazardInputs {
  /** Land Surface Temperature in degrees Celsius (°C) */
  readonly lst_celsius: number;
  /** Normalized LST index bounded to [0, 1] */
  readonly lst_index: number;
  /** Impervious Surface Fraction (paved/built area proportion, 0-1) */
  readonly isf: number;
  /** Normalized Difference Vegetation Index (-1.0 to +1.0) */
  readonly ndvi: number;
  /** Normalized Vegetation Condition Deficit (1 - NDVI_norm, 0-1) */
  readonly vci_deficit: number;
  /** Solar surface reflectance (albedo, 0-1) */
  readonly albedo: number;
  /** Surface absorption deficit factor (1 - albedo, 0-1) */
  readonly albedo_deficit: number;
  /** Night Cooling Deficit index measuring nocturnal heat retention (0-1) */
  readonly ncd: number;
  /** Urban Heat Island delta compared to peri-urban base (°C) */
  readonly uhi_delta_celsius: number;
}

/**
 * Socio-demographic vulnerability indicators.
 * All indicators represent normalized fractions or deficits within [0.0, 1.0].
 */
export interface PopulationVulnerabilityInputs {
  /** Elderly Population Fraction (age >= 65 years, 0-1) */
  readonly epf: number;
  /** Outdoor Worker Fraction (high occupational exposure, 0-1) */
  readonly owf: number;
  /** Low Income Fraction (socio-economic vulnerability, 0-1) */
  readonly lif: number;
  /** Healthcare and cooling shelter accessibility metric (0-1) */
  readonly hca: number;
  /** District Cooling Capacity deficit (unserved refuge space, 0-1) */
  readonly dcc_normalized: number;
}

/**
 * Equity and historical governance deficit metrics.
 * All indicators represent normalized deficits within [0.0, 1.0].
 */
export interface EquityGovernanceInputs {
  /** Green Investment Deficit (historical tree canopy/park deficit, 0-1) */
  readonly gid: number;
  /** Inverted Community Infrastructure Deficit (lack of water points/shades, 0-1) */
  readonly cid_inverted: number;
  /** Inverted Prior Heat Intervention Index (lack of prior cooling subsidies, 0-1) */
  readonly hii_inverted: number;
}

/**
 * Combined raw input attributes required for deterministic scoring.
 */
export interface ZoneRawInputs
  extends PhysicalHazardInputs,
    PopulationVulnerabilityInputs,
    EquityGovernanceInputs {}

/**
 * Complete raw zone record pairing metadata with input parameters.
 */
export interface ZoneRaw extends ZoneMeta, ZoneRawInputs {}

/**
 * Calculated scores and risk classification for an analysis zone.
 */
export interface ZoneScores {
  /** Heat Risk Score on raw bounded scale [0.0, 1.0] */
  readonly hrs_raw: number;
  /** Heat Risk Score converted to 0–100 reporting scale */
  readonly hrs: number;

  /** Population Vulnerability Score on raw bounded scale [0.0, 1.0] */
  readonly pvs_raw: number;
  /** Population Vulnerability Score converted to 0–100 reporting scale */
  readonly pvs: number;

  /** Equity & Governance Score on raw bounded scale [0.0, 1.0] */
  readonly egs_raw: number;
  /** Equity & Governance Score converted to 0–100 reporting scale */
  readonly egs: number;

  /** Composite Priority Score on raw bounded scale [0.0, 1.0] */
  readonly cps_raw: number;
  /** Composite Priority Score converted to 0–100 reporting scale */
  readonly cps: number;

  /** Prioritized risk tier based on CPS threshold */
  readonly riskTier: RiskTier;
  /** Numerical priority ranking (1 = highest urgency) */
  readonly rank: number;
}

/**
 * Fully evaluated zone record combining raw data and calculated scores.
 */
export interface ZoneScored extends ZoneRaw, ZoneScores {}

/**
 * Configurable policy weighting vector for Composite Priority Score.
 * Must strictly satisfy alpha + beta + gamma = 1.0.
 */
export interface PolicyWeights {
  /** Weight assigned to Heat Risk Score (default: 0.40) */
  readonly alpha: number;
  /** Weight assigned to Population Vulnerability Score (default: 0.35) */
  readonly beta: number;
  /** Weight assigned to Equity & Governance Score (default: 0.25) */
  readonly gamma: number;
}

/**
 * Definition of a municipal cooling intervention type.
 */
export interface InterventionType {
  readonly id: string;
  readonly name: string;
  readonly category: InterventionCategory;
  /** Estimated deployment cost in Crores INR (₹ Cr) */
  readonly unitCostCr: number;
  /** Expected localized ambient cooling relief in degrees Celsius (negative value, e.g. -2.1°C) */
  readonly coolingDeltaT: number;
  readonly description: string;
  /** Target candidate wards for this intervention */
  readonly targetWards: readonly string[];
}

/**
 * Allocated cooling intervention for a target zone.
 */
export interface AllocationItem {
  readonly zoneId: string;
  readonly zoneCode: string;
  readonly zoneName: string;
  readonly interventionId: string;
  readonly interventionName: string;
  readonly category: InterventionCategory;
  readonly costCr: number;
  readonly coolingDeltaT: number;
  readonly rationale: string;
}

/**
 * Complete municipal scenario allocation plan.
 */
export interface ScenarioPlan {
  readonly totalBudgetCr: number;
  readonly allocatedBudgetCr: number;
  readonly remainingBudgetCr: number;
  readonly equityWeightPercent: number;
  readonly policyWeights: PolicyWeights;
  readonly allocations: readonly AllocationItem[];
  readonly totalProjectedCoolingDeltaT: number;
  readonly affectedPopulation: number;
  readonly generatedAt: string;
  readonly isSynthetic: true;
}
