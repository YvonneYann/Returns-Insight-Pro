
import React, { useState, useMemo } from 'react';
import { 
  RefreshCcw, 
  MapPin, 
  HelpCircle, 
  History, 
  Clock, 
  ArrowRight, 
  AlertTriangle, 
  Sparkles, 
  Bot, 
  Target, 
  CheckCircle2
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import { ComparisonData } from '../../types';
import { getSafeArray, getSafeObject, formatPercent, formatNumber } from '../../utils/formatters';
import { AsinContrastCard } from '../AsinContrastCard';

export const CycleView: React.FC<{ data: ComparisonData }> = ({ data }) => {
  const [aiSummary, setAiSummary] = useState<string>("");
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);

  // Guard Clause for missing data
  if (!data.before.summary || !data.after.summary || !data.before.structure || !data.after.structure) {
     return <div className="p-12 text-center text-rose-600 bg-rose-50 rounded-xl m-8">数据不完整，无法进行对比分析。请检查上传的文件是否包含完整的 summary 和 structure 数据。</div>;
  }

  // 1. Process Data
  const cycleData = useMemo(() => {
    // robust summary access
    const beforeSum = getSafeObject(data.before.summary, 'parent_summary', { return_rate: 0, units_sold: 0, units_returned: 0 });
    const afterSum = getSafeObject(data.after.summary, 'parent_summary', { return_rate: 0, units_sold: 0, units_returned: 0 });
    
    // Global Metrics
    const returnRateDelta = (afterSum.return_rate || 0) - (beforeSum.return_rate || 0);
    
    // ASIN Migration Data
    const beforeList = getSafeArray(data.before.structure, 'asin_structure');
    const afterList = getSafeArray(data.after.structure, 'asin_structure');
    
    const beforeAsins = new Map(beforeList.map((a: any) => [a.asin, a]));
    const afterAsins = new Map(afterList.map((a: any) => [a.asin, a]));
    
    const commonAsins = Array.from(afterAsins.keys()).filter(k => beforeAsins.has(k));
    
    const migrationData = commonAsins.map(asin => {
        const b = beforeAsins.get(asin);
        const a = afterAsins.get(asin);
        return {
            asin,
            beforeRate: b.return_rate,
            afterRate: a.return_rate,
            sales: a.units_sold,
            delta: a.return_rate - b.return_rate,
            // Include full nodes for detail view
            beforeNode: b,
            afterNode: a
        };
    }).filter(item => {
        // Filter logic: Only keep Main Battlefield (A), Problem (B), or Watchlist from either BEFORE or AFTER periods
        const isTarget = (node: any) => {
             if (!node) return false;
             return node.problem_class === 'A' || 
                    node.problem_class === 'B' || 
                    node.high_return_watchlist === true;
        };
        return isTarget(item.beforeNode) || isTarget(item.afterNode);
    }).sort((a, b) => {
        // Sort by After Period Sales Share Descending
        const shareA = a.afterNode?.sales_share || 0;
        const shareB = b.afterNode?.sales_share || 0;
        return shareB - shareA;
    });

    // Reason Lookups
    const bReasonsMap = new Map();
    getSafeArray(data.before.reasons, 'problem_asin_reasons').forEach((r: any) => bReasonsMap.set(r.asin, r));
    
    const aReasonsMap = new Map();
    getSafeArray(data.after.reasons, 'problem_asin_reasons').forEach((r: any) => aReasonsMap.set(r.asin, r));

    return {
        metrics: {
            beforeSales: beforeSum.units_sold || 0,
            afterSales: afterSum.units_sold || 0,
            salesDelta: (afterSum.units_sold || 0) - (beforeSum.units_sold || 0),

            beforeReturns: beforeSum.units_returned || 0,
            afterReturns: afterSum.units_returned || 0,
            returnsDelta: (afterSum.units_returned || 0) - (beforeSum.units_returned || 0),

            beforeRate: beforeSum.return_rate || 0,
            afterRate: afterSum.return_rate || 0,
            rateDelta: returnRateDelta,
        },
        migrationData,
        reasons: { before: bReasonsMap, after: aReasonsMap },
        beforeAsins,
        afterAsins,
        summary: {
           before: beforeSum,
           after: afterSum
        }
    };
  }, [data]);

  // Date Logic
  const calculateDays = (s: string, e: string) => {
    const d1 = new Date(s);
    const d2 = new Date(e);
    const diff = d2.getTime() - d1.getTime();
    return Math.ceil(diff / (1000 * 3600 * 24)) + 1; // +1 to include start day
  };

  const beforeDays = calculateDays(cycleData.summary.before.start_date, cycleData.summary.before.end_date);
  const afterDays = calculateDays(cycleData.summary.after.start_date, cycleData.summary.after.end_date);

  // Attribution Logic
  const today = new Date();
  const afterEndDate = new Date(cycleData.summary.after.end_date);
  const daysSinceEnd = Math.floor((today.getTime() - afterEndDate.getTime()) / (1000 * 3600 * 24));
  const isIncomplete = daysSinceEnd < 30; // Standard Amazon return window lag
  const daysToWait = Math.max(0, 30 - daysSinceEnd);

  // AI Summary Generator
  const generateCycleSummary = async () => {
    setIsGeneratingSummary(true);
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        
        const prompt = `你是一位亚马逊运营专家。请根据以下 A/B Test 周期对比数据，生成一份简短的“核心分析摘要”。

**背景信息**:
- 站点: ${cycleData.summary.before.country}
- 父体ASIN: ${cycleData.summary.before.fasin}

**数据对比**:
- 调整前 (Before): 销量 ${formatNumber(cycleData.metrics.beforeSales)}, 退货率 ${formatPercent(cycleData.metrics.beforeRate)}
- 调整后 (After): 销量 ${formatNumber(cycleData.metrics.afterSales)}, 退货率 ${formatPercent(cycleData.metrics.afterRate)}
- 变化幅度: 退货率 ${cycleData.metrics.rateDelta > 0 ? '上升了' : '下降了'} ${formatPercent(Math.abs(cycleData.metrics.rateDelta))}

**要求**:
1. 请用 3-5 句话概括调整效果。
2. 明确指出这次调整是“有效”、“无效”还是“负面”。
3. 结合销量变化，评估是否在牺牲销量的前提下降低了退货率，或者实现了良性增长。
4. 语气专业、客观、简练。请直接输出摘要内容，不要包含寒暄。`;

        const response = await ai.models.generateContent({
             model: 'gemini-3-pro-preview',
             contents: prompt
        });
        setAiSummary(response.text || "无法生成总结");
    } catch(e) {
        console.error(e);
        setAiSummary("AI 服务暂时不可用。");
    } finally {
        setIsGeneratingSummary(false);
    }
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
       
       {/* 1. Header Information Section */}
        <div className="relative mb-8 rounded-2xl p-[1px] bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 shadow-2xl shadow-indigo-200/50">
            <div className="bg-white rounded-[calc(1rem-1px)] p-6 relative overflow-hidden">
                {/* Decorative Background Elements */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-50 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none opacity-60"></div>
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-purple-50 rounded-full blur-2xl translate-y-1/3 -translate-x-1/3 pointer-events-none opacity-60"></div>
                
                <div className="relative z-10">
                    <div className="flex flex-col lg:flex-row justify-between items-start gap-8">
                        
                        {/* Left Column: Identity */}
                        <div className="flex-1">
                            <div className="flex items-center gap-3 mb-3">
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-sm">
                                    <RefreshCcw className="w-3 h-3 mr-1.5" />
                                    退货周期对比分析
                                </span>
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
                                    <MapPin className="w-3 h-3 mr-1" />
                                    {cycleData.summary.before.country} 站
                                </span>
                            </div>
                            
                            <h1 className="text-4xl font-black text-slate-900 tracking-tight mb-2">
                                {cycleData.summary.before.fasin}
                            </h1>
                            <p className="text-slate-500 text-sm font-medium flex items-center gap-2">
                                <span className="uppercase tracking-wider text-xs font-bold text-slate-400">Parent ASIN</span>
                                <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                                <span className="text-slate-500">周期归因模式 (Cycle Attribution)</span>
                            </p>
                            
                            {/* Prominent Attribution Info */}
                            <div className="mt-6 flex items-center gap-4 bg-blue-50 border border-blue-100 rounded-2xl p-6 shadow-sm">
                                <div className="bg-blue-100 p-3.5 rounded-xl text-blue-600 shrink-0 shadow-inner">
                                    <HelpCircle className="w-5 h-5" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-blue-900 mb-1">数据基于“下单日期”归因</p>
                                    <p className="text-sm text-blue-700/80 font-medium">Return Window: 30 Days Lag</p>
                                </div>
                            </div>
                        </div>

                        {/* Right Column: Time Comparison Visual */}
                        <div className="flex-shrink-0 w-full lg:w-auto flex flex-col items-end">
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                                {/* Before Block */}
                                <div className="flex-1 sm:flex-none bg-slate-50 rounded-xl border border-slate-200 p-4 min-w-[240px] relative group hover:border-slate-300 transition-colors">
                                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex justify-between items-center">
                                        <span>Before Period</span>
                                        <span className="bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded text-[10px]">{beforeDays} 天</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-white border border-slate-100 flex items-center justify-center text-slate-400 shadow-sm">
                                            <History className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-slate-700 font-mono">{cycleData.summary.before.start_date}</p>
                                            <p className="text-xs text-slate-400 font-mono text-center leading-none my-0.5">↓</p>
                                            <p className="text-sm font-bold text-slate-700 font-mono">{cycleData.summary.before.end_date}</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Arrow Connector */}
                                <div className="flex items-center justify-center text-slate-300">
                                    <ArrowRight className="w-5 h-5 rotate-90 sm:rotate-0" />
                                </div>

                                {/* After Block */}
                                <div className="flex-1 sm:flex-none bg-indigo-50 rounded-xl border border-indigo-100 p-4 min-w-[240px] relative group hover:border-indigo-200 transition-colors">
                                    <div className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-2 flex justify-between items-center">
                                        <span>After Period</span>
                                        <span className="bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded text-[10px]">{afterDays} 天</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-white border border-indigo-100 flex items-center justify-center text-indigo-500 shadow-sm">
                                            <Clock className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-indigo-900 font-mono">{cycleData.summary.after.start_date}</p>
                                            <p className="text-xs text-indigo-300 font-mono text-center leading-none my-0.5">↓</p>
                                            <p className="text-sm font-bold text-indigo-900 font-mono">{cycleData.summary.after.end_date}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            {/* Warning Badge */}
                            {isIncomplete && (
                                <div className="mt-4 bg-amber-50 border border-amber-100 rounded-xl p-4 max-w-[400px] shadow-sm animate-in slide-in-from-right-4 fade-in duration-500">
                                    <div className="flex items-start gap-3">
                                        <div className="bg-amber-100 p-1.5 rounded-full text-amber-600 shrink-0 mt-0.5">
                                            <AlertTriangle className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-amber-800 mb-1">归因数据可能不完整</p>
                                            <p className="text-sm text-amber-700/90 leading-relaxed text-left">
                                                统计结束日期距今不足 30 天，部分退货数据可能尚未回流，建议仅作参考。
                                            </p>
                                            {daysToWait > 0 && (
                                                <p className="text-xs font-semibold text-amber-600 mt-1.5 flex items-center gap-1">
                                                   <Clock className="w-3 h-3" />
                                                   <span>预计还需 {daysToWait} 天数据才能完全沉淀。</span>
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                    </div>
                </div>
            </div>
        </div>

       {/* 2. AI Executive Summary */}
       <div className="mb-8">
          {!aiSummary ? (
             <div className="relative w-full rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 p-1 shadow-lg overflow-hidden group">
                <div className="absolute inset-0 bg-white opacity-5 pointer-events-none"></div>
                <div className="relative bg-white/10 backdrop-blur-sm rounded-[calc(0.75rem-1px)] p-6 flex flex-col md:flex-row items-center justify-between gap-6">
                    
                    <div className="flex items-center gap-4 text-white">
                        <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center shrink-0 backdrop-blur-md border border-white/20 shadow-inner">
                            <Sparkles className="w-6 h-6 text-yellow-300" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold flex items-center gap-2">
                                AI 智能归因诊断
                                <span className="text-[10px] font-medium bg-white/20 px-2 py-0.5 rounded-full border border-white/10">Gemini 3.0 Pro</span>
                            </h3>
                            <p className="text-indigo-100 text-sm mt-1 max-w-xl leading-relaxed opacity-90">
                                深度分析退货原因漂移与改进效果，一键生成核心摘要。
                            </p>
                        </div>
                    </div>

                    <button 
                        onClick={generateCycleSummary}
                        disabled={isGeneratingSummary}
                        className="group relative bg-white text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 font-bold text-sm px-6 py-2.5 rounded-lg shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-80 disabled:cursor-wait whitespace-nowrap flex items-center gap-2"
                    >
                        {isGeneratingSummary ? (
                            <>
                                <Bot className="w-4 h-4 animate-bounce" />
                                <span>正在生成...</span>
                            </>
                        ) : (
                            <>
                                <span>开始生成报告</span>
                                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                            </>
                        )}
                    </button>
                </div>
             </div>
          ) : (
             <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl p-[1px] shadow-lg animate-in fade-in slide-in-from-top-4">
                <div className="bg-white rounded-[calc(0.75rem-1px)] p-6 relative overflow-hidden">
                   <div className="flex items-start gap-4">
                      <div className="bg-indigo-100 p-2 rounded-lg text-indigo-600 shrink-0 mt-1">
                         <Bot className="w-6 h-6" />
                      </div>
                      <div className="flex-1">
                         <h3 className="text-lg font-bold text-slate-800 mb-2 flex items-center gap-2">
                            AI 核心摘要
                            <span className="text-xs font-normal text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">Gemini 3.0 Pro Analysis</span>
                         </h3>
                         <div className="prose prose-slate max-w-none text-slate-600 leading-relaxed text-base">
                            {aiSummary}
                         </div>
                      </div>
                      <button 
                         onClick={() => setAiSummary("")}
                         className="text-slate-400 hover:text-slate-600"
                         title="重新生成"
                      >
                         <RefreshCcw className="w-4 h-4" />
                      </button>
                   </div>
                </div>
             </div>
          )}
       </div>

       {/* 3. Impact Scorecard */}
       <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Card 1: Total Sales */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                <p className="text-sm text-slate-500 font-bold uppercase mb-2">总销量 (Units Sold)</p>
                <div className="flex items-baseline gap-2 mb-1">
                     <span className="text-2xl font-bold text-slate-900">
                        {cycleData.metrics.salesDelta > 0 ? '+' : ''}{formatNumber(cycleData.metrics.salesDelta)}
                     </span>
                </div>
                <div className="text-sm text-slate-500 font-mono flex items-center bg-slate-50 px-2 py-1 rounded w-fit">
                    <span>{formatNumber(cycleData.metrics.beforeSales)}</span>
                    <span className="text-slate-300 mx-2">|</span>
                    <span>{formatNumber(cycleData.metrics.afterSales)}</span>
                </div>
            </div>

            {/* Card 2: Total Returns */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                <p className="text-sm text-slate-500 font-bold uppercase mb-2">总退货量 (Returns)</p>
                <div className="flex items-baseline gap-2 mb-1">
                     <span className={`text-2xl font-bold ${cycleData.metrics.returnsDelta > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {cycleData.metrics.returnsDelta > 0 ? '+' : ''}{formatNumber(cycleData.metrics.returnsDelta)}
                     </span>
                </div>
                <div className="text-sm text-slate-500 font-mono flex items-center bg-slate-50 px-2 py-1 rounded w-fit">
                    <span>{formatNumber(cycleData.metrics.beforeReturns)}</span>
                    <span className="text-slate-300 mx-2">|</span>
                    <span>{formatNumber(cycleData.metrics.afterReturns)}</span>
                </div>
            </div>

            {/* Card 3: Return Rate */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                <p className="text-sm text-slate-500 font-bold uppercase mb-2">整体退货率 (Return Rate)</p>
                <div className="flex items-baseline gap-2 mb-1">
                     <span className={`text-2xl font-bold ${cycleData.metrics.rateDelta < 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {cycleData.metrics.rateDelta > 0 ? '+' : ''}{formatPercent(cycleData.metrics.rateDelta)}
                     </span>
                </div>
                <div className="text-sm text-slate-500 font-mono flex items-center bg-slate-50 px-2 py-1 rounded w-fit">
                    <span>{formatPercent(cycleData.metrics.beforeRate)}</span>
                    <span className="text-slate-300 mx-2">|</span>
                    <span>{formatPercent(cycleData.metrics.afterRate)}</span>
                </div>
            </div>

            {/* Card 4: Effectiveness */}
            <div className={`p-5 rounded-xl border shadow-sm ${
                cycleData.metrics.rateDelta < 0 
                ? 'bg-emerald-50 border-emerald-200' 
                : 'bg-rose-50 border-rose-200'
            }`}>
                <p className={`text-sm font-bold uppercase mb-2 ${
                    cycleData.metrics.rateDelta < 0 ? 'text-emerald-700' : 'text-rose-700'
                }`}>调整效果</p>
                <div className={`text-xl font-extrabold ${
                    cycleData.metrics.rateDelta < 0 ? 'text-emerald-800' : 'text-rose-800'
                }`}>
                    {cycleData.metrics.rateDelta < 0 ? '有效调整' : '无效调整'}
                </div>
                 <p className={`text-sm mt-1 opacity-80 ${
                    cycleData.metrics.rateDelta < 0 ? 'text-emerald-700' : 'text-rose-700'
                 }`}>
                    {cycleData.metrics.rateDelta < 0 ? '退货率下降' : '退货率上升或持平'}
                 </p>
            </div>
       </div>

       {/* 4. Detailed ASIN Contrast List */}
       <div className="space-y-4">
           <div className="flex items-center gap-2 mb-2">
               <Target className="w-5 h-5 text-indigo-600" />
               <h3 className="font-bold text-slate-800 text-lg">ASIN 深度对比与阵营迁移</h3>
           </div>
           <p className="text-sm text-slate-500 mb-6 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span>
                 已按要求筛选：仅展示 
                 <span className="font-bold text-slate-700 mx-1">主战场款 (Class A)</span> / 
                 <span className="font-bold text-slate-700 mx-1">高退货问题款 (Class B)</span> / 
                 <span className="font-bold text-slate-700 mx-1">观察对象 (Watchlist)</span>
                 相关的迁移记录。
              </span>
           </p>
           
           <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {cycleData.migrationData.map((item) => (
                    <AsinContrastCard
                        key={item.asin}
                        asin={item.asin}
                        beforeNode={item.beforeNode}
                        afterNode={item.afterNode}
                        beforeReasons={cycleData.reasons.before.get(item.asin)}
                        afterReasons={cycleData.reasons.after.get(item.asin)}
                    />
                ))}
                {cycleData.migrationData.length === 0 && (
                   <div className="col-span-full py-12 text-center bg-slate-50 rounded-xl border border-dashed border-slate-300">
                      <p className="text-slate-500">未发现符合筛选条件的 ASIN 迁移数据。</p>
                   </div>
                )}
           </div>
       </div>

        {/* Footer */}
        <div className="mt-12 pt-6 border-t border-slate-200 text-center">
          <p className="text-xs text-slate-400">报告生成：Returns Insight Pro • {new Date().toLocaleDateString('zh-CN')}</p>
        </div>
    </div>
  );
};
