import React, { useRef, useState, useMemo } from 'react';
import { 
  Download, 
  ArrowLeft, 
  Activity, 
  AlertTriangle,
  Target,
  Eye,
  CheckCircle2,
  TrendingUp,
  AlertCircle,
  Lightbulb,
  MessageSquare,
  BarChart3,
  HelpCircle,
  ZoomIn
} from 'lucide-react';
import { AppData } from '../types';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

interface DashboardProps {
  data: AppData;
  onReset: () => void;
}

// Helper: Clean raw review text by removing common Amazon return reason prefixes
const cleanReviewText = (text: string) => {
  return text.replace(/^(不需要的物品|订购了错误的商品|不想要的物品|尺寸过大|质量问题|性能或质量不足|Item doesn't fit|Wrong item sent|Defective item|Quality not adequate|Not compatible|Better price available)[：: -]\s*/i, '').trim();
};

export const Dashboard: React.FC<DashboardProps> = ({ data, onReset }) => {
  const reportRef = useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const summary = data.summary!.parent_summary;
  const structure = data.structure!.asin_structure;
  
  // Merge explanations into reasons
  const reasons = useMemo(() => {
    const rawReasons = data.reasons!.problem_asin_reasons;
    const explanations = data.explanations?.evidence || data.explanations?.reason_explanations || [];
    
    return rawReasons.map(r => ({
      ...r,
      core_reasons: r.core_reasons.map(tag => {
        // Find all matching explanations/reviews for this ASIN and tag
        const matches = explanations.filter(e => e.asin === r.asin && e.tag_code === tag.tag_code);
        
        let detailedText = undefined;
        
        // 1. Priority: Check for explicit pre-written "explanation" field
        const explicitSummaries = matches
            .map(e => e.explanation)
            .filter((t): t is string => typeof t === 'string' && t.trim().length > 0);
            
        if (explicitSummaries.length > 0) {
             detailedText = Array.from(new Set(explicitSummaries)).join('；');
        } else {
             // 2. Fallback: Aggregate evidence, sort by length, take top 5
             const rawEvidence = matches
                .map(e => e.evidence) // Strictly use evidence field as requested
                .filter((t): t is string => typeof t === 'string' && t.trim().length > 0);
             
             if (rawEvidence.length > 0) {
                 // Clean prefixes to ensure we are measuring true content length
                 const cleaned = rawEvidence.map(cleanReviewText).filter(t => t.length > 1);
                 // Deduplicate
                 const unique = Array.from(new Set(cleaned));
                 // Sort by length descending (longest first)
                 unique.sort((a, b) => b.length - a.length);
                 // Take top 5
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
  }, [data.reasons, data.explanations]);

  // --- Logic & Data Segmentation ---

  const mainBattlefield = structure.filter(item => item.problem_class === 'A');
  const problemItems = structure.filter(item => item.problem_class === 'B');
  const watchList = structure.filter(item => item.high_return_watchlist && item.problem_class !== 'B'); 
  
  // Sort items
  mainBattlefield.sort((a, b) => b.sales_share - a.sales_share);
  problemItems.sort((a, b) => b.sales_share - a.sales_share);
  watchList.sort((a, b) => b.return_rate - a.return_rate);

  // Health Calculation
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

  // --- Business Insight Helper for Structure Analysis ---
  const formatPercent = (val: number) => `${(val * 100).toFixed(1)}%`;
  const formatNumber = (val: number) => new Intl.NumberFormat('en-US').format(val);

  // Class A Stats
  const mbTotalSalesShare = mainBattlefield.reduce((sum, item) => sum + item.sales_share, 0);
  const mbTotalReturnsShare = mainBattlefield.reduce((sum, item) => sum + item.returns_share, 0);
  
  // Class B Stats
  const pbTotalSalesShare = problemItems.reduce((sum, item) => sum + item.sales_share, 0);
  const pbTotalReturnsShare = problemItems.reduce((sum, item) => sum + item.returns_share, 0);
  const pbTotalUnitsSold = problemItems.reduce((sum, item) => sum + item.units_sold, 0);
  const pbTotalUnitsReturned = problemItems.reduce((sum, item) => sum + item.units_returned, 0);
  const pbAvgReturnRate = pbTotalUnitsSold > 0 ? pbTotalUnitsReturned / pbTotalUnitsSold : 0;

  // Watchlist Stats
  const wlTotalSalesShare = watchList.reduce((sum, item) => sum + item.sales_share, 0);
  const wlTotalReturnsShare = watchList.reduce((sum, item) => sum + item.returns_share, 0);

  // --- PDF Export Logic ---
  const handleDownload = async () => {
    if (!reportRef.current) return;
    setIsDownloading(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const canvas = await html2canvas(reportRef.current, {
        scale: 2, 
        useCORS: true,
        logging: false,
        backgroundColor: '#f8fafc'
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4',
      });

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

      pdf.save(`${summary.fasin}_退货分析报告.pdf`);
    } catch (error) {
      console.error('Export failed', error);
      alert('Failed to generate PDF. Please try again.');
    }
    setIsDownloading(false);
  };

  const confidenceMap: Record<string, string> = {
    high: '高',
    medium: '中',
    low: '低'
  };

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Navbar */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10 px-6 py-4 flex justify-between items-center shadow-sm print:hidden">
        <div className="flex items-center space-x-4">
          <button 
            onClick={onReset}
            className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors"
            title="上传新文件"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-bold text-slate-800">Returns Insight Pro</h1>
        </div>
        <button
          onClick={handleDownload}
          disabled={isDownloading}
          className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium shadow-sm disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {isDownloading ? (
            <Activity className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Download className="w-4 h-4 mr-2" />
          )}
          {isDownloading ? '生成 PDF 中...' : '导出报告'}
        </button>
      </div>

      {/* Main Report Container */}
      <div className="max-w-5xl mx-auto p-8 print:p-0" ref={reportRef}>
        
        {/* Report Header */}
        <div className="bg-white rounded-2xl p-6 mb-8 border border-slate-200 shadow-sm relative overflow-hidden">
          {/* Top accent gradient */}
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 to-purple-600"></div>
          
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="bg-indigo-50 text-indigo-700 text-xs font-bold px-2 py-0.5 rounded uppercase tracking-wider">
                  父体退货分析报告
                </span>
              </div>
              <h1 className="text-3xl font-extrabold text-slate-900 flex items-center gap-2">
                <span className="text-slate-400 font-normal text-xl">父 ASIN:</span>
                {summary.fasin}
              </h1>
            </div>
            
            <div className="flex gap-4">
               <div className="bg-slate-50 px-4 py-2 rounded-lg border border-slate-100">
                 <p className="text-xs text-slate-400 font-bold uppercase mb-0.5">站点</p>
                 <p className="font-bold text-slate-700">{summary.country}</p>
               </div>
               <div className="bg-slate-50 px-4 py-2 rounded-lg border border-slate-100">
                 <p className="text-xs text-slate-400 font-bold uppercase mb-0.5">统计周期</p>
                 <p className="font-bold text-slate-700 text-sm">
                   {summary.start_date} <span className="mx-1 text-slate-400">→</span> {summary.end_date}
                 </p>
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
                        {mainBattlefield.map(item => (
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
                        {problemItems.map(item => (
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
                          {watchList.map(item => (
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
            {reasons.map((reasonData) => {
              const sortedReasons = [...reasonData.core_reasons].sort((a, b) => b.event_count - a.event_count);
              const topReason = sortedReasons[0];
              const secondReason = sortedReasons.length > 1 ? sortedReasons[1] : null;

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
                          {reasonData.core_reasons.slice(0, 5).map((tag) => (
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
                                  style={{ width: `${(tag.event_count / reasonData.total_events) * 100}%` }}
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
                           <div className="text-slate-700 text-sm leading-relaxed">
                            {(() => {
                              if (!sortedReasons.length) return "退货原因较为分散，未发现单一主导因素。";
                              
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
                           const targetReason = (topReason.tag_code === 'NO_MATCH' && secondReason) ? secondReason : topReason;
                           if (targetReason && targetReason.detailed_explanation) {
                             return (
                               <div className="relative">
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
                           }
                           return null;
                        })()}
                        
                        {!sortedReasons.length && (
                          <div className="flex items-center text-slate-400 text-sm bg-slate-50 p-3 rounded">
                             <HelpCircle className="w-4 h-4 mr-2" />
                             暂无足够的文本数据生成深度解读。
                          </div>
                        )}
                    </div>

                  </div>
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
      </div>
    </div>
  );
}