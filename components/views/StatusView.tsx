import React, { useState, useMemo } from 'react';
import { 
  Activity, 
  AlertTriangle, 
  Target, 
  Eye, 
  TrendingUp, 
  Lightbulb, 
  BarChart3, 
  HelpCircle, 
  ZoomIn, 
  Sparkles, 
  Bot, 
  MapPin,
  Calendar,
  ShoppingCart,
  Clock
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import { AppData, ReportMode } from '../../types';
import { formatPercent, formatNumber } from '../../utils/formatters';
import { analyzeStatusData, AnalyzedEntity } from '../../utils/statusAnalyzer';

interface StatusViewProps {
  data: AppData;
  mode?: ReportMode;
  aiInsights: Record<string, string>;
  onInsightUpdate: (asin: string, content: string) => void;
}

export const StatusView: React.FC<StatusViewProps> = ({ data, mode = 'return', aiInsights, onInsightUpdate }) => {
  const [analyzingAsins, setAnalyzingAsins] = useState<Record<string, boolean>>({});

  // Use the centralized analyzer logic with mode
  const analysis = useMemo(() => analyzeStatusData(data, mode as ReportMode), [data, mode]);
  const { narrative, statistics, groups, entities } = analysis;
  
  // UI Display Logic based on mode
  const isPurchase = mode === 'purchase';
  const reportTitle = isPurchase ? "下单归因分析报告" : "退货窗口分析报告";
  const reportSubtitle = isPurchase ? "下单归因模式 (Purchase Window Analysis)" : "退货窗口模式 (Return Window Analysis)";
  const HeaderIcon = isPurchase ? ShoppingCart : BarChart3;

  // Date Logic for Purchase Mode Warning
  const daysSinceEnd = useMemo(() => {
    const endDateStr = narrative.period.split(' to ')[1];
    if (!endDateStr || endDateStr === '-') return 30; // Default to safe if no date
    const today = new Date();
    const end = new Date(endDateStr);
    return Math.floor((today.getTime() - end.getTime()) / (1000 * 3600 * 24));
  }, [narrative.period]);
  
  const isLagInsufficient = daysSinceEnd < 30;
  const daysToWait = Math.max(0, 30 - daysSinceEnd);

  // --- AI Analysis Logic ---
  const handleGenerateInsight = async (entity: AnalyzedEntity) => {
    const { asin, listingContext } = entity;
    
    // Find primary reason for prompt
    const targetReason = entity.topReasons[0]; 

    setAnalyzingAsins(prev => ({ ...prev, [asin]: true }));
    
    if (!listingContext || !listingContext.features) {
      onInsightUpdate(asin, `
          <div class="p-4 bg-slate-50 border border-slate-200 rounded-xl text-center">
            <p class="text-sm text-slate-400">ASIN 页面详情数据缺失，AI 无法对比“页面描述”与“用户反馈”的差异。请补充数据后重试。</p>
          </div>
      `);
      setAnalyzingAsins(prev => ({ ...prev, [asin]: false }));
      return;
    }

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const htmlTemplate = `
<div class="font-sans text-slate-900">
  
  <!-- 1. 产品画像 (Product Portrait) -->
  <div class="mb-6 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
    <div class="px-5 py-4 bg-indigo-50/50 border-b border-indigo-100 flex items-center gap-3">
        <span class="text-xl">📦</span>
        <h3 class="text-base font-bold text-indigo-950">产品画像与基本情况</h3>
    </div>
    <div class="p-6">
        <p class="text-sm text-slate-700 leading-relaxed">
          [在此处简述：这是一款什么产品？核心材质/功能/卖点是什么？]
        </p>
    </div>
  </div>

  <!-- 2. 诊断矩阵 (Diagnosis Matrix) -->
  <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
    
    <!-- Matrix Header -->
    <div class="grid grid-cols-1 md:grid-cols-2">
        <div class="p-4 bg-rose-50 border-b md:border-b-0 md:border-r border-rose-100 text-center">
           <div class="font-black text-rose-800 text-base uppercase tracking-wide flex items-center justify-center gap-2">
              🚫 根本原因 <span class="opacity-60 text-xs font-normal">(Root Cause)</span>
           </div>
        </div>
        <div class="p-4 bg-emerald-50 text-center">
           <div class="font-black text-emerald-800 text-base uppercase tracking-wide flex items-center justify-center gap-2">
              ✅ 行动建议 <span class="opacity-60 text-xs font-normal">(Action Plan)</span>
           </div>
        </div>
    </div>

    <!-- Row 1: Title Analysis -->
    <div class="border-t border-slate-200">
        <div class="bg-sky-100 px-5 py-3 border-b border-sky-200">
            <span class="text-base font-extrabold text-sky-900 tracking-wide">1. 标题描述 (Title)</span>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2">
            <!-- Left: Problem Analysis -->
            <div class="p-6 text-sm text-slate-700 leading-7 border-b md:border-b-0 md:border-r border-slate-200 bg-white hover:bg-slate-50/30 transition-colors">
               <h4 class="font-bold text-slate-900 mb-3">问题分析：</h4>
               <ul class="list-none space-y-3">
                  <li>[1. 具体描述...]</li>
                  <li>[2. 具体描述...]</li>
                  <li>[3. 具体描述...]</li>
               </ul>
            </div>
            <!-- Right: Suggestion & Logic -->
            <div class="p-6 text-sm text-slate-900 leading-7 bg-emerald-50/10 hover:bg-emerald-50/20 transition-colors flex flex-col gap-6">
               
               <div>
                  <h4 class="font-bold text-emerald-800 text-sm mb-1">优化逻辑：</h4>
                  <p class="text-sm text-emerald-700/90 leading-relaxed">
                     [解释优化思路，例如：前置了xx参数，明确了xx定义，移除了xx冗余词...]
                  </p>
               </div>

               <div>
                 <h4 class="font-bold text-slate-900 mb-3">优化建议：</h4>
                 <div class="p-4 bg-white border border-emerald-100 rounded-lg text-slate-800 shadow-sm font-medium">
                    [在此处提供优化后的完整标题]
                 </div>
               </div>
            </div>
        </div>
    </div>

    <!-- Row 2: Bullet Points Analysis -->
    <div class="border-t border-slate-200">
        <div class="bg-violet-100 px-5 py-3 border-b border-violet-200">
            <span class="text-base font-extrabold text-violet-900 tracking-wide">2. 五点描述 (Bullet Points)</span>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2">
             <!-- Left: Problem Analysis -->
            <div class="p-6 text-sm text-slate-700 leading-7 border-b md:border-b-0 md:border-r border-slate-200 bg-white hover:bg-slate-50/30 transition-colors">
               <h4 class="font-bold text-slate-900 mb-3">问题分析：</h4>
               <ul class="list-none space-y-3">
                  <li>[1. 具体描述...]</li>
                  <li>[2. 具体描述...]</li>
                  <li>[3. 具体描述...]</li>
               </ul>
            </div>
             <!-- Right: Suggestion & Logic -->
            <div class="p-6 text-sm text-slate-900 leading-7 bg-emerald-50/10 hover:bg-emerald-50/20 transition-colors flex flex-col gap-6">
               
               <div>
                  <h4 class="font-bold text-emerald-800 text-sm mb-1">优化逻辑：</h4>
                  <p class="text-sm text-emerald-700/90 leading-relaxed">
                     [解释优化思路，例如：将兼容性说明移至第一点，强调了材质耐用性...]
                  </p>
               </div>

               <div>
                 <h4 class="font-bold text-slate-900 mb-3">优化建议：</h4>
                 <div class="p-4 bg-white border border-emerald-100 rounded-lg text-slate-800 shadow-sm space-y-2">
                    <p>• (第X点) [优化后的五点内容]</p>
                    <p>• (第Y点) [优化后的五点内容]</p>
                 </div>
               </div>
            </div>
        </div>
    </div>

  </div>

</div>`;

      const prompt = `你是一个亚马逊电商数据分析专家。请根据以下提供的【产品页面信息】（Listing）和【用户反馈】（Evidence），进行结构化归因诊断。

**产品页面信息**:
- ASIN: ${asin}
- 标题: ${listingContext.title}
- 五点描述 (Bullet Points):
${listingContext.features}
- 产品描述:
${listingContext.description}

**用户反馈数据**:
- 主要退货原因: ${targetReason.name} (占比 ${formatPercent(targetReason.pct)})
- 核心反馈声音:
${entity.evidenceText || "暂无详细反馈"}

**关键任务**:
1.  **Context-Aware Analysis**: 请仔细对比“产品页面宣传”与“用户实际反馈”，找出不一致之处或误导性描述。
2.  **Compliance & Constraints**: 你的【行动建议】必须严格受亚马逊平台规则约束。
    - 标题优化：严禁堆砌关键词，严禁包含促销语（如 Free shipping, 100% Guarantee 等），确保可读性。
    - 五点/描述优化：严禁夸大产品功能，必须基于产品真实属性；严禁使用亚马逊禁止的词汇。**重要：在“优化建议”中，仅列出需要修改的那些点（并请注明是第几点），如果某一点无需修改，请不要列出。**
    - 确保所有建议都是合规且可执行的，旨在降低退货率的同时保障账号安全。
3.  **Output**: 请完全按照下方的 HTML 模板格式输出分析结果。

**输出格式要求 (HTML)**:
请严格遵守以下 HTML 结构，不要包裹 Markdown 代码块符号。请务必使用中文输出分析内容。
${htmlTemplate}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: prompt,
      });

      const text = response.text || "AI 暂时无法生成分析，请稍后再试。";
      let cleanHtml = text.replace(/```html|```/g, '').trim();
      
      onInsightUpdate(asin, cleanHtml);
    } catch (error) {
      console.error("AI Generation Error", error);
      onInsightUpdate(asin, "<p class='text-rose-600'>分析生成失败，请检查网络或 API 配置。</p>");
    } finally {
      setAnalyzingAsins(prev => ({ ...prev, [asin]: false }));
    }
  };

  return (
    <>
        {/* Report Header */}
        <div className={`relative mb-8 rounded-2xl p-[1px] shadow-2xl ${
            isPurchase 
            ? 'bg-gradient-to-r from-sky-500 via-blue-500 to-indigo-500 shadow-sky-200/50' 
            : 'bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 shadow-indigo-200/50'
        }`}>
            <div className="bg-white rounded-[calc(1rem-1px)] p-8 relative overflow-hidden">
                <div className={`absolute top-0 right-0 w-64 h-64 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none opacity-60 ${
                    isPurchase ? 'bg-sky-50' : 'bg-indigo-50'
                }`}></div>
                <div className={`absolute bottom-0 left-0 w-48 h-48 rounded-full blur-2xl translate-y-1/3 -translate-x-1/3 pointer-events-none opacity-60 ${
                    isPurchase ? 'bg-blue-50' : 'bg-purple-50'
                }`}></div>

                <div className="relative z-10">
                    <div className="flex flex-col md:flex-row justify-between items-start gap-8">
                        
                        {/* Left Identity Section */}
                        <div className="flex-1">
                            <div className="flex items-center gap-3 mb-3">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold text-white shadow-sm ${
                                    isPurchase ? 'bg-gradient-to-r from-sky-500 to-blue-600' : 'bg-gradient-to-r from-indigo-500 to-indigo-600'
                                }`}>
                                    <HeaderIcon className="w-3 h-3 mr-1.5" />
                                    {reportTitle}
                                </span>
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
                                    <MapPin className="w-3 h-3 mr-1" />
                                    {narrative.country} 站
                                </span>
                            </div>
                            
                            <h1 className="text-4xl font-black text-slate-900 tracking-tight mb-2">
                                {narrative.fasin}
                            </h1>
                            <p className="text-slate-500 text-sm font-medium flex items-center gap-2">
                                <span className="uppercase tracking-wider text-xs font-bold text-slate-400">Parent ASIN</span>
                                <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                                <span className="text-slate-500">{reportSubtitle}</span>
                            </p>

                            {/* NEW: Purchase Mode Attribution Info */}
                            {isPurchase && (
                                <div className="mt-6 flex items-center gap-4 bg-blue-50 border border-blue-100 rounded-2xl p-4 shadow-sm max-w-md animate-in fade-in slide-in-from-bottom-2">
                                    <div className="bg-blue-100 p-3 rounded-xl text-blue-600 shrink-0 shadow-inner">
                                        <HelpCircle className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-blue-900 mb-0.5">数据基于“下单日期”归因</p>
                                        <p className="text-xs text-blue-700/80 font-medium">Return Window: 30 Days Lag</p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Right Time Info */}
                        <div className="w-full md:w-auto flex flex-col items-end gap-4">
                            <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 min-w-[200px] flex items-center gap-4 hover:border-indigo-200 transition-colors group self-stretch md:self-auto">
                                <div className={`w-10 h-10 rounded-lg bg-white border border-slate-200 flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform ${
                                    isPurchase ? 'text-sky-500' : 'text-indigo-500'
                                }`}>
                                    <Calendar className="w-5 h-5" />
                                </div>
                                <div>
                                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-0.5">统计周期</div>
                                    <div className="text-sm font-bold text-slate-800 font-mono">
                                        {narrative.period.replace(' to ', ' → ')}
                                    </div>
                                </div>
                            </div>

                            {/* NEW: Data Integrity Warning for Recent Data */}
                            {isPurchase && isLagInsufficient && (
                                <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 max-w-[320px] shadow-sm animate-in slide-in-from-right-4 fade-in duration-500">
                                    <div className="flex items-start gap-3">
                                        <div className="bg-amber-100 p-1.5 rounded-full text-amber-600 shrink-0 mt-0.5">
                                            <AlertTriangle className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-amber-800 mb-1">归因数据可能不完整</p>
                                            <p className="text-xs text-amber-700/90 leading-relaxed text-left mb-2">
                                                统计结束日期距今不足 30 天，部分退货数据可能尚未回流，建议仅作参考。
                                            </p>
                                            <p className="text-xs font-semibold text-amber-600 flex items-center gap-1">
                                                <Clock className="w-3 h-3" />
                                                <span>预计还需 {daysToWait} 天数据才能完全沉淀。</span>
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>

        {/* 1. Overall Plate Analysis */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center">
            <Activity className={`w-5 h-5 mr-2 ${isPurchase ? 'text-sky-600' : 'text-indigo-600'}`} />
            1. 父体总览
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <p className="text-sm text-slate-500 mb-1">总销量</p>
              <p className="text-2xl font-bold text-slate-900">{formatNumber(statistics.totalSold)} <span className="text-sm font-normal text-slate-400">件</span></p>
            </div>
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <p className="text-sm text-slate-500 mb-1">总退货量</p>
              <p className="text-2xl font-bold text-slate-900">{formatNumber(statistics.totalReturns)} <span className="text-sm font-normal text-slate-400">件</span></p>
            </div>
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
              <p className="text-sm text-slate-500 mb-1">整体退货率</p>
              <p className={`text-2xl font-bold ${narrative.healthColorClass}`}>{statistics.returnRateFormatted}</p>
              <div className={`absolute right-0 top-0 p-2 rounded-bl-xl ${narrative.healthBgClass}`}>
                 {/* Dynamic Icon Rendering */}
                 {narrative.healthIconName === 'AlertTriangle' ? (
                   <AlertTriangle className={`w-5 h-5 ${narrative.healthColorClass}`} />
                 ) : (
                   <Activity className={`w-5 h-5 ${narrative.healthColorClass}`} />
                 )}
              </div>
            </div>
             <div className={`p-5 rounded-xl border ${narrative.healthBgClass.replace('bg-', 'border-').replace('50', '200')} ${narrative.healthBgClass} flex flex-col justify-center`}>
              <p className={`font-semibold ${narrative.healthColorClass} mb-1`}>状态: {narrative.healthLabel}</p>
              <p className={`text-xs ${narrative.healthColorClass} opacity-90 leading-relaxed`}>
                 {statistics.isHighRisk ? '退货率偏高，需要关注。' : '退货率处于健康范围内。'}
              </p>
            </div>
          </div>

          <div className={`bg-white border-l-4 p-4 rounded-r-lg shadow-sm ${
              isPurchase ? 'border-sky-500' : 'border-indigo-500'
          }`}>
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-1">业务解读</h3>
            <p className="text-slate-600 text-sm leading-relaxed">
              {narrative.strategicOverview}
            </p>
          </div>
        </section>

        {/* 2. Sub-ASIN Structure Analysis */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center">
            <Target className={`w-5 h-5 mr-2 ${isPurchase ? 'text-sky-600' : 'text-indigo-600'}`} />
            2. 锁定问题子体
          </h2>
          
          <div className="space-y-6">
            
            {/* Main Battlefield (Class A) */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="bg-slate-50 px-5 py-3 border-b border-slate-200 flex justify-between items-center">
                <h3 className="font-semibold text-slate-800 flex items-center">
                  <div className="w-2 h-2 rounded-full bg-blue-500 mr-2"></div>
                  主战场款
                </h3>
              </div>
              
              <div className="grid grid-cols-1 lg:grid-cols-12">
                <div className="lg:col-span-5 p-4 border-b lg:border-b-0 lg:border-r border-slate-100">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="text-xs text-slate-500 uppercase bg-slate-50">
                        <tr>
                          <th className="px-2 py-2">ASIN</th>
                          <th className="px-2 py-2 text-right">销量占比</th>
                          <th className="px-2 py-2 text-right">退货占比</th>
                          <th className="px-2 py-2 text-right">退货率</th>
                        </tr>
                      </thead>
                      <tbody>
                        {groups.classA.items.map((item: any) => (
                          <tr key={item.asin} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                            <td className="px-2 py-3 font-medium text-slate-700">{item.asin}</td>
                            <td className="px-2 py-3 text-right text-slate-600">{formatPercent(item.salesShare)}</td>
                            <td className="px-2 py-3 text-right text-slate-600">{formatPercent(item.returnsShare)}</td>
                            <td className={`px-2 py-3 text-right font-semibold ${item.returnRate > 0.1 ? 'text-amber-600' : 'text-green-600'}`}>
                              {formatPercent(item.returnRate)}
                            </td>
                          </tr>
                        ))}
                        {groups.classA.count === 0 && (
                          <tr><td colSpan={4} className="text-center py-4 text-slate-400">未发现主战场款</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="lg:col-span-7 bg-blue-50/20 p-5 flex flex-col justify-center">
                    {groups.classA.count > 0 ? (
                      <>
                        <h4 className="font-bold text-blue-800 mb-3 flex items-center text-base">
                           <TrendingUp className="w-4 h-4 mr-2" />
                           持续监控与优化
                        </h4>
                        <p className="text-sm text-slate-600 leading-relaxed">
                           本期共有 <strong>{groups.classA.count}</strong> 个核心 ASIN，
                           合计贡献 <strong>{formatPercent(groups.classA.totalSalesShare)}</strong> 的销量 和 <strong>{formatPercent(groups.classA.totalReturnsShare)}</strong> 的退货量。
                           {groups.classA.insight}
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-slate-400">暂无数据</p>
                    )}
                </div>
              </div>
            </div>

            {/* Problem Areas (Class B) */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="bg-slate-50 px-5 py-3 border-b border-slate-200 flex justify-between items-center">
                <h3 className="font-semibold text-slate-800 flex items-center">
                  <div className="w-2 h-2 rounded-full bg-rose-500 mr-2"></div>
                  高退货问题款
                </h3>
              </div>
              
              <div className="grid grid-cols-1 lg:grid-cols-12">
                <div className="lg:col-span-5 p-4 border-b lg:border-b-0 lg:border-r border-slate-100">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="text-xs text-slate-500 uppercase bg-slate-50">
                        <tr>
                          <th className="px-2 py-2">ASIN</th>
                          <th className="px-2 py-2 text-right">销量占比</th>
                          <th className="px-2 py-2 text-right">退货占比</th>
                          <th className="px-2 py-2 text-right">退货率</th>
                        </tr>
                      </thead>
                      <tbody>
                        {groups.classB.items.map((item: any) => (
                          <tr key={item.asin} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                            <td className="px-2 py-3 font-medium text-slate-700">{item.asin}</td>
                            <td className="px-2 py-3 text-right text-slate-600">{formatPercent(item.salesShare)}</td>
                            <td className="px-2 py-3 text-right text-slate-600">{formatPercent(item.returnsShare)}</td>
                            <td className="px-2 py-3 text-right font-bold text-rose-600">
                              {formatPercent(item.returnRate)}
                            </td>
                          </tr>
                        ))}
                        {groups.classB.count === 0 && (
                          <tr><td colSpan={4} className="text-center py-4 text-slate-400">未发现显著问题款</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="lg:col-span-7 bg-rose-50/20 p-5 flex flex-col justify-center">
                     {groups.classB.count > 0 ? (
                      <>
                        <h4 className="font-bold text-rose-800 mb-3 flex items-center text-base">
                           <AlertTriangle className="w-4 h-4 mr-2" />
                           短期重点优化
                        </h4>
                        <p className="text-sm text-slate-600 leading-relaxed">
                           本期共有 <strong>{groups.classB.count}</strong> 个高退货问题 ASIN，合计销量占比 <strong>{formatPercent(groups.classB.totalSalesShare)}</strong>、退货量占比 <strong>{formatPercent(groups.classB.totalReturnsShare)}</strong>，其平均退货率为 <strong>{formatPercent(groups.classB.avgReturnRate)}</strong>，显著高于父体退货率 <strong>{statistics.returnRateFormatted}</strong>。
                           {groups.classB.insight}
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-slate-400">暂无数据</p>
                    )}
                </div>
              </div>
            </div>

            {/* Watchlist */}
            {groups.watchlist.count > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="bg-slate-50 px-5 py-3 border-b border-slate-200 flex justify-between items-center">
                  <h3 className="font-semibold text-slate-800 flex items-center">
                    <div className="w-2 h-2 rounded-full bg-amber-500 mr-2"></div>
                    高退货观察对象
                  </h3>
                </div>
                
                <div className="grid grid-cols-1 lg:grid-cols-12">
                  <div className="lg:col-span-5 p-4 border-b lg:border-b-0 lg:border-r border-slate-100">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead className="text-xs text-slate-500 uppercase bg-slate-50">
                          <tr>
                            <th className="px-2 py-2">ASIN</th>
                            <th className="px-2 py-2 text-right">销量占比</th>
                            <th className="px-2 py-2 text-right">退货占比</th>
                            <th className="px-2 py-2 text-right">退货率</th>
                          </tr>
                        </thead>
                        <tbody>
                          {groups.watchlist.items.map((item: any) => (
                            <tr key={item.asin} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                              <td className="px-2 py-3 font-medium text-slate-700">{item.asin}</td>
                              <td className="px-2 py-3 text-right text-slate-600">{formatPercent(item.salesShare)}</td>
                              <td className="px-2 py-3 text-right text-slate-600">{formatPercent(item.returnsShare)}</td>
                              <td className="px-2 py-3 text-right font-bold text-amber-600">
                                {formatPercent(item.returnRate)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="lg:col-span-7 bg-amber-50/20 p-5 flex flex-col justify-center">
                      <h4 className="font-bold text-amber-800 mb-3 flex items-center text-base">
                          <Eye className="w-4 h-4 mr-2" />
                          短期纳入观察
                      </h4>
                      <p className="text-sm text-slate-600 leading-relaxed">
                         本期共有 <strong>{groups.watchlist.count}</strong> 个高退货小体量 ASIN 被纳入观察名单。
                         {groups.watchlist.insight}
                      </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* 3. Root Cause Deep Dive */}
        <section className="mb-10">
           <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center">
            <AlertTriangle className={`w-5 h-5 mr-2 ${isPurchase ? 'text-sky-600' : 'text-indigo-600'}`} />
            3. 拆解退货原因
          </h2>
          
          <div className={`border rounded-lg p-4 mb-6 flex items-center shadow-sm ${
              isPurchase ? 'bg-sky-50 border-sky-100 text-sky-900' : 'bg-indigo-50 border-indigo-100 text-indigo-900'
          }`}>
             <ZoomIn className={`w-5 h-5 mr-3 flex-shrink-0 ${isPurchase ? 'text-sky-600' : 'text-indigo-600'}`} />
             <p className="font-medium text-sm">
                本板块重点针对 <span className="font-bold">「主战场款」</span> 与 <span className="font-bold">「高退货问题款」</span> ASIN 进行退货归因深度拆解。
             </p>
          </div>

          <div className="space-y-8">
            {entities.map((entity: AnalyzedEntity) => {
              const topReason = entity.topReasons[0];
              const secondReason = entity.topReasons.length > 1 ? entity.topReasons[1] : null;
              // For UI logic, if NO_MATCH is top, we might want to highlight secondary, but analyzer has already sorted.
              // We will display top reason as priority.
              
              const hasEvidence = entity.evidenceText && entity.evidenceText.length > 0;

              return (
                <div key={entity.asin} className="bg-white rounded-xl border border-slate-200 shadow-sm break-inside-avoid overflow-hidden">
                  {/* Card Header */}
                  <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-bold text-slate-800">{entity.asin}</span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium border ${
                        entity.problemClass === 'A' 
                          ? 'bg-blue-50 text-blue-700 border-blue-200' 
                          : 'bg-rose-50 text-rose-700 border-rose-200'
                      }`}>
                        {entity.problemClassLabel}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col md:flex-row">
                    
                    {/* Left Column: Quantitative Data */}
                    <div className="md:w-[35%] bg-slate-50 p-6 border-b md:border-b-0 md:border-r border-slate-200 flex flex-col gap-6">
                      
                      {/* Key Metrics Grid */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                          <p className="text-xs text-slate-500 mb-1">退货量</p>
                          <p className="font-bold text-slate-800 text-lg">{formatNumber(entity.unitsReturned)}</p>
                        </div>
                         <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                           <p className="text-xs text-slate-500 mb-1">反馈样本</p>
                           <p className="font-bold text-slate-800 text-lg">{entity.totalEvents} <span className="text-xs font-normal text-slate-400">条</span></p>
                        </div>
                        <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                           <p className="text-xs text-slate-500 mb-1">留言率</p>
                           <p className="font-bold text-slate-800 text-lg">{formatPercent(entity.textCoverage)}</p>
                        </div>
                        <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                           <p className="text-xs text-slate-500 mb-1">置信度</p>
                           <div className="flex items-center mt-1">
                              <span className={`w-2.5 h-2.5 rounded-full mr-2 ${
                                entity.confidenceLevel === 'high' ? 'bg-green-500' : 
                                entity.confidenceLevel === 'medium' ? 'bg-amber-500' : 'bg-slate-300'
                              }`}></span>
                              <span className="font-medium text-slate-700 text-sm">
                                {entity.confidenceLabel}
                              </span>
                           </div>
                        </div>
                      </div>

                      {/* Chart Area */}
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-3">
                           <BarChart3 className="w-4 h-4 text-slate-400" />
                           <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide">主要驱动因素</h4>
                        </div>
                        <div className="space-y-3">
                          {entity.topReasons.slice(0, 5).map((tag: any) => (
                            <div key={tag.code}>
                              <div className="flex justify-between items-center text-xs mb-3">
                                <span className={`font-medium truncate pr-2 py-0.5 leading-5 ${tag.isPrimary ? 'text-slate-800' : 'text-slate-500'}`}>
                                  {tag.name}
                                </span>
                                <span className="text-slate-500 whitespace-nowrap">
                                  {formatPercent(tag.pct)} ({tag.count}条)
                                </span>
                              </div>
                              <div className="w-full bg-slate-200 rounded-full h-1.5">
                                <div 
                                  className={`h-1.5 rounded-full ${tag.isPrimary ? 'bg-indigo-600' : 'bg-slate-400'}`} 
                                  style={{ width: `${(tag.count / (entity.totalEvents || 1)) * 100}%` }}
                                ></div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Right Column: Qualitative Insights */}
                    <div className="md:w-[65%] p-6 bg-white flex flex-col justify-center">
                        
                        {/* Analysis Conclusion */}
                        <div className="mb-6">
                           <h4 className={`text-sm font-bold text-slate-800 mb-3 flex items-center gap-2 ${
                               isPurchase ? 'text-sky-700' : 'text-indigo-700'
                           }`}>
                             <Target className="w-4 h-4" />
                             分析结论
                           </h4>
                           <div className="text-slate-700 text-sm leading-relaxed mb-4">
                            {(() => {
                              if (!topReason) return "暂无足够数据归因。";
                              
                              if (topReason.code === 'NO_MATCH' || topReason.name === '无合适标签') {
                                  if (secondReason) {
                                      return (
                                          <>
                                              虽然占比最高的反馈为 <strong>“{topReason.name}”</strong> {formatPercent(topReason.pct)}，
                                              但从具体归因来看，<strong>“{secondReason.name}”</strong> 是目前最明确的优化方向，
                                              其占总反馈的 <strong>{formatPercent(secondReason.pct)}</strong>。
                                          </>
                                      );
                                  } else {
                                       return (
                                          <>
                                             当前主要反馈为 <strong>“{topReason.name}”</strong> {formatPercent(topReason.pct)}，
                                             缺乏明确的具体归因，建议进一步深挖留言。
                                          </>
                                      );
                                  }
                              }

                              return (
                                  <>
                                    导致退货的首要原因是 <strong>“{topReason.name}”</strong>，
                                    占分析样本的 <strong>{formatPercent(topReason.pct)}</strong>。
                                    {secondReason && (
                                      <span className="text-slate-500 ml-1">
                                        次要原因为“{secondReason.name}” {formatPercent(secondReason.pct)}。
                                      </span>
                                    )}
                                  </>
                              );
                            })()}
                           </div>
                        </div>

                        {/* Detailed Evidence Block */}
                        {hasEvidence && (
                           <div className="relative mt-2">
                             <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                               <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
                               用户原声透视
                             </h4>
                             <blockquote className="relative p-4 text-sm italic bg-amber-50/50 border-l-4 border-amber-400 text-slate-700 rounded-r-lg">
                                <span className="absolute top-2 left-2 text-amber-200 text-4xl leading-none font-serif opacity-50">“</span>
                                <p className="relative z-10 pl-2 whitespace-pre-line">
                                  {entity.evidenceText}
                                </p>
                             </blockquote>
                           </div>
                        )}
                        
                        {!hasEvidence && (
                          <div className="flex items-center text-slate-400 text-sm bg-slate-50 p-3 rounded">
                             <HelpCircle className="w-4 h-4 mr-2" />
                             暂无足够的留言生成深度解读。
                          </div>
                        )}
                    </div>

                  </div>

                  {/* Bottom Full Width AI Section */}
                  {hasEvidence && topReason && (
                    <div className="border-t border-slate-200 bg-slate-50/50 p-6 transition-colors hover:bg-slate-50">
                        {aiInsights[entity.asin] ? (
                            <div className="w-full animate-in fade-in slide-in-from-top-4">
                                <div className="flex items-center gap-2 mb-4">
                                    <div className={`p-1.5 rounded-lg shadow-sm ${isPurchase ? 'bg-sky-600' : 'bg-indigo-600'}`}>
                                        <Bot className="w-4 h-4 text-white" />
                                    </div>
                                    <h5 className="font-bold text-slate-800 text-lg">AI 智能归因诊断</h5>
                                </div>
                                <div 
                                    className="prose prose-slate max-w-none"
                                    dangerouslySetInnerHTML={{ __html: aiInsights[entity.asin] }}
                                />
                            </div>
                        ) : (
                            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                                <div className="flex items-center gap-3">
                                    <div className={`w-10 h-10 rounded-full bg-white border flex items-center justify-center shadow-sm ${
                                        isPurchase ? 'border-sky-100 text-sky-600' : 'border-indigo-100 text-indigo-600'
                                    }`}>
                                        <Sparkles className="w-5 h-5" />
                                    </div>
                                    <div className="text-left">
                                        <h4 className="font-bold text-slate-800 text-sm">AI 深度归因诊断</h4>
                                        <p className="text-xs text-slate-500 mt-0.5">调用 Gemini 3.0 Pro 深度对比页面描述与用户反馈，生成归因矩阵与优化建议。</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => handleGenerateInsight(entity)}
                                    disabled={analyzingAsins[entity.asin]}
                                    className={`flex items-center gap-2 px-6 py-2.5 text-white border border-transparent rounded-lg transition-all text-sm font-bold shadow-sm disabled:opacity-70 disabled:cursor-wait group whitespace-nowrap ${
                                        isPurchase 
                                        ? 'bg-sky-600 hover:bg-sky-700 hover:shadow-sky-200' 
                                        : 'bg-indigo-600 hover:bg-indigo-700 hover:shadow-indigo-200'
                                    }`}
                                >
                                    {analyzingAsins[entity.asin] ? (
                                        <>
                                            <Activity className="w-4 h-4 animate-spin" />
                                            <span>正在诊断...</span>
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles className="w-4 h-4" />
                                            <span>开始诊断</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        )}
                    </div>
                  )}
                </div>
              );
            })}
             {entities.length === 0 && (
                <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                  <p className="text-slate-500">暂无针对所选问题款的详细分析数据。</p>
                </div>
              )}
          </div>
        </section>

        {/* Footer */}
        <div className="mt-12 pt-6 border-t border-slate-200 text-center">
          <p className="text-xs text-slate-400">报告生成：Returns Insight Pro • {new Date().toLocaleDateString('zh-CN')}</p>
        </div>
    </>
  );
};