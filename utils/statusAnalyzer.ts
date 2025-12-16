import { AppData, ReasonTag, ReportMode } from '../types';
import { getSafeArray, getSafeObject, cleanReviewText, formatPercent, formatNumber } from './formatters';

// Define the structured output for both UI and Markdown
export interface AnalyzedStatusData {
  reportMode: ReportMode; // Added for generator context
  reportDate: string;
  reportTitle: string;
  methodology: string;
  integrityWarning?: {
      isIncomplete: boolean;
      daysToWait: number;
  };
  
  // 1. Narrative Layer
  narrative: {
    country: string;
    fasin: string;
    period: string; // "YYYY-MM-DD to YYYY-MM-DD"
    healthStatus: 'CRITICAL' | 'HEALTHY';
    healthLabel: string; // "预警" or "健康"
    healthEmoji: string; // 🔴 or 🟢
    healthColorClass: string; // Tailwind class for UI
    healthBgClass: string; // Tailwind class for UI
    healthIconName: 'AlertTriangle' | 'CheckCircle2'; // For UI Icon mapping
    strategicOverview: string; // The full text analysis
  };

  // 2. Statistics Layer
  statistics: {
    totalSold: number;
    totalReturns: number;
    returnRate: number;
    returnRateFormatted: string;
    isHighRisk: boolean;
  };

  // 3. Structural Layer (Groups)
  groups: {
    classA: {
      items: AnalyzedAsinNode[];
      count: number;
      totalSalesShare: number;
      totalReturnsShare: number;
      insight: string;
    };
    classB: {
      items: AnalyzedAsinNode[];
      count: number;
      totalSalesShare: number;
      totalReturnsShare: number;
      totalUnitsSold: number;
      totalUnitsReturned: number;
      avgReturnRate: number;
      insight: string;
    };
    watchlist: {
      items: AnalyzedAsinNode[];
      count: number;
      totalSalesShare: number;
      totalReturnsShare: number;
      insight: string;
    };
  };

  // 4. Entities Layer (Deep Dive)
  entities: AnalyzedEntity[];
}

export interface AnalyzedAsinNode {
  asin: string;
  salesShare: number;
  returnsShare: number;
  returnRate: number;
  unitsSold: number;
  unitsReturned: number;
  statusLabel: string; // "Healthy", "Risk"
  statusIcon: string; // 🟢, 🔴
}

export interface AnalyzedEntity {
  asin: string;
  problemClass: string;
  problemClassLabel: string; // "主战场款" or "问题款"
  unitsReturned: number;
  totalEvents: number;
  textCoverage: number;
  confidenceLevel: string; // high, medium, low
  confidenceLabel: string; // 高, 中, 低
  
  // Deep Dive Data
  topReasons: AnalyzedReason[];
  evidenceText: string | null; // Merged evidence text
  
  // Context for AI (Listing Data)
  listingContext?: {
    title: string;
    features: string;
    description: string;
  };
}

export interface AnalyzedReason {
  code: string;
  name: string;
  pct: number;
  count: number;
  isPrimary: boolean;
  explanation?: string;
}

export const analyzeStatusData = (data: AppData, mode: ReportMode = 'return'): AnalyzedStatusData => {
  // 1. Safe Extraction
  const summary = getSafeObject(data.summary, 'parent_summary', { 
    return_rate: 0, units_sold: 0, units_returned: 0, fasin: 'Unknown', country: 'Unknown', start_date: '-', end_date: '-' 
  });
  const structure = getSafeArray(data.structure, 'asin_structure');
  
  // 2. Statistics & Health Logic
  const returnRate = summary.return_rate || 0;
  const isHighRisk = returnRate >= 0.10;
  const isPurchaseMode = mode === 'purchase';
  
  // Title & Methodology Logic
  const reportTitle = isPurchaseMode 
      ? "🛒 Purchase Attribution Report (下单归因分析)"
      : "📊 Return Window Report (退货窗口分析)";

  const methodology = isPurchaseMode
      ? "Based on Purchase Date (30-Day Lag Window) | 数据基于下单日期回溯"
      : "Based on Return Date | 数据基于退货发生日统计";

  // Data Integrity Logic (for Purchase Mode)
  let integrityWarning = undefined;
  if (isPurchaseMode && summary.end_date && summary.end_date !== '-') {
      const today = new Date();
      // Handle timezone offset simply by using UTC dates or just raw timestamp diff
      // Assuming summary.end_date is YYYY-MM-DD
      const end = new Date(summary.end_date); 
      // Reset time portion to avoid sub-day issues
      end.setHours(0,0,0,0);
      today.setHours(0,0,0,0);

      const daysSinceEnd = Math.floor((today.getTime() - end.getTime()) / (1000 * 3600 * 24));
      
      // If less than 30 days have passed since the end of the reporting period
      if (daysSinceEnd < 30) {
          integrityWarning = {
              isIncomplete: true,
              daysToWait: Math.max(0, 30 - daysSinceEnd)
          };
      }
  }
  
  const narrativeContext = isPurchaseMode 
    ? "基于下单日期归因（Purchase Window）" 
    : "基于退货发生日（Return Window）";

  let narrative: AnalyzedStatusData['narrative'] = {
    country: summary.country,
    fasin: summary.fasin,
    period: `${summary.start_date} to ${summary.end_date}`,
    healthStatus: isHighRisk ? 'CRITICAL' : 'HEALTHY',
    healthLabel: isHighRisk ? '预警' : '健康',
    healthEmoji: isHighRisk ? '🔴' : '🟢',
    healthColorClass: isHighRisk ? 'text-amber-600' : 'text-emerald-600',
    healthBgClass: isHighRisk ? 'bg-amber-50' : 'bg-emerald-50',
    healthIconName: isHighRisk ? 'AlertTriangle' : 'CheckCircle2',
    strategicOverview: isHighRisk 
      ? `${narrativeContext}：本期父体整体退货率为 ${formatPercent(returnRate)}，高于警戒线 10%，整体处于退货偏高的预警状态。建议结合下方诊断结果，优先治理「高退货问题 ASIN」，控制问题款放量，同时对「主战场 ASIN」做精细优化，并提前处理「高退货观察对象」，逐步压降整体退货率和退货成本。`
      : `${narrativeContext}：本期父体整体退货率为 ${formatPercent(returnRate)}，低于警戒线 10%，整体处于健康可控状态，短期内无明显退货风险。`
  };

  // 3. Grouping Logic (Class A, B, Watchlist)
  const mapToNode = (item: any): AnalyzedAsinNode => ({
    asin: item.asin,
    salesShare: item.sales_share || 0,
    returnsShare: item.returns_share || 0,
    returnRate: item.return_rate || 0,
    unitsSold: item.units_sold || 0,
    unitsReturned: item.units_returned || 0,
    statusLabel: (item.return_rate || 0) > 0.1 ? 'Risk' : 'Healthy',
    statusIcon: (item.return_rate || 0) > 0.1 ? '🔴' : '🟢'
  });

  const rawClassA = structure.filter((item: any) => item.problem_class === 'A').sort((a: any, b: any) => b.sales_share - a.sales_share);
  const rawClassB = structure.filter((item: any) => item.problem_class === 'B').sort((a: any, b: any) => b.sales_share - a.sales_share);
  const rawWatchlist = structure.filter((item: any) => item.high_return_watchlist && item.problem_class !== 'B').sort((a: any, b: any) => b.return_rate - a.return_rate);

  // Group Stats Calculation
  const calcGroupStats = (items: any[]) => {
    return {
      salesShare: items.reduce((sum, item) => sum + (item.sales_share || 0), 0),
      returnsShare: items.reduce((sum, item) => sum + (item.returns_share || 0), 0),
      unitsSold: items.reduce((sum, item) => sum + (item.units_sold || 0), 0),
      unitsReturned: items.reduce((sum, item) => sum + (item.units_returned || 0), 0),
    };
  };

  const statsA = calcGroupStats(rawClassA);
  const statsB = calcGroupStats(rawClassB);
  const statsW = calcGroupStats(rawWatchlist);
  const avgRateB = statsB.unitsSold > 0 ? statsB.unitsReturned / statsB.unitsSold : 0;

  const groups: AnalyzedStatusData['groups'] = {
    classA: {
      items: rawClassA.map(mapToNode),
      count: rawClassA.length,
      totalSalesShare: statsA.salesShare,
      totalReturnsShare: statsA.returnsShare,
      insight: `构成基本盘。不一定退货率偏高，但对整体盘子影响最大，需保障放量同时监控波动。`
    },
    classB: {
      items: rawClassB.map(mapToNode),
      count: rawClassB.length,
      totalSalesShare: statsB.salesShare,
      totalReturnsShare: statsB.returnsShare,
      totalUnitsSold: statsB.unitsSold,
      totalUnitsReturned: statsB.unitsReturned,
      avgReturnRate: avgRateB,
      insight: `兼具“高退货 + 高权重”特征，是短期内优先排查和整改的对象。`
    },
    watchlist: {
      items: rawWatchlist.map(mapToNode),
      count: rawWatchlist.length,
      totalSalesShare: statsW.salesShare,
      totalReturnsShare: statsW.returnsShare,
      insight: `销量占比低 (${formatPercent(statsW.salesShare)})，但退货率已触发警戒，需防止其上量后演变为问题款。`
    }
  };

  // 4. Entities Logic (Merging Evidence & Listing)
  const rawReasons = getSafeArray(data.reasons, 'problem_asin_reasons');
  const evidenceList = getSafeArray(data.explanations, 'evidence');
  const reasonExpList = getSafeArray(data.explanations, 'reason_explanations');
  const allExplanations = [...evidenceList, ...reasonExpList];
  const listingArray = getSafeArray(data.listing, 'problem_asin_listing');

  const entities: AnalyzedEntity[] = rawReasons.map((r: any) => {
    // 4.1 Merge Reasons with Explanations
    const coreReasons = (r.core_reasons || []).map((tag: any) => {
       const matches = allExplanations.filter((e: any) => e.asin === r.asin && e.tag_code === tag.tag_code);
       
       let detailedText = undefined;
       const explicitSummaries = matches.map((e: any) => e.explanation).filter((t: any) => typeof t === 'string' && t.trim().length > 0);
       
       if (explicitSummaries.length > 0) {
           detailedText = Array.from(new Set(explicitSummaries)).join('；');
       } else {
           const rawEvidence = matches.map((e: any) => e.evidence).filter((t: any) => typeof t === 'string' && t.trim().length > 0);
           if (rawEvidence.length > 0) {
               const cleaned: string[] = rawEvidence.map(cleanReviewText).filter((t: string) => t.length > 1);
               const unique = Array.from(new Set(cleaned));
               unique.sort((a, b) => b.length - a.length);
               detailedText = unique.slice(0, 5).map((t, i) => `${i + 1}. ${t}`).join('\n');
           }
       }
       return { ...tag, explanation: detailedText };
    });

    // Sort reasons by count
    coreReasons.sort((a: any, b: any) => b.event_count - a.event_count);
    
    // 4.2 Determine Primary Evidence Text for the "User Voice" section
    const topReason = coreReasons[0];
    const secondReason = coreReasons.length > 1 ? coreReasons[1] : null;
    // Use second reason if first is "NO_MATCH" (generic)
    const targetReason = (topReason?.tag_code === 'NO_MATCH' && secondReason) ? secondReason : topReason;
    const evidenceText = targetReason?.explanation || null;

    // 4.3 Listing Context
    const listingItem = listingArray.find((l: any) => l.asin === r.asin);
    let listingContext = undefined;
    if (listingItem) {
        try {
            const payload = JSON.parse(listingItem.payload);
            listingContext = {
                title: payload.title || "Unknown Title",
                features: Array.isArray(payload.features) ? payload.features.join('\n') : (payload.features || ""),
                description: payload.description || ""
            };
        } catch (e) { console.error("Listing parse error", e); }
    }

    const confidenceMap: Record<string, string> = { high: '高', medium: '中', low: '低' };

    return {
      asin: r.asin,
      problemClass: r.problem_class,
      problemClassLabel: r.problem_class_label_cn || (r.problem_class === 'A' ? '主战场款' : '问题款'),
      unitsReturned: r.units_returned || 0,
      totalEvents: r.total_events || 0,
      textCoverage: r.text_coverage || 0,
      confidenceLevel: r.reason_confidence_level,
      confidenceLabel: confidenceMap[r.reason_confidence_level] || r.reason_confidence_level,
      topReasons: coreReasons.map((tag: any) => ({
        code: tag.tag_code,
        name: tag.tag_name_cn,
        pct: tag.event_coverage,
        count: tag.event_count,
        isPrimary: tag.is_primary,
        explanation: tag.explanation
      })),
      evidenceText,
      listingContext
    };
  });

  return {
    reportMode: mode, // Pass mode to output
    reportDate: new Date().toLocaleDateString('zh-CN'),
    reportTitle,
    methodology,
    integrityWarning,
    narrative,
    statistics: {
      totalSold: summary.units_sold,
      totalReturns: summary.units_returned,
      returnRate: returnRate,
      returnRateFormatted: formatPercent(returnRate),
      isHighRisk
    },
    groups,
    entities
  };
};