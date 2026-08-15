/* LAPBase Calculator Math v5.60
   Pure calculation layer: no DOM dependencies. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LAPBaseCalculatorMath = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const EPSILON = 1e-7;

  function toNumber(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const normalized = String(value ?? '')
      .trim()
      .replace(/\s+/g, '')
      .replace(',', '.');
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function nonNegative(value, max = Infinity) {
    return Math.min(Math.max(toNumber(value), 0), max);
  }

  function roundRequired(value) {
    const safe = nonNegative(value);
    const rounded = Math.ceil(Number(safe.toFixed(7)) - EPSILON);
    return rounded <= 0 ? 0 : rounded;
  }

  function applyConstructionSpeed(baseSeconds, constructionSpeedBoostPct = 0) {
    const base = nonNegative(baseSeconds);
    const boost = nonNegative(constructionSpeedBoostPct);
    return base / (1 + boost / 100);
  }

  function applyFreeConstruction(adjustedSeconds, freeConstructionSeconds = 0) {
    const adjusted = nonNegative(adjustedSeconds);
    const free = nonNegative(freeConstructionSeconds);
    const freeCoveredSeconds = Math.min(adjusted, free);
    return {
      freeCoveredSeconds,
      speedupRequiredSeconds: Math.max(0, adjusted - freeCoveredSeconds),
    };
  }

  function applyResourceDiscount(baseCost, constructionResourceDiscountPct = 0) {
    const base = nonNegative(baseCost);
    const discount = nonNegative(constructionResourceDiscountPct, 100);
    return base * (1 - discount / 100);
  }

  function allocateExistingResources(required = {}, existing = {}) {
    const keys = new Set([...Object.keys(required || {}), ...Object.keys(existing || {})]);
    const normalizedExisting = {};
    const missing = {};
    const remaining = {};
    for (const key of keys) {
      const req = roundRequired(required?.[key] || 0);
      const have = roundRequired(existing?.[key] || 0);
      normalizedExisting[key] = have;
      missing[key] = Math.max(0, req - have);
      remaining[key] = Math.max(0, have - req);
    }
    return { existing: normalizedExisting, missing, remaining };
  }

  function allocateSpeedups(speedupRequiredSeconds, buildingSpeedupMinutes = 0, generalSpeedupMinutes = 0) {
    let remainingTime = roundRequired(speedupRequiredSeconds);
    const buildingAvailableSeconds = roundRequired(nonNegative(buildingSpeedupMinutes) * 60);
    const generalAvailableSeconds = roundRequired(nonNegative(generalSpeedupMinutes) * 60);

    const buildingUsedSeconds = Math.min(buildingAvailableSeconds, remainingTime);
    remainingTime -= buildingUsedSeconds;

    const generalUsedSeconds = Math.min(generalAvailableSeconds, remainingTime);
    remainingTime -= generalUsedSeconds;

    return {
      buildingAvailableSeconds,
      buildingUsedSeconds,
      buildingRemainingSeconds: buildingAvailableSeconds - buildingUsedSeconds,
      generalAvailableSeconds,
      generalUsedSeconds,
      generalRemainingSeconds: generalAvailableSeconds - generalUsedSeconds,
      missingSeconds: Math.max(0, remainingTime),
    };
  }

  function normalizeBonuses(bonuses = {}) {
    return {
      constructionSpeedBoostPct: nonNegative(bonuses.constructionSpeedBoostPct),
      freeConstructionSeconds: nonNegative(bonuses.freeConstructionSeconds),
      constructionResourceDiscountPct: nonNegative(bonuses.constructionResourceDiscountPct, 100),
    };
  }

  function calculateUpgradeStep(row, bonuses = {}) {
    if (!Array.isArray(row) || row.length < 7) {
      throw new Error('Invalid building upgrade row');
    }

    const normalized = normalizeBonuses(bonuses);
    const baseResources = {
      grain: roundRequired(row[2] || 0),
      wood: roundRequired(row[3] || 0),
      herb: roundRequired(row[4] || 0),
    };
    const discountedResources = {
      grain: roundRequired(applyResourceDiscount(baseResources.grain, normalized.constructionResourceDiscountPct)),
      wood: roundRequired(applyResourceDiscount(baseResources.wood, normalized.constructionResourceDiscountPct)),
      herb: roundRequired(applyResourceDiscount(baseResources.herb, normalized.constructionResourceDiscountPct)),
    };

    const baseSeconds = roundRequired(row[6] || 0);
    const adjustedSeconds = roundRequired(applyConstructionSpeed(baseSeconds, normalized.constructionSpeedBoostPct));
    const freeResult = applyFreeConstruction(adjustedSeconds, normalized.freeConstructionSeconds);
    const freeCoveredSeconds = roundRequired(freeResult.freeCoveredSeconds);
    const speedupRequiredSeconds = roundRequired(freeResult.speedupRequiredSeconds);

    return {
      buildingName: String(row[0] ?? ''),
      targetLevel: Number(row[1]),
      resources: {
        base: baseResources,
        afterDiscount: discountedResources,
      },
      power: roundRequired(row[5] || 0),
      time: {
        baseSeconds,
        adjustedSeconds,
        freeCoveredSeconds,
        speedupRequiredSeconds,
      },
    };
  }

  function emptyRangeResult() {
    return {
      resources: {
        base: { grain: 0, wood: 0, herb: 0 },
        afterDiscount: { grain: 0, wood: 0, herb: 0 },
      },
      power: 0,
      time: {
        baseSeconds: 0,
        adjustedSeconds: 0,
        freeCoveredSeconds: 0,
        speedupRequiredSeconds: 0,
      },
      steps: [],
    };
  }

  function addResourceTotals(target, source) {
    for (const key of ['grain', 'wood', 'herb']) target[key] += roundRequired(source?.[key] || 0);
  }

  function calculateUpgradeRange(rows, bonuses = {}) {
    const result = emptyRangeResult();
    for (const row of rows || []) {
      const step = calculateUpgradeStep(row, bonuses);
      result.steps.push(step);
      addResourceTotals(result.resources.base, step.resources.base);
      addResourceTotals(result.resources.afterDiscount, step.resources.afterDiscount);
      result.power += step.power;
      result.time.baseSeconds += step.time.baseSeconds;
      result.time.adjustedSeconds += step.time.adjustedSeconds;
      result.time.freeCoveredSeconds += step.time.freeCoveredSeconds;
      result.time.speedupRequiredSeconds += step.time.speedupRequiredSeconds;
    }
    return result;
  }

  function combineRangeResults(rangeResults = []) {
    const total = emptyRangeResult();
    total.steps = [];
    for (const range of rangeResults) {
      if (!range) continue;
      addResourceTotals(total.resources.base, range.resources?.base || {});
      addResourceTotals(total.resources.afterDiscount, range.resources?.afterDiscount || {});
      total.power += roundRequired(range.power || 0);
      total.time.baseSeconds += roundRequired(range.time?.baseSeconds || 0);
      total.time.adjustedSeconds += roundRequired(range.time?.adjustedSeconds || 0);
      total.time.freeCoveredSeconds += roundRequired(range.time?.freeCoveredSeconds || 0);
      total.time.speedupRequiredSeconds += roundRequired(range.time?.speedupRequiredSeconds || 0);
      if (Array.isArray(range.steps)) total.steps.push(...range.steps);
    }
    return total;
  }

  function calculateFinalResult(rangeResults = [], existing = {}) {
    const totals = combineRangeResults(rangeResults);
    const resourceAllocation = allocateExistingResources(
      totals.resources.afterDiscount,
      existing.resources || {}
    );
    const speedupAllocation = allocateSpeedups(
      totals.time.speedupRequiredSeconds,
      existing.speedups?.buildingMinutes || 0,
      existing.speedups?.generalMinutes || 0
    );

    return {
      resources: {
        base: { ...totals.resources.base },
        afterDiscount: { ...totals.resources.afterDiscount },
        existing: resourceAllocation.existing,
        missing: resourceAllocation.missing,
        remaining: resourceAllocation.remaining,
      },
      power: totals.power,
      time: {
        baseSeconds: totals.time.baseSeconds,
        adjustedSeconds: totals.time.adjustedSeconds,
        freeCoveredSeconds: totals.time.freeCoveredSeconds,
        speedupRequiredSeconds: totals.time.speedupRequiredSeconds,
        speedups: speedupAllocation,
      },
      steps: totals.steps,
    };
  }

  return Object.freeze({
    toNumber,
    nonNegative,
    roundRequired,
    applyConstructionSpeed,
    applyFreeConstruction,
    applyResourceDiscount,
    allocateExistingResources,
    allocateSpeedups,
    normalizeBonuses,
    calculateUpgradeStep,
    calculateUpgradeRange,
    combineRangeResults,
    calculateFinalResult,
  });
});
