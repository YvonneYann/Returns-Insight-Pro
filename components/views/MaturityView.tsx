
import React, { useMemo, useState } from 'react';
import { 
  Hourglass, 
  Unlock, 
  Lock, 
  Calendar, 
  ArrowLeftRight, 
  Activity, 
  TrendingUp, 
  TrendingDown, 
  Telescope, 
  Sparkles, 
  BarChart2, 
  Clock,
  LineChart,
  Table,
  Info,
  ChevronDown,
  AlertCircle,
  CheckCircle2,
  Loader2,
  History,
  ArrowRight,
  GitBranch
} from 'lucide-react';
import { AppData } from '../../types';
import { analyzeMaturity, DailyProjectionRow } from '../../utils/maturityAnalyzer';
import { formatPercent, formatNumber } from '../../utils/formatters';
import { MaturityContrastSection } from './MaturityContrastSection';

export const MaturityView: React.FC<{ data: AppData }> = ({ data }) => {
  const result = useMemo(() => analyzeMaturity(data), [data]);

  if (!result) {
    return <div className="p-8 text-center text-slate-500">数据不足，无法进行退货终值推演。请确保上传了包含订单明细的 JSON 文件。</div>;
  }

  const { 
    fasin, t0, s, 
    d_value, p90_value, 
    earliestEvalDate, p90Date,
    maturityStatus, confidenceScore, isEvaluable, 
    daysToWait, 
    metrics, distribution, baselineRange, 
    projection, dailyProjections, trend 
  } = result;

  // --- Metrics Calculation ---
  // Card A: Actual (Nominal T0~S) vs Reference (T0-D ~ T0)
  const actualRate = metrics.postNominal.rate; 
  const refRate = metrics.reference.rate;
  
  // Relative Delta: (Actual - Ref) / Ref
  let relativeDelta = 0;
  if (refRate > 0) {
      relativeDelta = (actualRate - refRate) / refRate;
  } else if (actualRate > 0) {
      relativeDelta = 1; 
  }
  
  const isActualImprovement = relativeDelta < 0;

  // Card B: Projection vs Actual
  const projectedRate = projection.projectedRate;
  const projectionDelta = (projectedRate !== null) ? (projectedRate - actualRate) : null; // The "Hidden" risk
  
  // --- Status Card Logic ---
  const getStatusConfig = () => {
      // Simplified Logic: only projecting or insufficient
      if (maturityStatus === 'projecting') {
          return {
              title: 'Projecting',
              subtitle: '推演中 (Projecting)',
              desc: '当前数据已满足推演要求 (置信度 ≥ 50%)。基于 P50 滞后模型进行终值预测，结论具有参考价值。',
              gradient: 'bg-gradient-to-br from-indigo-500 to-purple-600',
              shadow: 'shadow-indigo-200',
              icon: Telescope
          };
      }
      
      // Default: insufficient
      return {
          title: 'Data Insufficient',
          subtitle: '数据不足 (Insufficient)',
          desc: '大部分销量尚未度过 P50 滞后期 (置信度 < 50%)。当前数据波动较大，建议等待数据沉淀后再做决策。',
          gradient: 'bg-gradient-to-br from-amber-500 to-orange-600',
          shadow: 'shadow-amber-200',
          icon: Lock
      };
  };
  const statusConfig = getStatusConfig();
  const StatusIcon = statusConfig.icon;

  // Helper for Date Parsing
  const parseDate = (dateStr: string) => {
      const parts = dateStr.split('-');
      return { y: parts[0], md: `${parts[1]}.${parts[2]}` };
  };

  const bStart = parseDate(metrics.reference.range.start);
  const bEnd = parseDate(metrics.reference.range.end);
  const aStart = parseDate(metrics.postNominal.range.start);
  const aEnd = parseDate(metrics.postNominal.range.end);

  // --- SVG Chart Logic (Lag Distribution) ---
  const DistributionChart = () => {
      if (distribution.length === 0) return null;

      const width = 600;
      const height = 320; 
      const margin = { top: 20, right: 50, bottom: 40, left: 40 }; // Increased left margin for Y-Axis labels
      const chartW = width - margin.left - margin.right;
      const chartH = height - margin.top - margin.bottom;

      const maxDays = distribution[distribution.length - 1].days;
      const xScale = (days: number) => (days / maxDays) * chartW;
      const maxCount = Math.max(...distribution.map(d => d.count));
      const yScaleCount = (count: number) => chartH - (count / maxCount) * chartH;
      const yScalePct = (pct: number) => chartH - (pct * chartH);

      const linePoints = distribution.map(d => `${xScale(d.days)},${yScalePct(d.cumulativePct)}`).join(' ');
      const p50Y = yScalePct(0.5); 
      const p50X = xScale(d_value);
      
      const p90Y = yScalePct(0.9);
      const p90X = xScale(p90_value);

      return (
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
            <g transform={`translate(${margin.left},${margin.top})`}>
                {/* Grid Lines & Y-Axis Labels */}
                {[0, 0.25, 0.5, 0.75, 1].map(pct => (
                    <g key={pct}>
                        <line x1={0} x2={chartW} y1={yScalePct(pct)} y2={yScalePct(pct)} stroke="#e2e8f0" strokeWidth="1" strokeDasharray={pct === 0.5 || pct === 0.9 ? "4 4" : ""} />
                        
                        {/* Right Axis: Percentage */}
                        <text x={chartW + 8} y={yScalePct(pct) + 5} textAnchor="start" fontSize="12" fontWeight="500" fill="#94a3b8">
                            {(pct * 100).toFixed(0)}%
                        </text>

                        {/* Left Axis: Volume Count (Added) */}
                        <text x={-12} y={yScalePct(pct) + 5} textAnchor="end" fontSize="12" fontWeight="500" fill="#94a3b8">
                            {formatNumber(Math.round(maxCount * pct))}
                        </text>
                    </g>
                ))}
                
                {/* Bars */}
                {distribution.map((d, i) => {
                   const barX = xScale(d.days);
                   const barW = (chartW / distribution.length) * 0.8;
                   const barY = yScaleCount(d.count);
                   const barH = chartH - barY;
                   const isMature = d.days <= d_value;
                   return <rect key={i} x={barX} y={barY} width={barW} height={barH} fill={isMature ? "#818cf8" : "#cbd5e1"} opacity={0.8} rx={2} />;
                })}
                
                {/* Trend Line */}
                <polyline points={linePoints} fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                
                {/* P50 Markers */}
                <line x1={chartW} x2={p50X} y1={p50Y} y2={p50Y} stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="4 4" />
                <line x1={p50X} x2={p50X} y1={p50Y} y2={chartH} stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="4 4" />
                <circle cx={p50X} cy={p50Y} r={4} fill="#f59e0b" stroke="white" strokeWidth="2" />
                
                {/* P50 Label */}
                <g transform={`translate(${p50X}, ${p50Y - 12})`}>
                     <rect x="-45" y="-22" width="90" height="22" rx="4" fill="#fff7ed" stroke="#fdba74" />
                     <text x="0" y="-6" textAnchor="middle" fontSize="11" fontWeight="bold" fill="#c2410c">P50 = {d_value}天</text>
                </g>

                {/* P90 Markers */}
                <line x1={chartW} x2={p90X} y1={p90Y} y2={p90Y} stroke="#10b981" strokeWidth="1.5" strokeDasharray="4 4" />
                <line x1={p90X} x2={p90X} y1={p90Y} y2={chartH} stroke="#10b981" strokeWidth="1.5" strokeDasharray="4 4" />
                <circle cx={p90X} cy={p90Y} r={4} fill="#10b981" stroke="white" strokeWidth="2" />

                 {/* P90 Label */}
                <g transform={`translate(${p90X}, ${p90Y - 12})`}>
                     <rect x="-45" y="-22" width="90" height="22" rx="4" fill="#ecfdf5" stroke="#6ee7b7" />
                     <text x="0" y="-6" textAnchor="middle" fontSize="11" fontWeight="bold" fill="#047857">P90 = {p90_value}天</text>
                </g>

                {/* X-Axis Labels */}
                {distribution.filter((_, i) => i % 5 === 0).map((d) => (
                    <text key={d.days} x={xScale(d.days)} y={chartH + 25} textAnchor="middle" fontSize="14" fontWeight="500" fill="#64748b">{d.days}</text>
                ))}
            </g>
        </svg>
      );
  };

  // --- SVG Trend Chart Logic ---
  const TrendChart = () => {
      if (!trend || trend.length === 0) return null;

      const [hoverIndex, setHoverIndex] = useState<number | null>(null);

      const width = 1000; // Increased width for better daily resolution
      const height = 350;
      const margin = { top: 30, right: 60, bottom: 50, left: 60 };
      const chartW = width - margin.left - margin.right;
      const chartH = height - margin.top - margin.bottom;

      // X Scale
      const barWidth = chartW / trend.length;
      const xPos = (i: number) => i * barWidth;

      // Y Scales
      const maxVol = Math.max(...trend.map(t => t.volume), 1);
      const maxRate = Math.max(...trend.map(t => t.rate), 0.1); // min 10% for scale
      
      const yVol = (v: number) => chartH - (v / maxVol) * chartH;
      const yRate = (r: number) => chartH - (r / maxRate) * chartH;

      // Rate Line Path
      const linePath = trend.map((t, i) => `${xPos(i) + barWidth/2},${yRate(t.rate)}`).join(' ');

      // Find T0 Index for separator line
      const t0Index = trend.findIndex(t => t.isPost);
      const t0X = t0Index >= 0 ? xPos(t0Index) : -1;

      return (
          <div className="w-full h-full relative" onMouseLeave={() => setHoverIndex(null)}>
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
                <defs>
                    {/* Volume Gradient: Classic Blue (Professional & Balanced) */}
                    <linearGradient id="volGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#bfdbfe" stopOpacity="1"/> {/* Blue-200 */}
                        <stop offset="100%" stopColor="#60a5fa" stopOpacity="0.85"/> {/* Blue-400 */}
                    </linearGradient>
                    
                    {/* Returns Gradient: Soft Rose (Alert but not Neon) */}
                    <linearGradient id="retGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#fda4af" stopOpacity="1"/> {/* Rose-300 */}
                        <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.9"/> {/* Rose-500 */}
                    </linearGradient>

                    {/* Rate Line Shadow (Amber Glow) */}
                    <filter id="lineShadow" x="-20%" y="-20%" width="140%" height="140%">
                         <feDropShadow dx="0" dy="2" stdDeviation="1.5" floodColor="#b45309" floodOpacity="0.2"/>
                    </filter>
                </defs>

                <g transform={`translate(${margin.left},${margin.top})`}>
                    
                    {/* Y-Axis Grid & Labels (Right - Rate - Amber) */}
                    {[0, 0.25, 0.5, 0.75, 1].map(pct => (
                        <g key={`r-${pct}`}>
                            <line x1={0} x2={chartW} y1={yRate(maxRate * pct)} y2={yRate(maxRate * pct)} stroke="#f1f5f9" strokeWidth="1" />
                            <text x={chartW + 10} y={yRate(maxRate * pct) + 4} textAnchor="start" fontSize="12" fill="#d97706" fontWeight="600">
                                {formatPercent(maxRate * pct)}
                            </text>
                        </g>
                    ))}

                    {/* Y-Axis Labels (Left - Volume) */}
                    {[0, 0.5, 1].map(pct => (
                        <text key={`v-${pct}`} x={-10} y={yVol(maxVol * pct) + 4} textAnchor="end" fontSize="12" fill="#64748b" fontWeight="600">
                            {formatNumber(Math.round(maxVol * pct))}
                        </text>
                    ))}

                    {/* T0 Separator */}
                    {t0X >= 0 && (
                        <g>
                            <line x1={t0X} x2={t0X} y1={-20} y2={chartH + 20} stroke="#0d9488" strokeWidth="1.5" strokeDasharray="5 3" opacity="0.5" />
                            <g transform={`translate(${t0X}, -28)`}>
                                <rect x="-18" y="-12" width="36" height="22" rx="6" fill="#0d9488" />
                                <text x="0" y="4" textAnchor="middle" fill="white" fontSize="11" fontWeight="bold">T0</text>
                                {/* Triangle arrow pointing down */}
                                <path d="M -4 10 L 4 10 L 0 16 Z" fill="#0d9488" />
                            </g>
                        </g>
                    )}

                    {/* Bars (Volume & Returns) */}
                    {trend.map((t, i) => {
                        const volHeight = chartH - yVol(t.volume);
                        const retHeight = chartH - yVol(t.returns); 
                        
                        return (
                            <g key={i} onMouseEnter={() => setHoverIndex(i)}>
                                {/* Total Volume Bar (Background) */}
                                <rect 
                                    x={xPos(i) + 1} 
                                    y={yVol(t.volume)} 
                                    width={Math.max(barWidth - 2, 1)} 
                                    height={Math.max(volHeight, 0)} 
                                    fill="url(#volGradient)" 
                                    opacity={hoverIndex === i ? 1 : 0.8}
                                    rx={3}
                                />
                                {/* Returns Portion Bar (Stacked at bottom) */}
                                <rect 
                                    x={xPos(i) + 1} 
                                    y={yVol(t.returns)} 
                                    width={Math.max(barWidth - 2, 1)} 
                                    height={Math.max(retHeight, 0)} 
                                    fill="url(#retGradient)" 
                                    opacity={hoverIndex === i ? 1 : 0.9}
                                    rx={2}
                                />
                            </g>
                        );
                    })}

                    {/* Line (Rate) - Amber for Contrast */}
                    <path 
                        d={`M ${linePath}`} 
                        fill="none" 
                        stroke="#f59e0b" 
                        strokeWidth="2.5" 
                        strokeLinecap="round" 
                        strokeLinejoin="round" 
                        filter="url(#lineShadow)"
                    />
                    
                    {/* Data Points */}
                    {trend.map((t, i) => (
                        <circle 
                            key={`dot-${i}`} 
                            cx={xPos(i) + barWidth/2} 
                            cy={yRate(t.rate)} 
                            r={hoverIndex === i ? 5 : 2.5} 
                            fill={hoverIndex === i ? "#fff" : "#f59e0b"} 
                            stroke="#f59e0b" 
                            strokeWidth="2"
                            onMouseEnter={() => setHoverIndex(i)}
                        />
                    ))}

                    {/* X-Axis Labels */}
                    {trend.map((t, i) => {
                        const showLabel = i === 0 || i === trend.length - 1 || i === t0Index || (i % 7 === 0);
                        if (!showLabel) return null;
                        return (
                            <text key={`x-${i}`} x={xPos(i) + barWidth/2} y={chartH + 25} textAnchor="middle" fontSize="11" fill={i === t0Index ? "#0d9488" : "#94a3b8"} fontWeight={i === t0Index ? "bold" : "500"}>
                                {t.date.slice(5)}
                            </text>
                        )
                    })}
                </g>
            </svg>

            {/* Hover Tooltip - Styled */}
            {hoverIndex !== null && trend[hoverIndex] && (
                <div 
                    className="absolute bg-slate-800/95 backdrop-blur-sm text-white text-xs rounded-xl p-4 shadow-xl z-20 pointer-events-none border border-slate-700"
                    style={{ 
                        left: `${margin.left + xPos(hoverIndex) + barWidth/2}px`, 
                        top: '10%',
                        transform: 'translate(-50%, 0)'
                    }}
                >
                    <div className="font-bold border-b border-slate-600 pb-2 mb-2 flex justify-between items-center gap-4">
                        <span>{trend[hoverIndex].date}</span>
                        {trend[hoverIndex].isPost ? 
                            <span className="text-[10px] bg-teal-500/20 text-teal-300 px-1.5 py-0.5 rounded">After T0</span> : 
                            <span className="text-[10px] bg-slate-600/50 text-slate-300 px-1.5 py-0.5 rounded">Before T0</span>
                        }
                    </div>
                    <div className="space-y-1.5">
                        <div className="flex justify-between gap-6 items-center">
                            <div className="flex items-center gap-1.5 text-blue-200">
                                <div className="w-2 h-2 rounded-full bg-blue-400"></div>
                                <span>销量 (Vol)</span>
                            </div>
                            <span className="font-mono font-medium">{formatNumber(trend[hoverIndex].volume)}</span>
                        </div>
                        <div className="flex justify-between gap-6 items-center">
                            <div className="flex items-center gap-1.5 text-rose-300">
                                <div className="w-2 h-2 rounded-full bg-rose-500"></div>
                                <span>退货 (Ret)</span>
                            </div>
                            <span className="font-mono font-bold text-rose-300">{trend[hoverIndex].returns}</span>
                        </div>
                        <div className="flex justify-between gap-6 items-center pt-1 border-t border-slate-700/50 mt-1">
                            <div className="flex items-center gap-1.5 text-amber-400">
                                <Activity className="w-3 h-3" />
                                <span>退货率</span>
                            </div>
                            <span className="font-mono font-bold text-amber-400 text-sm">{formatPercent(trend[hoverIndex].rate)}</span>
                        </div>
                    </div>
                </div>
            )}
          </div>
      );
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      
      {/* 1. Header Identity */}
      <div className="flex flex-col md:flex-row justify-between items-start gap-6 border-b border-slate-200 pb-6">
        <div>
           <div className="flex items-center gap-3 mb-2">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700 border border-amber-200 shadow-sm">
                  <Hourglass className="w-3 h-3 mr-1.5" />
                  退货率优化成效评估 (Return Rate Optimization Assessment)
              </span>
           </div>
           <h1 className="text-4xl font-black text-slate-900 tracking-tight mb-2">
              {fasin}
           </h1>
           <p className="text-slate-500 mt-1 flex items-center gap-2 text-sm font-medium">
              <span className="uppercase tracking-wider text-xs font-bold text-slate-400">Parent ASIN</span>
              <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
              <span>基于滞后模型进行同口径实况验证与终值预测，消除时间差干扰，辅助全周期决策。</span>
           </p>
        </div>
      </div>

      {/* Part A: Contrast Section (NEW) */}
      <MaturityContrastSection data={data} />

      {/* Divider - Suspended Capsule Style */}
      <div className="relative py-10 flex items-center justify-center">
          {/* Gradient Line Background */}
          <div className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent opacity-50"></div>
          
          {/* Floating Capsule */}
          <div className="relative z-10 group cursor-default">
              {/* Outer Gradient Border Ring */}
              <div className="absolute -inset-[1px] bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-full opacity-60 blur-[2px] group-hover:opacity-100 group-hover:blur-[3px] transition duration-500"></div>
              
              {/* Inner White Content */}
              <div className="relative bg-white px-8 py-3 rounded-full flex items-center gap-4 shadow-xl shadow-indigo-100/50">
                  {/* Left Icon: Pivot/Branch */}
                  <div className="bg-slate-50 p-2 rounded-full border border-slate-100 text-slate-500 group-hover:text-indigo-600 transition-colors">
                     <GitBranch className="w-4 h-4 rotate-90" />
                  </div>
                  
                  {/* Text */}
                  <div className="flex flex-col items-center">
                     <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] leading-none mb-1 group-hover:text-indigo-400 transition-colors">Pivot Point</span>
                     <span className="text-sm font-bold text-slate-800 tracking-tight">基于历史趋势 · 转向未来推演</span>
                  </div>

                  {/* Right Icon: AI/Future */}
                  <div className="bg-amber-50 p-2 rounded-full border border-amber-100 text-amber-500 animate-pulse">
                     <Sparkles className="w-4 h-4" />
                  </div>
              </div>
          </div>
      </div>

      {/* Part B: The Existing Maturity Console - RESTRUCTURED: 3 Columns Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Column 1: Hero Status Card */}
        <div className={`col-span-1 rounded-2xl p-6 flex flex-col justify-between shadow-lg relative overflow-hidden text-white ${statusConfig.gradient} ${statusConfig.shadow}`}>
             {/* Decor */}
             <div className="absolute top-0 right-0 w-32 h-32 bg-white opacity-10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
             
             <div>
                <div className="flex items-center gap-2 mb-4 opacity-90">
                    <StatusIcon className="w-4 h-4" />
                    <span className="font-bold uppercase tracking-wider text-xs">{statusConfig.title}</span>
                </div>
                <h2 className="text-2xl font-black mb-1 tracking-tight">
                    {statusConfig.subtitle}
                </h2>
                <div className="flex items-end gap-2 mb-4">
                   <span className="text-4xl font-black">{formatPercent(confidenceScore)}</span>
                   <span className="text-sm font-bold opacity-80 mb-1">Confidence</span>
                </div>

                {/* Progress Bar */}
                <div className="w-full h-2 bg-black/20 rounded-full mb-4 overflow-hidden backdrop-blur-sm">
                   <div 
                     className="h-full bg-white opacity-90 rounded-full transition-all duration-1000 ease-out"
                     style={{ width: `${confidenceScore * 100}%` }}
                   ></div>
                </div>

                <p className="opacity-90 text-sm leading-relaxed font-medium">
                    {statusConfig.desc}
                </p>

                {/* New Countdown Section - Simplified Condition */}
                <div className="mt-4 pt-3 border-t border-white/20 flex items-start gap-2.5">
                   <div className="bg-white/20 p-1.5 rounded text-white shrink-0 mt-0.5">
                       <Clock className="w-3.5 h-3.5" />
                   </div>
                   <div className="text-xs font-medium text-white/90 leading-relaxed">
                       {daysToWait > 0 ? (
                           <>
                              预计 <strong className="text-white border-b border-white/40">{earliestEvalDate}</strong> 达到推演标准 (50%)<br/>
                              (建议等待 <strong className="text-white">{daysToWait}</strong> 天后，结论更稳健)
                           </>
                       ) : (
                           <>
                              已达到推演标准 (Confidence ≥ 50%)。<br/>
                              预计 <strong className="text-white border-b border-white/40">{p90Date}</strong> 本批次全量沉淀 (P90)。
                           </>
                       )}
                   </div>
                </div>
             </div>
        </div>

        {/* Column 2: Time Anchors & Calculated Lag */}
        <div className="col-span-1 flex flex-col gap-4">
            
            {/* Time Anchors */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col justify-center hover:border-indigo-200 transition-colors flex-1">
                <div className="flex items-center gap-2 mb-3 text-slate-400">
                    <Calendar className="w-4 h-4" />
                    <span className="font-bold text-xs uppercase">Time Anchors</span>
                </div>
                <div className="space-y-2">
                    <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-slate-600">改动上线 (T0)</span>
                        <span className="font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded text-sm">{t0}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-slate-600">置信度达标 (Target)</span>
                        <span className={`font-mono font-bold px-2 py-0.5 rounded text-sm ${isEvaluable ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                            {earliestEvalDate}
                        </span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-slate-600">最新数据 (S)</span>
                        <span className="font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded text-sm">{s}</span>
                    </div>
                </div>
            </div>

            {/* D-Value */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col justify-center relative overflow-hidden group hover:border-amber-200 transition-colors flex-1">
                <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-1 text-slate-400">
                        <Hourglass className="w-4 h-4" />
                        <span className="font-bold text-xs uppercase">Calculated Lag (P50)</span>
                    </div>
                    <div className="text-4xl font-black text-slate-800 group-hover:text-amber-600 transition-colors">
                        {d_value}<span className="text-lg font-bold text-slate-400 ml-1">days</span>
                    </div>
                    <div className="text-xs text-slate-400 mt-1">
                         <div>Based on Pre-T0 History ({baselineRange.daysSpan} days)</div>
                         <div className="font-mono text-[10px] opacity-75 mt-0.5">{baselineRange.start} ~ {baselineRange.end}</div>
                    </div>
                </div>
                <div className="absolute right-0 bottom-0 opacity-5 pointer-events-none group-hover:opacity-10 transition-opacity">
                     <BarChart2 className="w-24 h-24 text-slate-800" />
                </div>
            </div>
        </div>

        {/* Column 3: Scope Comparison Bar - Redesigned (Boarding Pass / Gantt Style) */}
        <div className="col-span-1 flex flex-col gap-4">
             {/* Before Card (Archived Style) */}
             <div className="flex-1 bg-slate-50 rounded-2xl border border-dashed border-slate-300 p-5 shadow-sm hover:border-slate-400 transition-all group relative overflow-hidden flex flex-col justify-center">
                 {/* Watermark Icon */}
                 <div className="absolute right-[-10px] bottom-[-10px] opacity-[0.07] transform rotate-12 pointer-events-none">
                     <History className="w-28 h-28 text-slate-800" />
                 </div>
                 
                 <div className="flex justify-between items-center mb-4 relative z-10">
                     <div className="flex items-center gap-2">
                         <div className="p-1 bg-slate-200 rounded text-slate-500">
                             <History className="w-3.5 h-3.5" />
                         </div>
                         <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">调整前 (Before)</h4>
                     </div>
                 </div>

                 {/* Ticket Data Row */}
                 <div className="flex items-center justify-between relative z-10">
                     {/* Start Date */}
                     <div className="flex flex-col items-start">
                         <span className="text-[10px] text-slate-400 font-bold mb-0.5">{bStart.y}</span>
                         <span className="text-xl font-black text-slate-600 leading-none">{bStart.md}</span>
                     </div>

                     {/* Connector */}
                     <div className="flex-1 px-3 flex flex-col items-center justify-center">
                         <div className="w-full h-0.5 bg-slate-300 relative rounded-full"></div>
                         <span className="bg-slate-200 text-slate-600 border border-slate-300 px-2 py-0.5 rounded-full text-[10px] font-bold font-mono mt-[-8px] relative z-10 shadow-sm">
                             {metrics.reference.range.daysSpan} Days
                         </span>
                     </div>

                     {/* End Date */}
                     <div className="flex flex-col items-end">
                         <span className="text-[10px] text-slate-400 font-bold mb-0.5">{bEnd.y}</span>
                         <span className="text-xl font-black text-slate-600 leading-none">{bEnd.md}</span>
                     </div>
                 </div>
             </div>

             {/* After Card (Active Monitor Style) */}
             <div className="flex-1 bg-gradient-to-br from-cyan-50 to-blue-50 rounded-2xl border border-cyan-200 p-5 shadow-sm hover:border-cyan-300 transition-all group relative overflow-hidden flex flex-col justify-center">
                 {/* Watermark Icon */}
                 <div className="absolute right-[-10px] bottom-[-10px] opacity-[0.1] transform rotate-12 pointer-events-none">
                     <Clock className="w-28 h-28 text-cyan-700" />
                 </div>
                 
                 <div className="flex justify-between items-center mb-4 relative z-10">
                     <div className="flex items-center gap-2">
                         <div className="p-1 bg-cyan-100 rounded text-cyan-600 shadow-sm">
                             <Activity className="w-3.5 h-3.5 animate-pulse" />
                         </div>
                         <h4 className="text-xs font-bold text-cyan-700 uppercase tracking-wider">调整后 (After)</h4>
                     </div>
                     {/* Live Indicator */}
                     <div className="flex items-center gap-1.5">
                         <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
                         </span>
                     </div>
                 </div>
                 
                 {/* Ticket Data Row */}
                 <div className="flex items-center justify-between relative z-10">
                     {/* Start Date */}
                     <div className="flex flex-col items-start">
                         <span className="text-[10px] text-cyan-400 font-bold mb-0.5">{aStart.y}</span>
                         <span className="text-xl font-black text-cyan-900 leading-none">{aStart.md}</span>
                     </div>

                     {/* Connector */}
                     <div className="flex-1 px-3 flex flex-col items-center justify-center">
                        <div className="w-full h-1 bg-gradient-to-r from-cyan-200 to-blue-200 relative rounded-full"></div>
                         <span className="bg-white text-cyan-700 border border-cyan-200 px-2 py-0.5 rounded-full text-[10px] font-bold font-mono mt-[-9px] relative z-10 shadow-sm">
                             {metrics.postNominal.range.daysSpan} Days
                         </span>
                     </div>

                     {/* End Date */}
                     <div className="flex flex-col items-end">
                         <span className="text-[10px] text-cyan-400 font-bold mb-0.5">{aEnd.y}</span>
                         <span className="text-xl font-black text-cyan-900 leading-none">{aEnd.md}</span>
                     </div>
                 </div>
             </div>
        </div>

      </div>

      {/* 3 & 4. Analytics & Evidence: Side-by-Side Grid Layout - SWAPPED */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Left Column (7/12): Lag Distribution Chart */}
          <div className="lg:col-span-7">
              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm h-full flex flex-col">
                  <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <BarChart2 className="w-5 h-5 text-slate-400" />
                        <h3 className="font-bold text-slate-800">退货滞后分布 (Lag Distribution)</h3>
                      </div>
                      <div className="flex items-center gap-4 text-xs">
                          <div className="flex items-center gap-1.5">
                              <div className="w-3 h-3 bg-indigo-400 rounded-sm opacity-80"></div>
                              <span className="text-slate-500">Left: 退货量</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                              <div className="w-6 h-0.5 bg-amber-500"></div>
                              <span className="text-slate-500">Right: 累积%</span>
                          </div>
                      </div>
                  </div>
                  <div className="flex-1 w-full min-h-[260px] flex flex-col justify-center">
                       <DistributionChart />
                  </div>
                  <div className="mt-5 p-4 bg-indigo-50/50 border border-indigo-100 rounded-lg flex items-start gap-3">
                      <div className="bg-indigo-100 p-1.5 rounded-full text-indigo-600 shrink-0 mt-0.5">
                          <Info className="w-4 h-4" />
                      </div>
                      <p className="text-sm text-slate-700 leading-relaxed">
                          基于 T0 前 <span className="font-bold text-slate-900 mx-1 border-b border-slate-300">{baselineRange.daysSpan}</span> 天的历史数据分析：
                          <br/>
                          <span className="inline-block mt-1">
                            • <span className="font-bold text-amber-600">50%</span> 的退货发生在下单后 <span className="font-bold text-amber-600">{d_value}</span> 天内 (P50)
                          </span>
                          <br/>
                          <span className="inline-block mt-1">
                            • <span className="font-bold text-emerald-600">90%</span> 的退货发生在下单后 <span className="font-bold text-emerald-600">{p90_value}</span> 天内 (P90)
                          </span>
                      </p>
                  </div>
              </div>
          </div>

          {/* Right Column (5/12): Metrics Cards (Stacked) */}
          <div className="lg:col-span-5 flex flex-col gap-6">
              
              {/* Card A: True Mature Performance */}
              <div className="rounded-xl border border-teal-200 bg-white shadow-md overflow-hidden flex flex-col relative group hover:shadow-lg transition-shadow flex-1">
                  <div className="absolute top-0 inset-x-0 h-1 bg-teal-500"></div>
                  
                  {/* Header */}
                  <div className="p-5 border-b border-teal-50 flex justify-between items-center">
                      <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                          <ArrowLeftRight className="w-5 h-5 text-teal-600" />
                          当前实时表现 (Observed)
                      </h3>
                      <span className="inline-flex items-center gap-1.5 bg-teal-50 text-teal-700 px-3 py-1 rounded-full text-[10px] font-bold border border-teal-100 uppercase tracking-wide shrink-0">
                          <Activity className="w-3 h-3" />
                          Real-time
                      </span>
                  </div>
                  
                  {/* Content */}
                  <div className="p-6 flex items-center justify-between flex-1">
                      {/* Left: Reference */}
                      <div className="flex-1 flex flex-col items-center justify-center border-r border-slate-100 pr-2">
                          <div className="text-2xl font-black text-slate-400 font-mono tracking-tight mb-1">
                              {formatPercent(refRate)}
                          </div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide text-center">
                              调整前
                          </p>
                      </div>

                      {/* Center: Delta */}
                      <div className="px-3 flex flex-col items-center justify-center">
                          <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-sm font-black shadow-sm border mb-1 ${
                              isActualImprovement 
                              ? 'bg-emerald-50 text-emerald-600 border-emerald-100' 
                              : 'bg-rose-50 text-rose-600 border-rose-100'
                          }`}>
                              {isActualImprovement ? <TrendingDown className="w-3.5 h-3.5" /> : <TrendingUp className="w-3.5 h-3.5" />}
                              {formatPercent(Math.abs(relativeDelta))}
                          </div>
                      </div>

                      {/* Right: Actual */}
                      <div className="flex-1 flex flex-col items-center justify-center border-l border-slate-100 pl-2">
                          <div className="text-2xl font-black text-teal-700 font-mono tracking-tight mb-1">
                              {formatPercent(actualRate)}
                          </div>
                          <p className="text-[10px] font-bold text-teal-600 uppercase tracking-wide text-center">
                              调整后
                          </p>
                      </div>
                  </div>
              </div>

              {/* Card B: Projected Forecast (Simplified Layout) */}
              <div className="rounded-xl border border-indigo-200 bg-white shadow-md overflow-hidden flex flex-col relative group hover:shadow-lg transition-shadow flex-1">
                   <div className="absolute top-0 inset-x-0 h-1 bg-indigo-500"></div>

                   {/* Header */}
                   <div className="p-5 border-b border-indigo-50 flex justify-between items-center">
                      <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                          <Telescope className="w-5 h-5 text-indigo-600" />
                          <div>
                              全周期推演预测 (Forecast)
                              <span className="block text-[10px] text-slate-400 font-normal leading-tight">仅统计稳定期/沉淀完成数据 (Excl. Ramp-up)</span>
                          </div>
                      </h3>
                      <span className="inline-flex items-center gap-1.5 bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-[10px] font-bold border border-indigo-100 uppercase tracking-wide">
                          <Sparkles className="w-3 h-3" />
                          Projection
                      </span>
                  </div>
                  
                  {/* Content - Matching Card A Structure */}
                  <div className="p-6 flex items-center justify-between flex-1">
                      
                      {/* Left: Actual (Observed) */}
                      <div className="flex-1 flex flex-col items-center justify-center border-r border-slate-100 pr-2">
                          <div className="text-2xl font-black text-slate-400 font-mono tracking-tight mb-1">
                              {formatPercent(actualRate)}
                          </div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide text-center">
                              已实现
                          </p>
                      </div>

                      {/* Center: Delta (Hidden Risk) */}
                      <div className="px-3 flex flex-col items-center justify-center">
                          {projectionDelta !== null ? (
                             <div className="flex items-center gap-1 px-2.5 py-1 rounded-full text-sm font-black shadow-sm border mb-1 bg-indigo-50 text-indigo-600 border-indigo-100">
                                  <TrendingUp className="w-3.5 h-3.5" />
                                  {formatPercent(projectionDelta)}
                              </div>
                          ) : (
                              <div className="px-2.5 py-1 rounded-full text-xs font-bold text-slate-300 bg-slate-50 border border-slate-200 mb-1" title="数据不足无法计算差异">
                                  -
                              </div>
                          )}
                      </div>

                      {/* Right: Projected Final */}
                      <div className="flex-1 flex flex-col items-center justify-center border-l border-slate-100 pl-2">
                          <div className="text-2xl font-black text-indigo-700 font-mono tracking-tight mb-1 flex items-start justify-center gap-1">
                              {projectedRate !== null ? formatPercent(projectedRate) : <span className="text-slate-300">-</span>}
                              {projectedRate !== null && <span className="text-xs text-indigo-300 mt-0.5">*</span>}
                          </div>
                          <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-wide text-center">
                              推演终值
                          </p>
                      </div>

                  </div>
              </div>
          </div>
      </div>

      {/* 5. Daily Trend Chart */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mt-6">
         <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                  <LineChart className="w-5 h-5 text-indigo-600" />
                  <h3 className="font-bold text-slate-800 text-lg">每日趋势追踪 (Daily Trend)</h3>
              </div>
              <div className="flex items-center gap-4 text-xs">
                  <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded-sm bg-gradient-to-b from-blue-200 to-blue-400"></div>
                      <span className="text-slate-500">销量 (Vol)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded-sm bg-gradient-to-b from-rose-300 to-rose-500"></div>
                      <span className="text-slate-500">退货量 (Ret)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                      <div className="w-6 h-0.5 bg-amber-500"></div>
                      <span className="text-slate-500">退货率 (Rate)</span>
                  </div>
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-teal-50 border border-teal-100">
                      <div className="w-0.5 h-3 bg-teal-600 border border-teal-600 border-dashed"></div>
                      <span className="text-teal-700 font-bold">T0 Line</span>
                  </div>
              </div>
         </div>
         <div className="w-full h-[350px]">
             <TrendChart />
         </div>
      </div>

      {/* 6. NEW: Daily Cohort Projection Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mt-6 animate-in slide-in-from-bottom-4 fade-in duration-700">
         <div className="px-6 py-5 border-b border-slate-200 bg-slate-50/50">
             <div className="flex flex-col gap-5">
                 {/* Title */}
                 <div className="flex items-center gap-2">
                     <div className="bg-indigo-100 p-2 rounded-lg text-indigo-600">
                        <Table className="w-5 h-5" />
                     </div>
                     <h3 className="font-bold text-slate-800 text-lg">每日归因推演明细 (Daily Cohort Projection)</h3>
                 </div>
                 
                 {/* Structured Legend Box */}
                 <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                    <div className="text-sm font-bold text-slate-800 mb-4 pb-2 border-b border-slate-100 flex items-center gap-2">
                        <Info className="w-4 h-4 text-indigo-500" />
                        <span>按“下单日期”追踪批次表现，基于 P50 滞后模型进行分阶段推演：</span>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs leading-relaxed">
                        
                        {/* 1. Phase Logic */}
                        <div className="space-y-2">
                            <div className="font-bold text-slate-900 flex items-center gap-2 text-sm">
                                <span className="w-1.5 h-4 bg-slate-800 rounded-full"></span>
                                阶段划分 (Phase)
                            </div>
                            <div className="pl-3.5 space-y-2">
                                <div className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0"></span>
                                    <span className="text-slate-600"><span className="font-bold text-amber-700">早期/波动期</span> (Age &lt; P50)</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0"></span>
                                    <span className="text-slate-600"><span className="font-bold text-indigo-700">稳定期</span> (P50 - P90)</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
                                    <span className="text-slate-600"><span className="font-bold text-emerald-700">沉淀完成</span> (Age &gt; P90)</span>
                                </div>
                            </div>
                        </div>

                        {/* 2. Lag Logic */}
                        <div className="space-y-2 md:border-l border-slate-100 md:pl-6">
                            <div className="font-bold text-slate-900 flex items-center gap-2 text-sm">
                                <span className="w-1.5 h-4 bg-slate-800 rounded-full"></span>
                                回流进度 (Lag)
                            </div>
                            <p className="pl-3.5 text-slate-600">
                                对比历史 P50 曲线，计算当前节点<span className="font-bold text-slate-800 mx-1">理论上应已发生</span>的退货百分比。
                            </p>
                        </div>

                        {/* 3. Algorithm Logic */}
                        <div className="space-y-2 md:border-l border-slate-100 md:pl-6">
                            <div className="font-bold text-slate-900 flex items-center gap-2 text-sm">
                                <span className="w-1.5 h-4 bg-slate-800 rounded-full"></span>
                                动态算法 (Algorithm)
                            </div>
                            <div className="pl-3.5 space-y-2">
                                <div>
                                    <span className="font-bold text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded text-[10px] mr-2">直接推算</span>
                                    <span className="text-slate-500">成熟期按进度系数放大，定终值。</span>
                                </div>
                                <div>
                                    <span className="font-bold text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded text-[10px] mr-2">早期/波动期</span>
                                    <span className="text-slate-500">数据不足，暂不推演。</span>
                                </div>
                            </div>
                        </div>

                    </div>
                 </div>
             </div>
         </div>

         <div className="overflow-x-auto">
             <table className="w-full text-sm text-left border-collapse">
                 <thead className="bg-slate-50 text-slate-500 font-semibold text-xs uppercase tracking-wider border-b border-slate-200">
                     <tr>
                         <th className="px-4 py-4 text-left">下单日期</th>
                         <th className="px-4 py-4 text-left">单龄 (Age)</th>
                         <th className="px-4 py-4 text-left">阶段 (Phase)</th>
                         <th className="px-6 py-4 w-48">回流进度 (Lag Progress)</th>
                         <th className="px-4 py-4 w-32">算法 (Algorithm)</th>
                         <th className="px-4 py-4 text-right">销量</th>
                         <th className="px-4 py-4 text-right">已退货</th>
                         <th className="px-4 py-4 text-right">当前退货率</th>
                         <th className="px-4 py-4 text-right font-bold bg-indigo-50/30">推演退货量</th>
                         <th className="px-4 py-4 text-right font-bold bg-indigo-50/30">推演退货率</th>
                     </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-100">
                     {dailyProjections.map((row, idx) => {
                         // Determine Phase Styles (Visual Consistency)
                         let phaseStyles = {
                            badge: "",
                            bar: "",
                            text: ""
                         };

                         if (row.phase === 'finalized') {
                            phaseStyles = {
                                badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
                                bar: "bg-emerald-400",
                                text: "text-emerald-600"
                            };
                         } else if (row.phase === 'mature') {
                            phaseStyles = {
                                badge: "bg-indigo-50 text-indigo-700 border-indigo-200",
                                bar: "bg-indigo-400",
                                text: "text-indigo-600"
                            };
                         } else {
                            // Ramp-up
                            phaseStyles = {
                                badge: "bg-amber-50 text-amber-700 border-amber-200",
                                bar: "bg-amber-400",
                                text: "text-amber-600"
                            };
                         }

                         // Algorithm Tooltip Text
                         let algoText = '暂不推演';
                         let algoTooltip = 'Early phase data is too volatile to project.';
                         if (row.algorithm === 'gross-up') {
                             algoText = '直接推算';
                             algoTooltip = 'Pure Gross-Up: Realized / Lag%';
                         } else if (row.algorithm === 'linear-blend') {
                             algoText = '线性加权法';
                             algoTooltip = `Weighted Mix: ${(1-row.weight).toFixed(2)} Base + ${row.weight.toFixed(2)} Gross-Up`;
                         }

                         const isProjected = row.algorithm !== 'none';
                         const isProjectedHighRisk = isProjected && row.projectedRate > projection.baselineRate * 1.2;

                         return (
                             <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                                 <td className="px-4 py-3 font-mono font-medium text-slate-700">
                                     {row.date}
                                 </td>
                                 <td className="px-4 py-3 font-mono text-slate-500">
                                     {row.age} days
                                 </td>
                                 <td className="px-4 py-3">
                                     <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border ${phaseStyles.badge}`}>
                                        {row.phase === 'finalized' ? '沉淀完成' : row.phase === 'mature' ? '稳定期' : '早期/波动期'}
                                     </span>
                                 </td>
                                 
                                 {/* Progress Bar (Colored by Phase) */}
                                 <td className="px-6 py-3">
                                     <div className="flex items-center gap-2">
                                         <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                                             <div 
                                                className={`h-full rounded-full ${phaseStyles.bar}`} 
                                                style={{ width: `${row.lagPct * 100}%` }}
                                             ></div>
                                         </div>
                                         <span className="text-xs font-mono text-slate-500 w-10 text-right">{formatPercent(row.lagPct)}</span>
                                     </div>
                                 </td>

                                 {/* Algorithm (Colored by Phase) */}
                                 <td className="px-4 py-3">
                                     <div className="flex items-center gap-1 group cursor-help" title={algoTooltip}>
                                         <span className={`text-xs font-medium ${row.algorithm === 'none' ? 'text-slate-400 italic' : phaseStyles.text}`}>
                                            {algoText}
                                         </span>
                                         {row.algorithm !== 'none' && <Info className="w-3 h-3 text-slate-300 group-hover:text-amber-500" />}
                                     </div>
                                 </td>

                                 <td className="px-4 py-3 text-right font-mono text-slate-600">{formatNumber(row.sales)}</td>
                                 <td className="px-4 py-3 text-right font-mono text-slate-600">{row.realized}</td>
                                 <td className="px-4 py-3 text-right font-mono text-slate-400 text-xs">{formatPercent(row.currentRate)}</td>
                                 
                                 <td className="px-4 py-3 text-right font-mono text-slate-700 bg-indigo-50/10">
                                     {isProjected ? (
                                        <>
                                            <div className="font-bold">{Math.round(row.projectedTotal * 10) / 10}</div>
                                            {row.forecastAdd > 0 && (
                                                <div className="text-[10px] text-indigo-400">+{Math.round(row.forecastAdd * 10) / 10}</div>
                                            )}
                                        </>
                                     ) : <span className="text-slate-400">-</span>}
                                 </td>
                                 <td className={`px-4 py-3 text-right font-mono font-bold bg-indigo-50/10 ${isProjectedHighRisk ? 'text-rose-600' : 'text-slate-700'}`}>
                                     {isProjected ? formatPercent(row.projectedRate) : <span className="text-slate-400">-</span>}
                                 </td>
                             </tr>
                         );
                     })}
                     {dailyProjections.length === 0 && (
                         <tr><td colSpan={10} className="px-6 py-8 text-center text-slate-400">暂无推演数据</td></tr>
                     )}
                 </tbody>
             </table>
         </div>
         <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 text-xs text-slate-400 flex justify-between items-center">
             <span>* 仅展示 T0 之后的数据批次</span>
             <span>Forecast Add = Projected - Realized</span>
         </div>
      </div>

    </div>
  );
};