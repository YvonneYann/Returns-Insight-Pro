
import { AppData, RawOrderRow } from '../types';

export interface LagBucket {
  days: number;
  count: number;
  cumulativePct: number;
}

export interface DateRange {
    start: string;
    end: string;
    daysSpan: number;
}

export interface MaturityMetrics {
  volume: number;
  returns: number;
  rate: number;
  range: DateRange; // Added date range info
}

export interface ProjectionBucket {
    id: string;
    label: string;
    ageRange: string; // e.g. "0-3 days"
    volume: number;
    realizedReturns: number;
    forecastedReturns: number;
    totalExpectedReturns: number;
    contributionRate: number; // How much this bucket adds to the total rate
}

export interface DailyProjectionRow {
  date: string;          // YYYY-MM-DD
  age: number;           // Days since S (Latest Date)
  phase: 'rampup' | 'mature' | 'finalized'; // Modified phases
  sales: number;
  realized: number;
  currentRate: number;
  lagPct: number;        // Cumulative % from distribution
  algorithm: 'linear-blend' | 'gross-up' | 'none'; // Modified algorithms
  weight: number;        // Weight for Gross-Up component in blend (0 to 1)
  forecastAdd: number;
  projectedTotal: number;
  projectedRate: number;
}

export interface ProjectionData {
    projectedRate: number | null; // Changed to allow null for insufficient data
    forecastedVolume: number; // Total forecasted additional returns
    buckets: ProjectionBucket[];
    baselineRate: number;
}

export interface DailyTrend {
    date: string;
    volume: number;     // Units Sold
    returns: number;    // Units Returned (Realized)
    rate: number;
    isPost: boolean;    // True if date >= T0
}

export interface MaturityAnalysisResult {
  fasin: string;
  t0: string; // User input Change Date
  s: string;  // Latest data date found in file
  d_value: number; // Calculated P50 Lag Days
  p20_value: number; // Calculated P20 Lag Days
  p90_value: number; // Calculated P90 Lag Days
  
  // New Maturity Metrics: Simplified to 2 states
  maturityStatus: 'insufficient' | 'projecting';
  confidenceScore: number; // 0 to 1
  isEvaluable: boolean; // Computed from confidence >= 0.5 (Used for "Target" reached)
  
  earliestEvalDate: string; // Dynamic: Date when 50% volume passes P50
  p90Date: string; // Dynamic: Date when 100% volume passes P90
  daysToWait: number; // Based on 50% confidence target
  
  baselineRange: DateRange; 
  distribution: LagBucket[]; 
  
  metrics: {
    pre: MaturityMetrics; 
    reference: MaturityMetrics; 
    postMature: MaturityMetrics; 
    postNominal: MaturityMetrics; 
  };
  
  projection: ProjectionData; 
  dailyProjections: DailyProjectionRow[]; 
  trend: DailyTrend[]; 
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

// Helper to safely get return count for a row
const getReturnCount = (o: RawOrderRow): number => {
    if (o.units_returned && o.units_returned > 0) {
        return o.units_returned;
    }
    if (o.return_date) {
        return o.units_sold;
    }
    return 0;
};

export const analyzeMaturity = (data: AppData): MaturityAnalysisResult | null => {
  if (!data.return_order || !data.t0Date || data.return_order.length === 0) return null;

  const t0Str = data.t0Date;
  const t0Time = new Date(t0Str).getTime();
  const comparisonSpanDays = data.comparisonSpan || 30; // Default to 30 if undefined
  
  // 0. Extract Identity
  const firstOrder = data.return_order[0];
  const fasin = firstOrder.fasin || firstOrder.asin || "Unknown ASIN";

  // 1. Determine S (Latest Purchase Date in dataset)
  let maxTime = 0;
  data.return_order.forEach(o => {
    const t = new Date(o.purchase_date).getTime();
    if (t > maxTime) maxTime = t;
  });
  const sDate = new Date(maxTime);
  const sStr = sDate.toISOString().split('T')[0];
  const sTime = sDate.getTime();

  // Helper to get Range Info
  const getRangeInfo = (subset: RawOrderRow[]): DateRange => {
      if (subset.length === 0) return { start: '-', end: '-', daysSpan: 0 };
      let min = Infinity;
      let max = -Infinity;
      subset.forEach(o => {
          const t = new Date(o.purchase_date).getTime();
          if (t < min) min = t;
          if (t > max) max = t;
      });
      return {
          start: new Date(min).toISOString().split('T')[0],
          end: new Date(max).toISOString().split('T')[0],
          daysSpan: Math.floor((max - min) / MS_PER_DAY) + 1
      };
  };

  // 2. Define Baseline Window (T0 - 60 days) for Lag Distribution
  const preWindowStart = t0Time - (60 * MS_PER_DAY);
  const preSubset = data.return_order.filter(o => {
      const t = new Date(o.purchase_date).getTime();
      return t >= preWindowStart && t < t0Time;
  });

  const baselineRange = getRangeInfo(preSubset);

  // 3. Calculate Lag Distribution using ONLY Baseline (T0-60) data
  const lags: number[] = [];
  preSubset.forEach(o => {
    const rCount = getReturnCount(o);
    if (rCount > 0 && o.return_date) {
      const p = new Date(o.purchase_date).getTime();
      const r = new Date(o.return_date).getTime();
      const diffDays = Math.floor((r - p) / MS_PER_DAY);
      if (diffDays >= 0) {
          for(let k=0; k < rCount; k++) {
              lags.push(diffDays);
          }
      }
    }
  });

  lags.sort((a, b) => a - b);
  
  // 4. Find Markers: P50 (D), P20, and P90
  let d_value = 14; 
  let p20_value = 4; 
  let p90_value = 30; 
  
  if (lags.length > 0) {
    const p50Index = Math.floor(lags.length * 0.50);
    d_value = lags[p50Index];

    const p20Index = Math.floor(lags.length * 0.20);
    p20_value = Math.max(1, lags[p20Index]); 

    const p90Index = Math.floor(lags.length * 0.90);
    p90_value = Math.max(d_value + 5, lags[p90Index]); 
  }
  
  d_value = Math.max(5, Math.min(d_value, 60));
  p20_value = Math.min(p20_value, d_value - 1);
  if (p20_value < 1) p20_value = 1;
  p90_value = Math.max(d_value + 1, Math.min(p90_value, 90));

  // 5. Build Histogram Data for Chart
  const distribution: LagBucket[] = [];
  if (lags.length > 0) {
      const bucketSize = 2; 
      const totalReturns = lags.length;
      let cumulative = 0;
      
      const p95Index = Math.floor(lags.length * 0.95);
      const limitVal = Math.max(lags[p95Index] || 0, p90_value + 14);
      const finalLimit = Math.min(limitVal, 120); 

      for (let i = 0; i <= finalLimit; i += bucketSize) {
          const count = lags.filter(l => l >= i && l < i + bucketSize).length;
          cumulative += count;
          distribution.push({
              days: i,
              count: count,
              cumulativePct: cumulative / totalReturns
          });
      }
  }

  // 6. Define Subsets and Calculate Metrics
  const refStart = t0Time - (comparisonSpanDays * MS_PER_DAY);
  const refSubset = data.return_order.filter(o => {
    const t = new Date(o.purchase_date).getTime();
    return t >= refStart && t < t0Time;
  });

  const postEnd = t0Time + (comparisonSpanDays * MS_PER_DAY);
  
  // Projection Subset: The fixed denominator cohort [T0, T0 + Span)
  const projectionSubset = data.return_order.filter(o => {
      const t = new Date(o.purchase_date).getTime();
      return t >= t0Time && t < postEnd; 
  });
  
  const postNominalSubset = projectionSubset; // Same scope for metrics

  const calcStats = (subset: RawOrderRow[]): MaturityMetrics => {
      const vol = subset.reduce((acc, cur) => acc + cur.units_sold, 0);
      const ret = subset.reduce((acc, cur) => acc + getReturnCount(cur), 0);
      const range = getRangeInfo(subset);
      return {
          volume: vol,
          returns: ret,
          rate: vol > 0 ? ret / vol : 0,
          range
      };
  };

  // --- NEW LOGIC: DYNAMIC TARGET DATE CALCULATION (50% Threshold) ---
  const totalProjectionVol = projectionSubset.reduce((acc, cur) => acc + cur.units_sold, 0);
  let p50VolDateTimestamp = t0Time; // Previously p80, now p50 target
  let p100DateTimestamp = t0Time;

  if (totalProjectionVol > 0) {
      // Sort by purchase date ASC
      const sortedSubset = [...projectionSubset].sort((a, b) => new Date(a.purchase_date).getTime() - new Date(b.purchase_date).getTime());
      
      let accumulatedVol = 0;
      let foundTarget = false; 
      
      for (const order of sortedSubset) {
          accumulatedVol += order.units_sold;
          const t = new Date(order.purchase_date).getTime();
          
          // Change Threshold from 0.8 to 0.5
          if (!foundTarget && accumulatedVol >= totalProjectionVol * 0.5) {
              p50VolDateTimestamp = t;
              foundTarget = true;
          }
          // The last order determines the 100% mark
          p100DateTimestamp = t;
      }
  } else {
      // If no volume, default to T0 + span (worst case)
      p50VolDateTimestamp = t0Time;
      p100DateTimestamp = t0Time;
  }

  // Target: When 50% of volume passes P50
  const earliestEvalTime = p50VolDateTimestamp + (d_value * MS_PER_DAY);
  const earliestEvalDate = new Date(earliestEvalTime).toISOString().split('T')[0];
  
  // Target: When 100% of volume passes P90 (Full Maturity)
  const p90Time = p100DateTimestamp + (p90_value * MS_PER_DAY);
  const p90Date = new Date(p90Time).toISOString().split('T')[0];

  // Days To Wait Logic
  // If S (Latest Data) >= earliestEvalTime, then we have enough data.
  const daysToWait = Math.ceil((earliestEvalTime - sTime) / MS_PER_DAY);
  
  // --- END NEW LOGIC ---

  // 7. Projection Logic
  const baselineRate = calcStats(preSubset).rate; 

  const getCumulativePct = (day: number) => {
      if (distribution.length === 0) return 1;
      const bucket = distribution.slice().reverse().find(b => b.days <= day);
      if (!bucket) return 0;
      
      const bucketIdx = distribution.indexOf(bucket);
      const nextBucket = distribution[bucketIdx + 1];
      
      if (!nextBucket) return bucket.cumulativePct;
      
      const range = nextBucket.days - bucket.days;
      const progress = (day - bucket.days) / range;
      const pctRange = nextBucket.cumulativePct - bucket.cumulativePct;
      
      return bucket.cumulativePct + (progress * pctRange);
  };

  const dailyMap = new Map<string, { vol: number; ret: number; pTime: number }>();
  projectionSubset.forEach(o => {
      const d = o.purchase_date.split('T')[0];
      if (!dailyMap.has(d)) {
          dailyMap.set(d, { 
              vol: 0, 
              ret: 0, 
              pTime: new Date(o.purchase_date).getTime() 
          });
      }
      const entry = dailyMap.get(d)!;
      entry.vol += o.units_sold;
      entry.ret += getReturnCount(o);
  });

  const dailyProjections: DailyProjectionRow[] = [];
  
  const projBuckets: Record<string, ProjectionBucket> = {
      finalized: {
          id: 'finalized',
          label: '已完结 (Closed)',
          ageRange: `> ${p90_value}天`,
          volume: 0, realizedReturns: 0, forecastedReturns: 0, totalExpectedReturns: 0, contributionRate: 0
      },
      mature: { 
          id: 'mature', 
          label: '已成熟 (Safe)', 
          ageRange: `${d_value} - ${p90_value}天`, 
          volume: 0, realizedReturns: 0, forecastedReturns: 0, totalExpectedReturns: 0, contributionRate: 0 
      },
      rampup: { 
          id: 'rampup', 
          label: '爬坡期 (Ramp-up)', 
          ageRange: `0 - ${d_value - 1}天`, 
          volume: 0, realizedReturns: 0, forecastedReturns: 0, totalExpectedReturns: 0, contributionRate: 0 
      }
  };

  dailyMap.forEach((stats, date) => {
      const ageDays = Math.floor((sTime - stats.pTime) / MS_PER_DAY);
      const cumPct = getCumulativePct(ageDays);
      const realized = stats.ret;
      const sales = stats.vol;
      
      let phase: 'rampup' | 'mature' | 'finalized' = 'rampup';
      let algorithm: 'linear-blend' | 'gross-up' | 'none' = 'none'; // Default to none/rampup
      let forecastAdd = 0;
      let weight = 0; 
      let projectedTotal = realized; // Default if no projection

      if (ageDays > p90_value) {
          phase = 'finalized';
          algorithm = 'gross-up';
          weight = 1;
          if (cumPct > 0.01) {
              const proj = realized / cumPct;
              forecastAdd = Math.max(0, proj - realized);
          } else {
              forecastAdd = 0;
          }
          projectedTotal = realized + forecastAdd;

      } else if (ageDays >= d_value) {
          phase = 'mature';
          algorithm = 'gross-up';
          weight = 1;
          if (cumPct > 0.01) {
              const proj = realized / cumPct;
              forecastAdd = Math.max(0, proj - realized);
          } else {
              forecastAdd = 0;
          }
          projectedTotal = realized + forecastAdd;

      } else {
          // Rampup / Early / Volatile
          // Request: Do NOT perform projection for this phase
          phase = 'rampup';
          algorithm = 'none';
          weight = 0;
          forecastAdd = 0; // Explicitly 0
          projectedTotal = realized; // Only showing realized
      }

      const currentRate = sales > 0 ? realized / sales : 0;
      const projectedRate = sales > 0 ? projectedTotal / sales : 0;

      dailyProjections.push({
          date,
          age: ageDays,
          phase,
          sales,
          realized,
          currentRate,
          lagPct: cumPct,
          algorithm,
          weight,
          forecastAdd,
          projectedTotal,
          projectedRate
      });

      const bucket = projBuckets[phase];
      bucket.volume += sales;
      bucket.realizedReturns += realized;
      bucket.forecastedReturns += forecastAdd;
  });

  dailyProjections.sort((a, b) => b.age - a.age);

  // Consolidate Projection Summary
  const allBuckets = Object.values(projBuckets);

  // 1. Calculate Grand Totals (Reference for Contribution Rates & Confidence)
  let grandTotalVolume = 0;
  allBuckets.forEach(b => grandTotalVolume += b.volume);

  // 2. Calculate Projection Metrics (STRICT: Only Mature + Finalized)
  // Request: "Forecast: Only count stable/finalized data, don't look at early/volatile period"
  const reliableBuckets = [projBuckets.finalized, projBuckets.mature];
  let reliableVolume = 0;
  let reliableRealized = 0;
  let reliableForecasted = 0;

  reliableBuckets.forEach(b => {
      reliableVolume += b.volume;
      reliableRealized += b.realizedReturns;
      reliableForecasted += b.forecastedReturns;
  });

  // Calculate stats for all buckets (for table display)
  allBuckets.forEach(b => {
      b.totalExpectedReturns = b.realizedReturns + b.forecastedReturns;
      b.contributionRate = grandTotalVolume > 0 ? b.totalExpectedReturns / grandTotalVolume : 0;
  });

  // 3. Final Metrics for Forecast
  const projectedTotalReturns = reliableRealized + reliableForecasted;
  // Key Logic Change: Rate is based only on reliable volume
  // If no reliable volume (all rampup), return NULL to indicate insufficient data instead of 0
  const projectedRate = reliableVolume > 0 ? projectedTotalReturns / reliableVolume : null;

  // Confidence Score Calculation (Reliable / Total)
  const confidenceScore = grandTotalVolume > 0 ? reliableVolume / grandTotalVolume : 0;

  // NEW LOGIC: Status simplified to 2 states
  let maturityStatus: 'insufficient' | 'projecting' = 'insufficient';
  
  // Threshold remains 0.5 for projecting. 
  // Previously < 0.5 was insufficient, >= 0.5 was projecting/mature.
  if (confidenceScore >= 0.5) {
      maturityStatus = 'projecting';
  } else {
      maturityStatus = 'insufficient';
  }
  
  // We keep isEvaluable as a separate flag for "High Confidence" target visualization
  // Changed to 0.5 to match the new "Target" requirement
  const isEvaluable = confidenceScore >= 0.5;

  // 8. Trend Calculation
  const trend: DailyTrend[] = [];
  const trendStart = refStart;
  const trendEnd = Math.min(postEnd, sTime + MS_PER_DAY);
  const daysInTrend = Math.max(0, Math.ceil((trendEnd - trendStart) / MS_PER_DAY));

  const trendMap = new Map<string, { vol: number; ret: number }>();
  [...refSubset, ...postNominalSubset].forEach(o => {
      const d = o.purchase_date.split('T')[0];
      if (!trendMap.has(d)) trendMap.set(d, { vol: 0, ret: 0 });
      const entry = trendMap.get(d)!;
      entry.vol += o.units_sold;
      entry.ret += getReturnCount(o);
  });

  for (let i = 0; i < daysInTrend; i++) {
      const t = trendStart + (i * MS_PER_DAY);
      const d = new Date(t);
      const dateStr = d.toISOString().split('T')[0];
      
      if (t > sTime) break;

      const stats = trendMap.get(dateStr) || { vol: 0, ret: 0 };
      
      trend.push({
          date: dateStr,
          volume: stats.vol,
          returns: stats.ret,
          rate: stats.vol > 0 ? stats.ret / stats.vol : 0,
          isPost: t >= t0Time
      });
  }

  return {
    fasin,
    t0: t0Str,
    s: sStr,
    d_value,
    p20_value,
    p90_value,
    
    // New Metrics
    maturityStatus,
    confidenceScore,
    isEvaluable,

    earliestEvalDate, // Now represents the date when 50% volume reaches P50
    p90Date, // Now represents when 100% volume reaches P90
    daysToWait,
    baselineRange,
    distribution,
    metrics: {
        pre: calcStats(preSubset),
        reference: calcStats(refSubset),
        postMature: calcStats(projectionSubset),
        postNominal: calcStats(postNominalSubset)
    },
    projection: {
        projectedRate,
        forecastedVolume: reliableForecasted, // Matches the projection scope
        buckets: [projBuckets.finalized, projBuckets.mature, projBuckets.rampup],
        baselineRate
    },
    dailyProjections,
    trend
  };
};