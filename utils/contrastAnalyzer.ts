
import { AppData, RawOrderRow } from '../types';

export interface ContrastMetrics {
  sales: number;
  returns: number;
  rate: number;
}

export interface DailyContrastRow {
  date: string;       // The specific date in the window (e.g. Oct 1)
  matchedDate: string;// The corresponding date in the reference window (e.g. Sep 1)
  ageLimit: number;   // The censoring age limit for this specific day
  
  sales: number;      // Sales on this day
  returns: number;    // Realized returns for this day (censored for Before)
  
  refSales: number;   // Reference sales
  refReturns: number; // Reference returns (censored)
}

export interface ContrastResult {
  hasData: boolean;
  t0: string;
  s: string; // Latest data date
  runDays: number; // Comparison window length (Days span)
  
  before: ContrastMetrics;
  after: ContrastMetrics;
  
  deltaRate: number; // Relative change percentage (环比)
  isImproved: boolean;
  
  velocityChart: {
      day: number;
      beforeRate: number;
      afterRate: number;
  }[];

  dailyBreakdown: DailyContrastRow[];
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export const analyzeContrast = (data: AppData): ContrastResult | null => {
  if (!data.return_order || !data.t0Date || data.return_order.length === 0) return null;

  const t0Time = new Date(data.t0Date).getTime();
  const t0Str = data.t0Date;

  // 1. Determine S (Latest Purchase Date in dataset)
  let maxTime = 0;
  data.return_order.forEach(o => {
    const t = new Date(o.purchase_date).getTime();
    if (t > maxTime) maxTime = t;
  });
  
  // Requirement: Max Age Limit excludes T0.
  // We strictly start counting "After" from T0 + 1 Day.
  // If S <= T0, we don't have any valid data in the strict "After" window.
  if (maxTime <= t0Time) return null;

  const sDate = new Date(maxTime);
  const sStr = sDate.toISOString().split('T')[0];

  // 2. Define the "Run" (After Window)
  // Strictly AFTER T0: Start at T0 + 1 Day
  const afterStart = t0Time + MS_PER_DAY; 
  
  // Calculate window length
  // e.g. T0=Oct1, S=Oct2. AfterStart=Oct2. Duration=0ms. Days=1.
  const runDurationMs = maxTime - afterStart;
  const runDaysIndex = Math.floor(runDurationMs / MS_PER_DAY); 
  const daysCount = runDaysIndex + 1;
  
  // 3. Define "Before Window"
  // Ends at T0 (exclusive) -> [T0 - daysCount, T0)
  const beforeStart = t0Time - (daysCount * MS_PER_DAY);

  // 4. Data Bucket Initialization
  let afterTotalSales = 0;
  let afterTotalReturns = 0;
  let beforeTotalSales = 0;
  let beforeTotalReturns = 0;

  const dailyRows: DailyContrastRow[] = [];
  
  // Maps for chart velocity aggregation (Day 0 to Max Age)
  const afterVelocity: number[] = new Array(daysCount).fill(0); 
  const beforeVelocity: number[] = new Array(daysCount).fill(0); 

  // Helpers
  const getReturnCount = (o: RawOrderRow): number => {
    return (o.units_returned && o.units_returned > 0) ? o.units_returned : (o.return_date ? o.units_sold : 0);
  };

  const getLag = (o: RawOrderRow): number | null => {
      if (!o.return_date) return null;
      const p = new Date(o.purchase_date).getTime();
      const r = new Date(o.return_date).getTime();
      return Math.floor((r - p) / MS_PER_DAY);
  };

  // 5. Iterate Day by Day (The "Fairness" Loop)
  for (let i = 0; i < daysCount; i++) {
      // A. After Date Processing
      const currentAfterTime = afterStart + (i * MS_PER_DAY);
      const currentAfterDateStr = new Date(currentAfterTime).toISOString().split('T')[0];
      
      // Calculate Censoring Limit for this specific day
      // Age Limit = S - currentAfterTime
      // This is the maximum days an order could have existed
      const ageLimitMs = maxTime - currentAfterTime;
      const ageLimitDays = Math.floor(ageLimitMs / MS_PER_DAY);

      const afterOrders = data.return_order.filter(o => o.purchase_date === currentAfterDateStr);
      
      let dayASales = 0;
      let dayAReturns = 0;

      afterOrders.forEach(o => {
          dayASales += o.units_sold;
          const rCount = getReturnCount(o);
          if (rCount > 0) {
             const lag = getLag(o);
             // After data is naturally censored by dataset cutoff S, so we just count it
             dayAReturns += rCount;
             
             // For Chart
             if (lag !== null && lag >= 0 && lag < daysCount) {
                 afterVelocity[lag] += rCount;
             }
          }
      });

      // B. Before Date Processing
      const currentBeforeTime = beforeStart + (i * MS_PER_DAY);
      const currentBeforeDateStr = new Date(currentBeforeTime).toISOString().split('T')[0];
      
      const beforeOrders = data.return_order.filter(o => o.purchase_date === currentBeforeDateStr);

      let dayBSales = 0;
      let dayBReturns = 0; // Censored

      beforeOrders.forEach(o => {
          dayBSales += o.units_sold;
          const rCount = getReturnCount(o);
          if (rCount > 0) {
              const lag = getLag(o);
              // CRITICAL CENSORING LOGIC
              // Only count return if it happened within the same age limit as the After group
              if (lag !== null && lag <= ageLimitDays) {
                  dayBReturns += rCount;
                  
                  // For Chart
                  if (lag >= 0 && lag < daysCount) {
                      beforeVelocity[lag] += rCount;
                  }
              }
          }
      });

      // Aggregate
      afterTotalSales += dayASales;
      afterTotalReturns += dayAReturns;
      beforeTotalSales += dayBSales;
      beforeTotalReturns += dayBReturns;

      dailyRows.push({
          date: currentAfterDateStr,
          matchedDate: currentBeforeDateStr,
          ageLimit: ageLimitDays,
          sales: dayASales,
          returns: dayAReturns,
          refSales: dayBSales,
          refReturns: dayBReturns
      });
  }

  // 6. Final Metrics & Relative Delta
  const beforeRate = beforeTotalSales > 0 ? beforeTotalReturns / beforeTotalSales : 0;
  const afterRate = afterTotalSales > 0 ? afterTotalReturns / afterTotalSales : 0;
  
  // Requirement: Change absolute difference to Relative Change (环比)
  let deltaRate = 0;
  if (beforeRate > 0) {
      deltaRate = (afterRate - beforeRate) / beforeRate;
  } else if (afterRate > 0) {
      deltaRate = 1.0; // 100% increase (from 0 to something)
  }
  // if both 0, delta is 0.

  // 7. Velocity Chart Data (Absolute rates for chart)
  let cumA = 0;
  let cumB = 0;
  const velocityChart = [];
  
  for (let d = 0; d < daysCount; d++) {
      cumA += afterVelocity[d] || 0;
      cumB += beforeVelocity[d] || 0;
      
      velocityChart.push({
          day: d,
          afterRate: afterTotalSales > 0 ? cumA / afterTotalSales : 0,
          beforeRate: beforeTotalSales > 0 ? cumB / beforeTotalSales : 0
      });
  }

  dailyRows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return {
      hasData: true,
      t0: t0Str,
      s: sStr,
      runDays: daysCount, // This represents the span length
      before: {
          sales: beforeTotalSales,
          returns: beforeTotalReturns,
          rate: beforeRate
      },
      after: {
          sales: afterTotalSales,
          returns: afterTotalReturns,
          rate: afterRate
      },
      deltaRate,
      isImproved: deltaRate < 0,
      velocityChart,
      dailyBreakdown: dailyRows
  };
};
