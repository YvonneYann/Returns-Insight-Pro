
import React, { useRef, useState, useMemo, useEffect } from 'react';
import { 
  Download, 
  ArrowLeft, 
  Activity, 
  AlertTriangle, 
  Target, 
  Eye, 
  CheckCircle2, 
  TrendingUp, 
  Lightbulb, 
  MessageSquare, 
  BarChart3, 
  HelpCircle, 
  ZoomIn, 
  Camera, 
  Sparkles, 
  Bot, 
  RefreshCcw, 
  TrendingDown, 
  ArrowRight, 
  ArrowDown,
  Minus,
  X,
  History,
  Clock,
  Calendar,
  MapPin,
  Info
} from 'lucide-react';
import { AppData, ComparisonData, ReportMode } from '../types';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { GoogleGenAI } from "@google/genai";

interface DashboardProps {
  data: AppData | ComparisonData;
  mode: ReportMode;
  onReset: () => void;
}

// --- Helpers ---

// Safe data access utilities to prevent runtime crashes
const getSafeArray = (obj: any, key: string): any[] => {
  if (!obj) return [];
  const val = obj[key];
  return Array.isArray(val) ? val : [];
};

const getSafeObject = (obj: any, key: string, defaultVal: any = {}) => {
  if (!obj || !obj[key]) return defaultVal;
  return obj[key];
};

// Clean raw review text by removing common Amazon return reason prefixes
const cleanReviewText = (text: string): string => {
  return text.replace(/^(UNWANTED_ITEM|ORDERED_WRONG_ITEM)[：: -]\s*/i, '').trim();
};

const formatPercent = (val: number | undefined | null) => `${((val || 0) * 100).toFixed(1)}%`;
const formatNumber = (val: number | undefined | null) => new Intl.NumberFormat('en-US').format(val || 0);

// --- Sub-Component: StatusView (Original Logic) ---
const StatusView: React.FC<{ data: AppData }> = ({ data }) => {
  const [aiInsights, setAiInsights] = useState<Record<string, string>>({});
  const [analyzingAsins, setAnalyzingAsins] = useState<Record<string, boolean>>({});

  const summary = getSafeObject(data.summary, 'parent_summary', { 
    return_rate: 0, units_sold: 0, units_returned: 0, fasin: 'Unknown', country: 'Unknown', start_date: '-', end_date: '-' 
  });
  const structure = getSafeArray(data.structure, 'asin_structure');
  
  // Merge explanations into reasons
  const reasons = useMemo(() => {
    const rawReasons = getSafeArray(data.reasons, 'problem_asin_reasons');
    const evidenceList = getSafeArray(data.explanations, 'evidence');
    const reasonExpList = getSafeArray(data.explanations, 'reason_explanations');
    const explanations = [...evidenceList, ...reasonExpList];
    
    return rawReasons.map((r: any) => ({
      ...r,
      core_reasons: (r.core_reasons || []).map((tag: any) => {
        // Find all matching explanations/reviews for this ASIN and tag
        const matches = explanations.filter((e: any) => e.asin === r.asin && e.tag_code === tag.tag_code);
        
        let detailedText = undefined;
        
        // 1. Priority: Check for explicit pre-written "explanation" field
        const explicitSummaries = matches
            .map((e: any) => e.explanation)
            .filter((t): t is string => typeof t === 'string' && t.trim().length > 0);
            
        if (explicitSummaries.length > 0) {
             detailedText = Array.from(new Set(explicitSummaries)).join('；');
        } else {
             // 2. Fallback: Aggregate evidence, sort by length, take top 5
             const rawEvidence = matches
                .map((e: any) => e.evidence) 
                .filter((t): t is string => typeof t === 'string' && t.trim().length > 0);
             
             if (rawEvidence.length > 0) {
                 const cleaned: string[] = rawEvidence.map(cleanReviewText).filter((t: string) => t.length > 1);
                 const unique: string[] = Array.from(new Set(cleaned));
                 unique.sort((a: string, b: string) => b.length - a.length);
                 const top5 = unique.slice(0, 5);
                 
                 if (top5.length > 0) {
                    detailedText = top5.map((t, i) => `${i + 1}. ${t}`).join('\n');
                 }
             }
        }
        
        return {
          ...tag,
          detailed_explanation: detailedText
        };
      })
    }));
  }, [data]);

  const mainBattlefield = structure.filter((item: any) => item.problem_class === 'A');
  const problemItems = structure.filter((item: any) => item.problem_class === 'B');
  const watchList = structure.filter((item: any) => item.high_return_watchlist && item.problem_class !== 'B'); 
  
  mainBattlefield.sort((a: any, b: any) => b.sales_share - a.sales_share);
  problemItems.sort((a: any, b: any) => b.sales_share - a.sales_share);
  watchList.sort((a: any, b: any) => b.return_rate - a.return_rate);

  const returnRate = summary.return_rate;
  let healthStatus = { 
    label: '健康', 
    color: 'text-emerald-600', 
    bg: 'bg-emerald-50', 
    icon: CheckCircle2, 
    text: '退货率处于健康范围内。' 
  };

  if (returnRate >= 0.10) {
    healthStatus = { 
      label: '预警', 
      color: 'text-amber-600', 
      bg: 'bg-amber-50', 
      icon: AlertTriangle, 
      text: '退货率偏高，需要关注。' 
    };
  }

  // Class A Stats
  const mbTotalSalesShare = mainBattlefield.reduce((sum: number, item: any) => sum + (item.sales_share || 0), 0);
  const mbTotalReturnsShare = mainBattlefield.reduce((sum: number, item: any) => sum + (item.returns_share || 0), 0);
  
  // Class B Stats
  const pbTotalSalesShare = problemItems.reduce((sum: number, item: any) => sum + (item.sales_share || 0), 0);
  const pbTotalReturnsShare = problemItems.reduce((sum: number, item: any) => sum + (item.returns_share || 0), 0);
  const pbTotalUnitsSold = problemItems.reduce((sum: number, item: any) => sum + (item.units_sold || 0), 0);
  const pbTotalUnitsReturned = problemItems.reduce((sum: number, item: any) => sum + (item.units_returned || 0), 0);
  const pbAvgReturnRate = pbTotalUnitsSold > 0 ? pbTotalUnitsReturned / pbTotalUnitsSold : 0;

  // Watchlist Stats
  const wlTotalSalesShare = watchList.reduce((sum: number, item: any) => sum + (item.sales_share || 0), 0);
  const wlTotalReturnsShare = watchList.reduce((sum: number, item: any) => sum + (item.returns_share || 0), 0);

  const confidenceMap: Record<string, string> = {
    high: '高',
    medium: '中',
    low: '低'
  };

  // --- AI Analysis Logic ---
  const handleGenerateInsight = async (asin: string, reasonName: string, percentage: string, evidence: string) => {
    setAnalyzingAsins(prev => ({ ...prev, [asin]: true }));
    
    // Safely access listing
    const listingArray = getSafeArray(data.listing, 'problem_asin_listing');
    const listingItem = listingArray.find((l: any) => l.asin === asin);
    
    if (!listingItem) {
      setAiInsights(prev => ({ 
        ...prev, 
        [asin]: `
          <div class="p-4 bg-slate-50 border border-slate-200 rounded-xl text-center">
            <div p class="text-sm text-slate-400">ASIN 页面详情数据缺失，AI 无法对比“页面描述”与“用户反馈”的差异。请补充数据后重试。</p>
          </div>
        `
      }));
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

      let productInfo: any = {};
      try {
          productInfo = JSON.parse(listingItem.payload);
      } catch (e) {
          console.error("Failed to parse listing payload", e);
      }
      
      const title = productInfo.title || "未知标题";
      const features = Array.isArray(productInfo.features) ? productInfo.features.join('\n') : (productInfo.features || "无五点描述");
      const description = productInfo.description || productInfo.description?.map((d:any) => d.value).join('\n') || "无产品描述";

      const prompt = `你是一个亚马逊电商数据分析专家。请根据以下提供的【产品页面信息】（Listing）和【用户反馈】（Evidence），进行结构化归因诊断。

**产品页面信息**:
- ASIN: ${asin}
- 标题: ${title}
- 五点描述 (Bullet Points):
${features}
- 产品描述:
${description}

**用户反馈数据**:
- 主要退货原因: ${reasonName} (占比 ${percentage})
- 核心反馈声音:
${evidence}

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
      
      setAiInsights(prev => ({ ...prev, [asin]: cleanHtml }));
    } catch (error) {
      console.error("AI Generation Error", error);
      setAiInsights(prev => ({ ...prev, [asin]: "<p class='text-rose-600'>分析生成失败，请检查网络或 API 配置。</p>" }));
    } finally {
      setAnalyzingAsins(prev => ({ ...prev, [asin]: false }));
    }
  };

  return (
    <>
        {/* Report Header - Modernized (Updated to match CycleView style) */}
        <div className="relative mb-8 rounded-2xl p-[1px] bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 shadow-2xl shadow-indigo-200/50">
            <div className="bg-white rounded-[calc(1rem-1px)] p-8 relative overflow-hidden">
                {/* Background Decoration */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-50 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none opacity-60"></div>
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-purple-50 rounded-full blur-2xl translate-y-1/3 -translate-x-1/3 pointer-events-none opacity-60"></div>

                <div className="relative z-10">
                    <div className="flex flex-col md:flex-row justify-between items-start gap-8">
                        
                        {/* Left Identity Section */}
                        <div className="flex-1">
                            <div className="flex items-center gap-3 mb-3">
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-gradient-to-r from-indigo-500 to-indigo-600 text-white shadow-sm">
                                    <BarChart3 className="w-3 h-3 mr-1.5" />
                                    退货现状分析报告
                                </span>
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
                                    <MapPin className="w-3 h-3 mr-1" />
                                    {summary.country} 站
                                </span>
                            </div>
                            
                            <h1 className="text-4xl font-black text-slate-900 tracking-tight mb-2">
                                {summary.fasin}
                            </h1>
                            <p className="text-slate-500 text-sm font-medium flex items-center gap-2">
                                <span className="uppercase tracking-wider text-xs font-bold text-slate-400">Parent ASIN</span>
                                <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                                <span className="text-slate-500">现状分析模式 (Status Analysis)</span>
                            </p>
                        </div>

                        {/* Right Time Info */}
                        <div className="w-full md:w-auto">
                            <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 min-w-[200px] flex items-center gap-4 hover:border-indigo-200 transition-colors group">
                                <div className="w-10 h-10 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-indigo-500 shadow-sm group-hover:scale-105 transition-transform">
                                    <Calendar className="w-5 h-5" />
                                </div>
                                <div>
                                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-0.5">统计周期</div>
                                    <div className="text-sm font-bold text-slate-800 font-mono">
                                        {summary.start_date} <span className="text-slate-300 mx-1">→</span> {summary.end_date}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        {/* 1. Overall Plate Analysis */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center">
            <Activity className="w-5 h-5 mr-2 text-indigo-600" />
            1. 父体总览
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <p className="text-sm text-slate-500 mb-1">总销量</p>
              <p className="text-2xl font-bold text-slate-900">{formatNumber(summary.units_sold)} <span className="text-sm font-normal text-slate-400">件</span></p>
            </div>
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <p className="text-sm text-slate-500 mb-1">总退货量</p>
              <p className="text-2xl font-bold text-slate-900">{formatNumber(summary.units_returned)} <span className="text-sm font-normal text-slate-400">件</span></p>
            </div>
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
              <p className="text-sm text-slate-500 mb-1">整体退货率</p>
              <p className={`text-2xl font-bold ${healthStatus.color}`}>{formatPercent(summary.return_rate)}</p>
              <div className={`absolute right-0 top-0 p-2 rounded-bl-xl ${healthStatus.bg}`}>
                <healthStatus.icon className={`w-5 h-5 ${healthStatus.color}`} />
              </div>
            </div>
             <div className={`p-5 rounded-xl border ${healthStatus.bg.replace('bg-', 'border-').replace('50', '200')} ${healthStatus.bg} flex flex-col justify-center`}>
              <p className={`font-semibold ${healthStatus.color} mb-1`}>状态: {healthStatus.label}</p>
              <p className={`text-xs ${healthStatus.color} opacity-90 leading-relaxed`}>{healthStatus.text}</p>
            </div>
          </div>

          <div className="bg-white border-l-4 border-indigo-500 p-4 rounded-r-lg shadow-sm">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-1">业务解读</h3>
            <p className="text-slate-600 text-sm leading-relaxed">
              {summary.return_rate >= 0.1 ? (
                <>
                  本期父体整体退货率为 <strong>{formatPercent(summary.return_rate)}</strong>，高于警戒线 <strong>10%</strong>，整体处于退货偏高的预警状态。建议结合下方诊断结果，优先治理「高退货问题 ASIN」，控制问题款放量，同时对「主战场 ASIN」做精细优化，并提前处理「高退货观察对象」，逐步压降整体退货率和退货成本。
                </>
              ) : (
                <>
                  本期父体整体退货率为 <strong>{formatPercent(summary.return_rate)}</strong>，低于警戒线 <strong>10%</strong>，整体处于健康可控状态，短期内无明显退货风险。
                </>
              )}
            </p>
          </div>
        </section>

        {/* 2. Sub-ASIN Structure Analysis */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center">
            <Target className="w-5 h-5 mr-2 text-indigo-600" />
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
                        {mainBattlefield.map((item: any) => (
                          <tr key={item.asin} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                            <td className="px-2 py-3 font-medium text-slate-700">{item.asin}</td>
                            <td className="px-2 py-3 text-right text-slate-600">{formatPercent(item.sales_share)}</td>
                            <td className="px-2 py-3 text-right text-slate-600">{formatPercent(item.returns_share)}</td>
                            <td className={`px-2 py-3 text-right font-semibold ${item.return_rate > 0.1 ? 'text-amber-600' : 'text-green-600'}`}>
                              {formatPercent(item.return_rate)}
                            </td>
                          </tr>
                        ))}
                        {mainBattlefield.length === 0 && (
                          <tr><td colSpan={4} className="text-center py-4 text-slate-400">未发现主战场款</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="lg:col-span-7 bg-blue-50/20 p-5 flex flex-col justify-center">
                    {mainBattlefield.length > 0 ? (
                      <>
                        <h4 className="font-bold text-blue-800 mb-3 flex items-center text-base">
                           <TrendingUp className="w-4 h-4 mr-2" />
                           持续监控与优化
                        </h4>
                        <p className="text-sm text-slate-600 leading-relaxed">
                           本期共有 <strong>{mainBattlefield.length}</strong> 个核心 ASIN 构成基本盘，合计贡献 <strong>{formatPercent(mbTotalSalesShare)}</strong> 的销量 和 <strong>{formatPercent(mbTotalReturnsShare)}</strong> 的退货量。这类ASIN不一定退货率偏高，但对整体盘子影响最大，一旦退货率波动会直接拉动整体指标，建议在保障放量的前提下，持续监控其销量与退货变化，并结合差评/退货原因做持续小步优化。
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
                        {problemItems.map((item: any) => (
                          <tr key={item.asin} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                            <td className="px-2 py-3 font-medium text-slate-700">{item.asin}</td>
                            <td className="px-2 py-3 text-right text-slate-600">{formatPercent(item.sales_share)}</td>
                            <td className="px-2 py-3 text-right text-slate-600">{formatPercent(item.returns_share)}</td>
                            <td className="px-2 py-3 text-right font-bold text-rose-600">
                              {formatPercent(item.return_rate)}
                            </td>
                          </tr>
                        ))}
                        {problemItems.length === 0 && (
                          <tr><td colSpan={4} className="text-center py-4 text-slate-400">未发现显著问题款</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="lg:col-span-7 bg-rose-50/20 p-5 flex flex-col justify-center">
                     {problemItems.length > 0 ? (
                      <>
                        <h4 className="font-bold text-rose-800 mb-3 flex items-center text-base">
                           <AlertTriangle className="w-4 h-4 mr-2" />
                           短期重点优化
                        </h4>
                        <p className="text-sm text-slate-600 leading-relaxed">
                           本期共有 <strong>{problemItems.length}</strong> 个高退货问题 ASIN，合计销量占比 <strong>{formatPercent(pbTotalSalesShare)}</strong>、退货量占比 <strong>{formatPercent(pbTotalReturnsShare)}</strong>，其平均退货率为 <strong>{formatPercent(pbAvgReturnRate)}</strong>，显著高于父体退货率 <strong>{formatPercent(summary.return_rate)}</strong>。这类ASIN兼具“退货率高 + 体量有分量”的特征，是短期内优先排查和整改的对象。
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-slate-400">暂无数据</p>
                    )}
                </div>
              </div>
            </div>

            {/* Watchlist (High Return Observation Subjects) */}
            {watchList.length > 0 && (
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
                          {watchList.map((item: any) => (
                            <tr key={item.asin} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                              <td className="px-2 py-3 font-medium text-slate-700">{item.asin}</td>
                              <td className="px-2 py-3 text-right text-slate-600">{formatPercent(item.sales_share)}</td>
                              <td className="px-2 py-3 text-right text-slate-600">{formatPercent(item.returns_share)}</td>
                              <td className="px-2 py-3 text-right font-bold text-amber-600">
                                {formatPercent(item.return_rate)}
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
                         本期共有 <strong>{watchList.length}</strong> 个高退货小体量 ASIN 被纳入观察名单，合计销量占比 <strong>{formatPercent(wlTotalSalesShare)}</strong>、退货量占比 <strong>{formatPercent(wlTotalReturnsShare)}</strong>。这类ASIN退货率已达到高退货警戒线，但当前体量较小，对整体指标影响有限。建议将其纳入重点监控清单，避免上量后从“观察款”演变为高退货问题款。
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
            <AlertTriangle className="w-5 h-5 mr-2 text-indigo-600" />
            3. 拆解退货原因
          </h2>
          
          <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-4 mb-6 flex items-center text-indigo-900 shadow-sm">
             <ZoomIn className="w-5 h-5 mr-3 text-indigo-600 flex-shrink-0" />
             <p className="font-medium text-sm">
                本板块重点针对 <span className="font-bold">「主战场款」</span> 与 <span className="font-bold">「高退货问题款」</span> ASIN 进行退货归因深度拆解。
             </p>
          </div>

          <div className="space-y-8">
            {reasons.map((reasonData: any) => {
              const sortedReasons = [...(reasonData.core_reasons || [])].sort((a: any, b: any) => b.event_count - a.event_count);
              const topReason = sortedReasons[0];
              const secondReason = sortedReasons.length > 1 ? sortedReasons[1] : null;
              const targetReason = (topReason?.tag_code === 'NO_MATCH' && secondReason) ? secondReason : topReason;
              const hasEvidence = targetReason && targetReason.detailed_explanation;

              return (
                <div key={reasonData.asin} className="bg-white rounded-xl border border-slate-200 shadow-sm break-inside-avoid overflow-hidden">
                  {/* Card Header */}
                  <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-bold text-slate-800">{reasonData.asin}</span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium border ${
                        reasonData.problem_class === 'A' 
                          ? 'bg-blue-50 text-blue-700 border-blue-200' 
                          : 'bg-rose-50 text-rose-700 border-rose-200'
                      }`}>
                        {reasonData.problem_class_label_cn || (reasonData.problem_class === 'A' ? '主战场款' : '问题款')}
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
                          <p className="font-bold text-slate-800 text-lg">{formatNumber(reasonData.units_returned)}</p>
                        </div>
                         <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                           <p className="text-xs text-slate-500 mb-1">反馈样本</p>
                           <p className="font-bold text-slate-800 text-lg">{reasonData.total_events} <span className="text-xs font-normal text-slate-400">条</span></p>
                        </div>
                        <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                           <p className="text-xs text-slate-500 mb-1">留言率</p>
                           <p className="font-bold text-slate-800 text-lg">{formatPercent(reasonData.text_coverage)}</p>
                        </div>
                        <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                           <p className="text-xs text-slate-500 mb-1">置信度</p>
                           <div className="flex items-center mt-1">
                              <span className={`w-2.5 h-2.5 rounded-full mr-2 ${
                                reasonData.reason_confidence_level === 'high' ? 'bg-green-500' : 
                                reasonData.reason_confidence_level === 'medium' ? 'bg-amber-500' : 'bg-slate-300'
                              }`}></span>
                              <span className="font-medium text-slate-700 text-sm">
                                {confidenceMap[reasonData.reason_confidence_level] || reasonData.reason_confidence_level}
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
                          {reasonData.core_reasons.slice(0, 5).map((tag: any) => (
                            <div key={tag.tag_code}>
                              <div className="flex justify-between text-xs mb-1">
                                <span className={`font-medium truncate pr-2 ${tag.is_primary ? 'text-slate-800' : 'text-slate-500'}`}>
                                  {tag.tag_name_cn}
                                </span>
                                <span className="text-slate-500 whitespace-nowrap">
                                  {formatPercent(tag.event_coverage)} ({tag.event_count}条)
                                </span>
                              </div>
                              <div className="w-full bg-slate-200 rounded-full h-1.5">
                                <div 
                                  className={`h-1.5 rounded-full ${tag.is_primary ? 'bg-indigo-600' : 'bg-slate-400'}`} 
                                  style={{ width: `${(tag.event_count / (reasonData.total_events || 1)) * 100}%` }}
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
                           <h4 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                             <Target className="w-4 h-4 text-indigo-600" />
                             分析结论
                           </h4>
                           <div className="text-slate-700 text-sm leading-relaxed mb-4">
                            {(() => {
                              if (!sortedReasons.length) return "";
                              
                              if (topReason.tag_code === 'NO_MATCH' || topReason.tag_name_cn === '无合适标签') {
                                  if (secondReason) {
                                      return (
                                          <>
                                              虽然占比最高的反馈为 <strong>“{topReason.tag_name_cn}”</strong>（{formatPercent(topReason.event_coverage)}），
                                              但从具体归因来看，<strong>“{secondReason.tag_name_cn}”</strong> 是目前最明确的优化方向，
                                              其占总反馈的 <strong>{formatPercent(secondReason.event_coverage)}</strong>。
                                          </>
                                      );
                                  } else {
                                       return (
                                          <>
                                             当前主要反馈为 <strong>“{topReason.tag_name_cn}”</strong>（{formatPercent(topReason.event_coverage)}），
                                             缺乏明确的具体归因，建议进一步深挖留言。
                                          </>
                                      );
                                  }
                              }

                              return (
                                  <>
                                    导致退货的首要原因是 <strong>“{topReason.tag_name_cn}”</strong>，
                                    占分析样本的 <strong>{formatPercent(topReason.event_coverage)}</strong>。
                                    {secondReason && (
                                      <span className="text-slate-500 ml-1">
                                        次要原因为“{secondReason.tag_name_cn}”（{formatPercent(secondReason.event_coverage)}）。
                                      </span>
                                    )}
                                  </>
                              );
                            })()}
                           </div>
                        </div>

                        {/* Detailed Evidence Block */}
                        {(() => {
                           if (!hasEvidence || !targetReason) return null;

                           return (
                               <div className="relative mt-2">
                                 <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                                   <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
                                   用户原声透视
                                 </h4>
                                 <blockquote className="relative p-4 text-sm italic bg-amber-50/50 border-l-4 border-amber-400 text-slate-700 rounded-r-lg">
                                    <span className="absolute top-2 left-2 text-amber-200 text-4xl leading-none font-serif opacity-50">“</span>
                                    <p className="relative z-10 pl-2 whitespace-pre-line">
                                      {targetReason.detailed_explanation}
                                    </p>
                                 </blockquote>
                               </div>
                           );
                        })()}
                        
                        {!sortedReasons.length && (
                          <div className="flex items-center text-slate-400 text-sm bg-slate-50 p-3 rounded">
                             <HelpCircle className="w-4 h-4 mr-2" />
                             暂无足够的留言生成深度解读。
                          </div>
                        )}
                    </div>

                  </div>

                  {/* Bottom Full Width AI Section */}
                  {hasEvidence && targetReason && (
                    <div className="border-t border-slate-200 bg-slate-50/50 p-6 transition-colors hover:bg-slate-50">
                        {aiInsights[reasonData.asin] ? (
                            <div className="w-full animate-in fade-in slide-in-from-top-4">
                                <div className="flex items-center gap-2 mb-4">
                                    <div className="bg-indigo-600 p-1.5 rounded-lg shadow-sm">
                                        <Bot className="w-4 h-4 text-white" />
                                    </div>
                                    <h5 className="font-bold text-slate-800 text-lg">AI 智能归因诊断</h5>
                                </div>
                                <div 
                                    className="prose prose-slate max-w-none"
                                    dangerouslySetInnerHTML={{ __html: aiInsights[reasonData.asin] }}
                                />
                            </div>
                        ) : (
                            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-white border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-sm">
                                        <Sparkles className="w-5 h-5" />
                                    </div>
                                    <div className="text-left">
                                        <h4 className="font-bold text-slate-800 text-sm">AI 深度归因诊断</h4>
                                        <p className="text-xs text-slate-500 mt-0.5">调用 Gemini 3.0 Pro 深度对比页面描述与用户反馈，生成归因矩阵与优化建议。</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => handleGenerateInsight(
                                        reasonData.asin,
                                        targetReason.tag_name_cn,
                                        formatPercent(targetReason.event_coverage),
                                        targetReason.detailed_explanation!
                                    )}
                                    disabled={analyzingAsins[reasonData.asin]}
                                    className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white border border-transparent rounded-lg hover:bg-indigo-700 hover:shadow-lg hover:shadow-indigo-200 transition-all text-sm font-bold shadow-sm disabled:opacity-70 disabled:cursor-wait group whitespace-nowrap"
                                >
                                    {analyzingAsins[reasonData.asin] ? (
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
             {reasons.length === 0 && (
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

// --- Sub-Component: AsinContrastCard for CycleView ---
const AsinContrastCard = ({ 
    asin, 
    beforeNode, 
    afterNode, 
    beforeReasons, 
    afterReasons
}: { 
    asin: string, 
    beforeNode?: any, 
    afterNode?: any, 
    beforeReasons?: any, 
    afterReasons?: any
}) => {
    // Metrics
    const bRate = beforeNode?.return_rate || 0;
    const aRate = afterNode?.return_rate || 0;
    const delta = aRate - bRate;
    const isImproved = delta < 0;
    
    // Class Labels Logic - STRICT
    const getAsinLabel = (node: any) => {
        if (!node) return 'N/A';
        // Priority: Problem (B) > Main (A) > Watchlist > Normal
        if (node.problem_class_label_cn) return node.problem_class_label_cn;
        
        if (node.problem_class === 'B') return '高退货问题款';
        if (node.problem_class === 'A') return '主战场款';
        if (node.high_return_watchlist) return '高退货观察对象';
        
        return '普通款';
    };

    const bLabel = getAsinLabel(beforeNode);
    const aLabel = getAsinLabel(afterNode);

    // Style helper for labels
    const getLabelStyle = (label: string) => {
        switch(label) {
            case '主战场款': return 'bg-blue-50 text-blue-700 border-blue-200';
            case '高退货问题款': return 'bg-rose-50 text-rose-700 border-rose-200';
            case '高退货观察对象': return 'bg-amber-50 text-amber-700 border-amber-200';
            case '普通款': return 'bg-slate-50 text-slate-500 border-slate-200';
            default: return 'bg-slate-50 text-slate-600 border-slate-200';
        }
    };

    // Reason Processing
    // Logic: Union of Top 3 Before reasons AND Top 3 After reasons.
    // This allows verifying if old problems are fixed AND detecting if new problems emerged.
    const bAll = beforeReasons?.core_reasons || [];
    const aAll = afterReasons?.core_reasons || [];

    // 1. Top 3 codes from Before (Old problems)
    const top3BeforeCodes = [...bAll]
        .sort((a: any, b: any) => b.event_coverage - a.event_coverage)
        .slice(0, 3)
        .map((r: any) => r.tag_code);

    // 2. Top 3 codes from After (Potential new problems)
    const top3AfterCodes = [...aAll]
        .sort((a: any, b: any) => b.event_coverage - a.event_coverage)
        .slice(0, 3)
        .map((r: any) => r.tag_code);

    // 3. Union set of tag_codes
    const uniqueCodes = Array.from(new Set([...top3BeforeCodes, ...top3AfterCodes]));

    // 4. Construct rows
    const reasonRows = uniqueCodes.map(code => {
        const bTag = bAll.find((r: any) => r.tag_code === code);
        const aTag = aAll.find((r: any) => r.tag_code === code);
        
        return {
            name: aTag?.tag_name_cn || bTag?.tag_name_cn || code,
            beforePct: bTag?.event_coverage || 0,
            afterPct: aTag?.event_coverage || 0
        };
    })
    // 5. Sort by After Percentage Descending to highlight current severity
    .sort((a, b) => b.afterPct - a.afterPct);

    return (
        <div 
          className="rounded-xl border transition-all duration-300 overflow-hidden bg-white border-slate-200 hover:border-indigo-300 hover:shadow-md"
        >
           {/* Header / Status Bar */}
           <div className={`px-5 py-3 border-b flex justify-between items-center gap-4 ${
               isImproved ? 'bg-emerald-50/30 border-emerald-100' : 'bg-rose-50/30 border-rose-100'
           }`}>
               <div className="flex items-center gap-3 overflow-hidden w-full">
                   <span className="font-bold text-slate-800 text-lg flex-shrink-0">{asin}</span>
                   
                   {/* Beautified Labels */}
                   <div className="flex items-center gap-2 whitespace-nowrap overflow-hidden">
                       <span className={`px-2.5 py-0.5 rounded text-[12px] font-bold border ${getLabelStyle(bLabel)}`}>
                           {bLabel}
                       </span>
                       <ArrowRight className="w-3 h-3 text-slate-300 flex-shrink-0" />
                       <span className={`px-2.5 py-0.5 rounded text-[12px] font-bold border ${getLabelStyle(aLabel)}`}>
                           {aLabel}
                       </span>
                   </div>
               </div>
               {/* Delta removed from here */}
           </div>

           {/* Metrics & Reason Table */}
           <div className="p-5 flex flex-col gap-5">
                
                {/* Metrics Column - Horizontal Layout with Center Delta - BEAUTIFIED */}
                <div className="flex items-center justify-between px-2 py-4 bg-gradient-to-b from-slate-50 to-white rounded-xl border border-slate-200 relative shadow-sm">
                     
                     {/* Before */}
                     <div className="flex-1 flex flex-col items-center border-r border-slate-100">
                         <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Before Rate</span>
                         <span className="font-mono text-lg font-medium text-slate-600">{formatPercent(bRate)}</span>
                     </div>

                     {/* Center Delta */}
                     <div className="flex-1 flex flex-col items-center justify-center px-2">
                         <div className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold shadow-sm border ${
                            isImproved 
                            ? 'bg-emerald-50 text-emerald-600 border-emerald-100' 
                            : 'bg-rose-50 text-rose-600 border-rose-100'
                         }`}>
                            {isImproved ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                            {formatPercent(Math.abs(delta))}
                         </div>
                     </div>

                     {/* After */}
                     <div className="flex-1 flex flex-col items-center border-l border-slate-100">
                         <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">After Rate</span>
                         <span className={`font-mono text-lg font-bold ${isImproved ? 'text-emerald-600' : 'text-rose-600'}`}>
                             {formatPercent(aRate)}
                         </span>
                     </div>
                </div>

                {/* Reasons Column - Pushed to bottom */}
                <div>
                    <h4 className="text-sm font-bold text-slate-400 uppercase mb-3 flex items-center">
                        <RefreshCcw className="w-3 h-3 mr-1" />
                        核心原因漂移 (Before & After Top 3)
                    </h4>
                    {reasonRows.length > 0 ? (
                        <div className="space-y-4">
                           {reasonRows.map((row: any, i: number) => {
                               const diff = row.afterPct - row.beforePct;
                               const isGood = diff < 0;
                               
                               // Logic for badges
                               let Badge = null;
                               const THRESHOLD = 0.01; // 1% threshold for existence

                               if (row.beforePct < THRESHOLD && row.afterPct >= THRESHOLD) {
                                   Badge = (
                                       <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200 shrink-0 ml-2">
                                           <AlertTriangle className="w-3 h-3 mr-1" />
                                           新增问题
                                       </span>
                                   );
                               } else if (row.beforePct >= THRESHOLD) {
                                   if (diff <= -0.005) { // Decrease
                                        Badge = (
                                           <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200 shrink-0 ml-2">
                                               <ArrowDown className="w-3 h-3 mr-1" />
                                               有效调整
                                           </span>
                                       );
                                   } else { // Flat or Increase
                                        Badge = (
                                           <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-200 shrink-0 ml-2">
                                               <X className="w-3 h-3 mr-1" />
                                               无效调整
                                           </span>
                                       );
                                   }
                               }

                               return (
                                   <div key={i} className="text-sm">
                                       <div className="flex justify-between items-center mb-2">
                                           <div className="flex items-center min-w-0 flex-1 mr-2">
                                              <span className="text-slate-700 font-bold text-sm truncate" title={row.name}>{row.name}</span>
                                              {Badge}
                                           </div>
                                           <span className={`text-xs font-mono shrink-0 ${isGood ? 'text-emerald-600' : 'text-rose-600'}`}>
                                               {diff > 0 ? '+' : ''}{formatPercent(diff)}
                                           </span>
                                       </div>
                                       {/* Split Bar Chart for direct visual comparison */}
                                       <div className="flex gap-1 h-2">
                                            <div className="flex-1 bg-slate-100 rounded-l overflow-hidden relative" title={`Before: ${formatPercent(row.beforePct)}`}>
                                                <div className="absolute top-0 left-0 h-full bg-slate-400 opacity-60" style={{ width: `${Math.min(row.beforePct * 100 * 2, 100)}%` }}></div>
                                            </div>
                                            <div className="flex-1 bg-slate-100 rounded-r overflow-hidden relative" title={`After: ${formatPercent(row.afterPct)}`}>
                                                <div className="absolute top-0 left-0 h-full bg-indigo-500" style={{ width: `${Math.min(row.afterPct * 100 * 2, 100)}%` }}></div>
                                            </div>
                                       </div>
                                       <div className="flex justify-between text-xs text-slate-400 mt-1 px-0.5">
                                           <span>{formatPercent(row.beforePct)}</span>
                                           <span>{formatPercent(row.afterPct)}</span>
                                       </div>
                                   </div>
                               )
                           })}
                        </div>
                    ) : (
                        <div className="text-xs text-slate-400 italic py-2">暂无显著退货原因数据</div>
                    )}
                </div>
           </div>
        </div>
    );
}

const ArrowDownIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></svg>
)

// --- CycleView Component ---
const CycleView: React.FC<{ data: ComparisonData }> = ({ data }) => {
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
       
       {/* 1. Header Information Section - Refined with Aurora Glow & Compact Dimensions */}
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
                            
                            {/* Prominent Attribution Info - MODIFIED: Increased size as requested */}
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
                            
                            {/* Warning Badge moved here */}
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

       {/* 2. AI Executive Summary (UPDATED: Compact Card) */}
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

    </div>
  );
};

// --- Main Container: Dashboard ---
export const Dashboard: React.FC<DashboardProps> = ({ data, mode, onReset }) => {
  const reportRef = useRef<HTMLDivElement>(null);
  const [exportingStatus, setExportingStatus] = useState<'pdf' | 'image' | null>(null);

  const handleDownload = async () => {
    if (!reportRef.current) return;
    setExportingStatus('pdf');
    // Save current scroll position
    const currentScrollX = window.scrollX;
    const currentScrollY = window.scrollY;

    try {
      // Scroll to top to prevent html2canvas offset issues
      window.scrollTo(0, 0);
      await new Promise(resolve => setTimeout(resolve, 100));

      const canvas = await html2canvas(reportRef.current, {
        scale: 2, 
        useCORS: true,
        logging: false,
        backgroundColor: '#f8fafc',
        scrollX: 0, 
        scrollY: 0,
        // Ensure full height is captured
        windowWidth: document.documentElement.offsetWidth,
        windowHeight: document.documentElement.offsetHeight,
        onclone: (clonedDoc) => {
          // Fix 1: Handle overflow clipping issues
          const elements = clonedDoc.querySelectorAll('.overflow-hidden');
          elements.forEach((el) => {
            (el as HTMLElement).style.overflow = 'visible';
          });

          // Fix 2: Remove animations to ensure static rendering
          const animatedElements = clonedDoc.querySelectorAll('.animate-in');
          animatedElements.forEach((el) => {
             el.classList.remove('animate-in', 'fade-in', 'slide-in-from-top-4', 'slide-in-from-right-8', 'duration-500', 'duration-700');
          });

          // Fix 3: Add Bottom Padding to Text
          // Helps with baseline shift issues in html2canvas where text renders lower than browser
          const textElements = clonedDoc.querySelectorAll('h1, h2, h3, .text-4xl, .text-2xl, .text-xl, .font-bold');
          textElements.forEach((el) => {
              const htmlEl = el as HTMLElement;
              // Add padding bottom to create buffer space for baseline shift
              htmlEl.style.paddingBottom = '10px';
              // Ensure display is block or inline-block so padding takes effect
              const display = window.getComputedStyle(htmlEl).display;
              if (display === 'inline') {
                  htmlEl.style.display = 'inline-block';
              }
          });
        }
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
      const imgWidth = 210;
      const pageHeight = 297;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }
      pdf.save(`退货分析报告_${mode}.pdf`);
    } catch (error) {
      console.error('Export failed', error);
      alert('Failed to generate PDF. Please try again.');
    } finally {
      // Restore scroll position
      window.scrollTo(currentScrollX, currentScrollY);
      setExportingStatus(null);
    }
  };

  const handleScreenshot = async () => {
    if (!reportRef.current) return;
    setExportingStatus('image');
    // Save current scroll position
    const currentScrollX = window.scrollX;
    const currentScrollY = window.scrollY;

    try {
      // Scroll to top to prevent html2canvas offset issues
      window.scrollTo(0, 0);
      await new Promise(resolve => setTimeout(resolve, 100));

      const canvas = await html2canvas(reportRef.current, {
        scale: 2, 
        useCORS: true,
        logging: false,
        backgroundColor: '#f8fafc',
        scrollX: 0,
        scrollY: 0,
        // Ensure full height is captured
        windowWidth: document.documentElement.offsetWidth,
        windowHeight: document.documentElement.offsetHeight,
        onclone: (clonedDoc) => {
          // Fix 1: Handle overflow clipping issues
          const elements = clonedDoc.querySelectorAll('.overflow-hidden');
          elements.forEach((el) => {
            (el as HTMLElement).style.overflow = 'visible';
          });

          // Fix 2: Remove animations to ensure static rendering
          const animatedElements = clonedDoc.querySelectorAll('.animate-in');
          animatedElements.forEach((el) => {
             el.classList.remove('animate-in', 'fade-in', 'slide-in-from-top-4', 'slide-in-from-right-8', 'duration-500', 'duration-700');
          });

          // Fix 3: Add Bottom Padding to Text
          // Helps with baseline shift issues in html2canvas where text renders lower than browser
          const textElements = clonedDoc.querySelectorAll('h1, h2, h3, .text-4xl, .text-2xl, .text-xl, .font-bold');
          textElements.forEach((el) => {
              const htmlEl = el as HTMLElement;
              // Add padding bottom to create buffer space for baseline shift
              htmlEl.style.paddingBottom = '10px';
              // Ensure display is block or inline-block so padding takes effect
              const display = window.getComputedStyle(htmlEl).display;
              if (display === 'inline') {
                  htmlEl.style.display = 'inline-block';
              }
          });
        }
      });
      const imgData = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = imgData;
      link.download = `退货分析长图_${mode}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Screenshot failed', error);
      alert('Failed to generate screenshot.');
    } finally {
      // Restore scroll position
      window.scrollTo(currentScrollX, currentScrollY);
      setExportingStatus(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Navbar */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10 px-6 py-4 flex justify-between items-center shadow-sm print:hidden">
        <div className="flex items-center space-x-4">
          <button 
            onClick={onReset}
            className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors flex items-center gap-2 group"
            title="返回模式选择"
          >
            <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
            <span className="text-sm font-medium">重置</span>
          </button>
          <div className="h-6 w-px bg-slate-200 mx-2"></div>
          <div className="flex items-center gap-2">
             <span className="text-xl font-bold text-slate-800">Returns Insight Pro</span>
             <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wide ${
                mode === 'status' ? 'bg-indigo-100 text-indigo-700' : 'bg-purple-100 text-purple-700'
             }`}>
                {mode === 'status' ? 'Status' : 'Cycle'}
             </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
            <button
              onClick={handleScreenshot}
              disabled={!!exportingStatus}
              className="flex items-center px-4 py-2 bg-white text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors font-medium shadow-sm disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {exportingStatus === 'image' ? (
                <Activity className="w-4 h-4 mr-2 animate-spin text-slate-500" />
              ) : (
                <Camera className="w-4 h-4 mr-2" />
              )}
              {exportingStatus === 'image' ? '生成长图中...' : '长截图'}
            </button>
            <button
              onClick={handleDownload}
              disabled={!!exportingStatus}
              className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium shadow-sm disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {exportingStatus === 'pdf' ? (
                <Activity className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              {exportingStatus === 'pdf' ? '生成 PDF 中...' : '导出报告'}
            </button>
        </div>
      </div>

      {/* Main Content Container */}
      <div className="max-w-5xl mx-auto p-8 print:p-0" ref={reportRef}>
         {mode === 'status' ? <StatusView data={data as AppData} /> : <CycleView data={data as ComparisonData} />}
      </div>
    </div>
  );
}
