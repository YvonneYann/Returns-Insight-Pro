
import React, { useMemo } from 'react';
import { 
  Scale, 
  Lock, 
  TrendingDown, 
  TrendingUp, 
  ArrowRight,
  Info,
  Calendar,
  AlertCircle,
  PackageX,
  Microscope
} from 'lucide-react';
import { AppData } from '../../types';
import { analyzeContrast } from '../../utils/contrastAnalyzer';
import { formatPercent, formatNumber } from '../../utils/formatters';

export const MaturityContrastSection: React.FC<{ data: AppData }> = ({ data }) => {
  const result = useMemo(() => analyzeContrast(data), [data]);

  if (!result || !result.hasData) return null;

  const { 
      t0, s, runDays, 
      before, after, 
      deltaRate, isImproved, 
      velocityChart, dailyBreakdown 
  } = result;

  // --- Velocity Chart SVG ---
  const VelocityChart = () => {
      const height = 240;
      const width = 600;
      const margin = { top: 20, right: 20, bottom: 30, left: 40 };
      const chartW = width - margin.left - margin.right;
      const chartH = height - margin.top - margin.bottom;

      const maxDay = Math.max(1, runDays - 1); // X Axis Max
      // Y Axis Max: Find max rate in data, add buffer
      const maxRate = Math.max(
          ...velocityChart.map(p => Math.max(p.beforeRate, p.afterRate)), 
          0.05 // Min 5% scale
      ) * 1.1;

      const xScale = (d: number) => (d / maxDay) * chartW;
      const yScale = (r: number) => chartH - (r / maxRate) * chartH;

      const lineBefore = velocityChart.map(p => `${xScale(p.day)},${yScale(p.beforeRate)}`).join(' ');
      const lineAfter = velocityChart.map(p => `${xScale(p.day)},${yScale(p.afterRate)}`).join(' ');

      return (
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
              <g transform={`translate(${margin.left},${margin.top})`}>
                  {/* Grid */}
                  {[0, 0.25, 0.5, 0.75, 1].map(pct => (
                      <line 
                        key={pct} 
                        x1={0} x2={chartW} 
                        y1={yScale(maxRate * pct)} y2={yScale(maxRate * pct)} 
                        stroke="#f1f5f9" strokeWidth="1" 
                      />
                  ))}
                  {/* Y Axis Labels */}
                  {[0, 0.5, 1].map(pct => (
                      <text 
                        key={pct} 
                        x={-10} y={yScale(maxRate * pct) + 4} 
                        textAnchor="end" fontSize="10" fill="#94a3b8"
                      >
                          {formatPercent(maxRate * pct)}
                      </text>
                  ))}
                  
                  {/* Lines */}
                  {/* Before (Baseline) - Dashed Grey */}
                  <polyline 
                      points={lineBefore} 
                      fill="none" 
                      stroke="#94a3b8" 
                      strokeWidth="2" 
                      strokeDasharray="4 4" 
                  />
                  {/* After (Actual) - Solid Color */}
                  <polyline 
                      points={lineAfter} 
                      fill="none" 
                      stroke={isImproved ? "#10b981" : "#f43f5e"} 
                      strokeWidth="3" 
                      strokeLinecap="round" 
                      strokeLinejoin="round"
                  />
                  
                  {/* X Axis Labels */}
                  {[0, Math.floor(maxDay/2), maxDay].map(d => (
                      <text key={d} x={xScale(d)} y={chartH + 15} textAnchor="middle" fontSize="10" fill="#64748b">
                          Day {d}
                      </text>
                  ))}
              </g>
          </svg>
      );
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
        
        {/* 1. Fairness Header */}
        <div className="bg-slate-800 text-white px-6 py-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
                <div className="p-2 bg-white/10 rounded-lg backdrop-blur-sm border border-white/10">
                    <Scale className="w-5 h-5 text-indigo-300" />
                </div>
                <div>
                    <h2 className="text-lg font-bold flex items-center gap-2">
                        同口径实况对比 (Apples-to-Apples)
                        <span className="text-[10px] font-normal bg-indigo-500/30 px-2 py-0.5 rounded border border-indigo-400/30">Beta</span>
                    </h2>
                    <p className="text-slate-400 text-xs">
                        已锁定观测窗口：仅对比 T0 前后 <strong className="text-white">{runDays}</strong> 天内的实况表现 (T0 excluded)
                    </p>
                </div>
            </div>
            
            <div className="flex items-center gap-4 bg-slate-900/50 px-4 py-2 rounded-lg border border-slate-700">
                <div className="flex flex-col items-end">
                    <span className="text-[10px] text-slate-400 font-bold uppercase">Max Age Limit</span>
                    <span className="text-sm font-mono font-bold text-indigo-300">{runDays} Days</span>
                </div>
                <div className="h-6 w-px bg-slate-700"></div>
                <div className="flex flex-col items-end">
                    <span className="text-[10px] text-slate-400 font-bold uppercase">Current Date (S)</span>
                    <span className="text-sm font-mono font-bold text-white">{s}</span>
                </div>
                <div className="h-6 w-px bg-slate-700"></div>
                <div className="flex flex-col items-end">
                    <span className="text-[10px] text-slate-400 font-bold uppercase">Launch Date (T0)</span>
                    <span className="text-sm font-mono font-bold text-amber-400">{t0}</span>
                </div>
            </div>
        </div>

        <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* 2. Scorecard (Left) - 5 Cols */}
            <div className="lg:col-span-5 flex flex-col justify-center">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wider flex items-center gap-2">
                        <Lock className="w-4 h-4 text-slate-400" />
                        退货率核心对决 (Strict)
                    </h3>
                </div>

                <div className="bg-slate-50 rounded-2xl border border-slate-200 p-6 flex items-center justify-between relative overflow-hidden">
                    {/* Background VS Watermark */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-slate-200 text-6xl font-black italic select-none pointer-events-none opacity-50">
                        VS
                    </div>

                    {/* Before (Adjusted) */}
                    <div className="flex-1 flex flex-col items-center relative z-10 group">
                        <span className="text-2xl font-black text-slate-400 font-mono decoration-slate-300 group-hover:text-slate-500 transition-colors">
                            {formatPercent(before.rate)}
                        </span>
                        <div className="flex items-center gap-1 mt-1">
                            <span className="px-2 py-0.5 bg-slate-200 text-slate-500 text-[10px] font-bold rounded uppercase">
                                Before (Adj)
                            </span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-2 text-center max-w-[100px] leading-tight opacity-0 group-hover:opacity-100 transition-opacity absolute top-full">
                            已强制截断至 {runDays} 天
                        </p>
                    </div>

                    {/* Delta Badge - Now Relative */}
                    <div className="relative z-10 px-4">
                        <div className={`flex flex-col items-center justify-center w-16 h-16 rounded-2xl shadow-sm border-2 ${
                            isImproved 
                            ? 'bg-emerald-50 border-emerald-100' 
                            : 'bg-rose-50 border-rose-100'
                        }`}>
                            {isImproved ? (
                                <TrendingDown className="w-6 h-6 text-emerald-600 mb-0.5" />
                            ) : (
                                <TrendingUp className="w-6 h-6 text-rose-600 mb-0.5" />
                            )}
                            <span className={`text-xs font-black ${isImproved ? 'text-emerald-700' : 'text-rose-700'}`}>
                                {formatPercent(Math.abs(deltaRate))}
                            </span>
                            <span className={`text-[9px] font-medium leading-none mt-0.5 ${isImproved ? 'text-emerald-600' : 'text-rose-600'} opacity-80`}>
                                环比
                            </span>
                        </div>
                    </div>

                    {/* After (Real) */}
                    <div className="flex-1 flex flex-col items-center relative z-10">
                        <span className={`text-3xl font-black font-mono tracking-tight ${isImproved ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {formatPercent(after.rate)}
                        </span>
                        <div className="flex items-center gap-1 mt-1">
                            <span className={`px-2 py-0.5 text-[10px] font-bold rounded uppercase border ${
                                isImproved 
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-200' 
                                : 'bg-rose-100 text-rose-800 border-rose-200'
                            }`}>
                                After (Real)
                            </span>
                        </div>
                    </div>
                </div>

                {/* Verdict Text */}
                <div className={`mt-4 p-4 rounded-xl text-sm leading-relaxed flex items-start gap-3 ${
                    isImproved ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'
                }`}>
                    <div className={`shrink-0 mt-0.5 p-1 rounded-full ${isImproved ? 'bg-emerald-200/50' : 'bg-rose-200/50'}`}>
                        {isImproved ? <TrendingDown className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                    </div>
                    <div>
                        <span className="font-bold block mb-1">{isImproved ? '初战告捷：退货率显降' : '警报：退货率未改善或恶化'}</span>
                        <span className="opacity-90">
                            在严格对齐 <strong>{runDays}天</strong> 观察窗口 (不含T0) 的情况下，新款表现
                            {isImproved ? '优于' : '劣于'}老款 
                            <strong> {formatPercent(Math.abs(deltaRate))} (环比)</strong>。
                            {isImproved 
                             ? '说明近期优化措施在订单初期已产生正面效果。' 
                             : '说明初期爆发速度极快，需立即排查产品质量或Listing描述。'
                            }
                        </span>
                    </div>
                </div>
            </div>

            {/* 3. Velocity Chart (Right) - 7 Cols */}
            <div className="lg:col-span-7 flex flex-col">
                 <div className="flex items-center justify-between mb-4">
                     <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wider flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-slate-400" />
                        累积退货速度曲线 (Return Velocity)
                     </h3>
                     <div className="flex items-center gap-3 text-[10px]">
                         <div className="flex items-center gap-1.5">
                             <div className="w-4 h-0.5 bg-slate-400 border-t border-dashed border-slate-300"></div>
                             <span className="text-slate-500">Before (Adj)</span>
                         </div>
                         <div className="flex items-center gap-1.5">
                             <div className={`w-4 h-1 rounded-full ${isImproved ? 'bg-emerald-500' : 'bg-rose-500'}`}></div>
                             <span className="text-slate-700 font-bold">After (Real)</span>
                         </div>
                     </div>
                 </div>
                 <div className="flex-1 bg-white border border-slate-100 rounded-xl p-4 shadow-inner min-h-[200px]">
                     <VelocityChart />
                 </div>
                 <p className="text-[10px] text-slate-400 mt-2 text-right">
                    * X轴：下单后天数 (0-{runDays}) &nbsp;|&nbsp; Y轴：该节点的累积退货率
                 </p>
            </div>
        </div>

        {/* 4. Daily Breakdown Toggle */}
        <div className="border-t border-slate-200">
            <details className="group">
                <summary className="flex items-center justify-between px-6 py-3 cursor-pointer hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-2 text-sm font-bold text-slate-600">
                        <Calendar className="w-4 h-4" />
                        查看每日同口径明细 (Daily Cohort Data)
                    </div>
                    <div className="text-xs text-slate-400 group-open:rotate-180 transition-transform">
                        ▼
                    </div>
                </summary>

                {/* Guide Section */}
                <div className="px-6 py-4 bg-slate-50 border-b border-slate-100">
                   <div className="bg-white border border-indigo-100 rounded-lg p-5 shadow-sm">
                      <h4 className="font-bold text-slate-800 text-sm mb-4 flex items-center gap-2">
                         <Info className="w-4 h-4 text-indigo-500" />
                         解读指南：这不是流水账，而是一场“同龄赛马”
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-xs leading-relaxed text-slate-600">
                          <div>
                              <strong className="block text-slate-900 mb-2 bg-indigo-50 px-2 py-1 rounded w-fit text-[11px] border border-indigo-100">1. 核心机制</strong>
                              <p className="mb-2">
                                <strong className="text-indigo-700">🔍 Age Limit (公平锁)</strong>
                              </p>
                              <p>代表“这批新款卖出去几天了”。为了公平，系统强制<strong>把老款(Before)的历史数据也“回滚”到这一天</strong>。多一秒的退货都不算。</p>
                          </div>
                          <div>
                              <strong className="block text-slate-900 mb-2 bg-indigo-50 px-2 py-1 rounded w-fit text-[11px] border border-indigo-100">2. 数据特征</strong>
                              <p className="mb-2">
                                <strong className="text-indigo-700">📉 Before Returns (Adj)</strong>
                              </p>
                              <p>这是<strong>被截断后</strong>的模拟数据，而非老款最终的真实退货量。所以它通常比您印象中的数值要低，这说明算法生效了（消除了时间优势）。</p>
                          </div>
                          <div>
                              <strong className="block text-slate-900 mb-2 bg-indigo-50 px-2 py-1 rounded w-fit text-[11px] border border-indigo-100">3. 诊断技巧</strong>
                              <p className="mb-2">
                                <strong className="text-indigo-700">🩺 如何看 Gap?</strong>
                              </p>
                              <ul className="space-y-1.5 opacity-90">
                                  <li className="flex items-start gap-1.5">
                                      <span className="font-semibold min-w-[60px]">Age &lt; 3天:</span> 
                                      <span>飙红代表“到手即退” (破损/发错)</span>
                                  </li>
                                  <li className="flex items-start gap-1.5">
                                      <span className="font-semibold min-w-[60px]">Age ≈ 7天:</span> 
                                      <span>飙红代表早期体验差 (易断/难用)</span>
                                  </li>
                              </ul>
                          </div>
                      </div>

                      {/* NEW: Concrete Examples (Redesigned) */}
                      <div className="mt-8 pt-6 border-t border-slate-100">
                        <h5 className="font-bold text-slate-800 text-xs mb-4 flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                            场景举例 (Case Study)
                        </h5>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            
                            {/* Case A: Acute Issue (Rose/Red) */}
                            <div className="group relative bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
                                {/* Header */}
                                <div className="px-4 py-3 bg-rose-50 border-b border-rose-100 flex justify-between items-center relative z-10">
                                    <div className="flex items-center gap-2 text-rose-900 font-bold text-sm">
                                        <PackageX className="w-4 h-4 text-rose-600" />
                                        场景 A: Age Limit ≤ 5 Days
                                    </div>
                                    <span className="px-2 py-0.5 bg-white/60 text-rose-700 text-[10px] font-bold rounded border border-rose-200/50 backdrop-blur-sm">
                                        到手即退期
                                    </span>
                                </div>
                                {/* Body */}
                                <div className="p-5 relative z-10">
                                    <p className="text-slate-600 text-xs mb-4 leading-relaxed opacity-90">
                                        刚发货几天，系统强制把老款数据也“切”到只卖出 5 天的状态。
                                    </p>
                                    
                                    {/* Visual Bar Chart */}
                                    <div className="space-y-3 mb-5">
                                        <div className="flex items-center text-xs">
                                            <span className="w-16 text-slate-400 font-medium shrink-0 text-[10px] uppercase">Before</span>
                                            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden mx-2">
                                                <div className="h-full bg-slate-300 w-[10%] rounded-full"></div>
                                            </div>
                                            <span className="w-10 text-right font-mono text-slate-500">0.2%</span>
                                        </div>
                                        <div className="flex items-center text-xs">
                                            <span className="w-16 text-rose-700 font-bold shrink-0 text-[10px] uppercase">After</span>
                                            <div className="flex-1 h-2 bg-rose-50 rounded-full overflow-hidden mx-2">
                                                <div className="h-full bg-rose-500 w-[75%] rounded-full shadow-[0_0_8px_rgba(244,63,94,0.4)]"></div>
                                            </div>
                                            <span className="w-10 text-right font-mono text-rose-600 font-bold">1.5%</span>
                                        </div>
                                    </div>

                                    {/* Diagnosis Box */}
                                    <div className="bg-rose-50/50 rounded-lg p-3 border border-rose-100 text-xs text-rose-900 leading-relaxed flex gap-2">
                                        <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                                        <div>
                                            <span className="font-bold">诊断：</span> 
                                            Gap 飙红意味着严重的<strong>包装破损、发错货或货不对板</strong>。
                                        </div>
                                    </div>
                                </div>
                                {/* Watermark */}
                                <PackageX className="absolute bottom-[-15px] right-[-15px] w-28 h-28 text-rose-500/5 rotate-[-15deg] pointer-events-none" />
                            </div>

                            {/* Case B: Chronic Issue (Indigo/Blue) */}
                            <div className="group relative bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
                                {/* Header */}
                                <div className="px-4 py-3 bg-indigo-50 border-b border-indigo-100 flex justify-between items-center relative z-10">
                                    <div className="flex items-center gap-2 text-indigo-900 font-bold text-sm">
                                        <Microscope className="w-4 h-4 text-indigo-600" />
                                        场景 B: Age Limit ≤ 14 Days
                                    </div>
                                    <span className="px-2 py-0.5 bg-white/60 text-indigo-700 text-[10px] font-bold rounded border border-indigo-200/50 backdrop-blur-sm">
                                        早期使用期
                                    </span>
                                </div>
                                {/* Body */}
                                <div className="p-5 relative z-10">
                                    <p className="text-slate-600 text-xs mb-4 leading-relaxed opacity-90">
                                        刚过 P50 周期。老款终值虽高 (5%)，但在同等窗口下，也只跑出了一半数据。
                                    </p>
                                    
                                    {/* Visual Bar Chart */}
                                    <div className="space-y-3 mb-5">
                                        <div className="flex items-center text-xs">
                                            <span className="w-16 text-slate-400 font-medium shrink-0 text-[10px] uppercase">Before</span>
                                            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden mx-2 relative group/bar">
                                                <div className="h-full bg-slate-300 w-[50%] rounded-full"></div>
                                                {/* Ghost bar indicating final potential */}
                                                <div className="absolute top-0 left-[50%] h-full w-[50%] bg-slate-200 opacity-50 border-l border-white"></div>
                                            </div>
                                            <span className="w-10 text-right font-mono text-slate-500">2.5%</span>
                                        </div>
                                        <div className="flex items-center text-xs">
                                            <span className="w-16 text-indigo-700 font-bold shrink-0 text-[10px] uppercase">After</span>
                                            <div className="flex-1 h-2 bg-indigo-50 rounded-full overflow-hidden mx-2">
                                                <div className="h-full bg-indigo-500 w-[60%] rounded-full shadow-[0_0_8px_rgba(99,102,241,0.4)]"></div>
                                            </div>
                                            <span className="w-10 text-right font-mono text-indigo-600 font-bold">3.0%</span>
                                        </div>
                                    </div>

                                    {/* Diagnosis Box */}
                                    <div className="bg-indigo-50/50 rounded-lg p-3 border border-indigo-100 text-xs text-indigo-900 leading-relaxed flex gap-2">
                                        <Info className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />
                                        <div>
                                            <span className="font-bold">诊断：</span> 
                                            切勿用 After(3%) 对比 Old Final(5%) 误判为改善。同口径下(3% &gt; 2.5%) 实则<strong>性能恶化</strong>。
                                        </div>
                                    </div>
                                </div>
                                {/* Watermark */}
                                <Microscope className="absolute bottom-[-15px] right-[-15px] w-28 h-28 text-indigo-500/5 rotate-[-15deg] pointer-events-none" />
                            </div>

                        </div>
                      </div>
                   </div>
                </div>

                <div className="p-0 overflow-x-auto">
                    <table className="w-full text-sm text-left border-collapse">
                        <thead className="bg-slate-50 text-xs uppercase text-slate-500 border-b border-slate-200">
                            <tr>
                                <th className="px-6 py-3 font-semibold">After Date</th>
                                <th className="px-6 py-3 font-semibold text-slate-400">Matched Before</th>
                                <th className="px-6 py-3 font-semibold w-32">Age Limit</th>
                                <th className="px-6 py-3 text-right">After Returns</th>
                                <th className="px-6 py-3 text-right text-slate-400 border-l border-slate-100">Before Returns (Adj)</th>
                                <th className="px-6 py-3 text-right">Gap (pp)</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {dailyBreakdown.map((row, idx) => {
                                const rowRateA = row.sales > 0 ? row.returns / row.sales : 0;
                                const rowRateB = row.refSales > 0 ? row.refReturns / row.refSales : 0;
                                // Gap remains absolute for daily rows to avoid confusing infinity issues with small sample sizes
                                const rowDelta = rowRateA - rowRateB;
                                
                                let gapColor = 'text-slate-400';
                                if (rowDelta > 0.000001) gapColor = 'text-rose-600';
                                else if (rowDelta < -0.000001) gapColor = 'text-emerald-600';

                                return (
                                    <tr key={idx} className="hover:bg-slate-50/50">
                                        <td className="px-6 py-3 font-mono text-slate-700">{row.date}</td>
                                        <td className="px-6 py-3 font-mono text-slate-400">{row.matchedDate}</td>
                                        <td className="px-6 py-3">
                                            <span className="inline-flex items-center px-2 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px] font-mono">
                                                ≤ {row.ageLimit} days
                                            </span>
                                        </td>
                                        <td className="px-6 py-3 text-right font-mono">
                                            <span className="font-bold text-slate-700">{row.returns}</span>
                                            <span className="text-xs text-slate-400 mx-1">/</span>
                                            <span className="text-xs text-slate-400">{formatNumber(row.sales)}</span>
                                        </td>
                                        <td className="px-6 py-3 text-right font-mono text-slate-400 border-l border-slate-100 bg-slate-50/30">
                                            <span className="font-bold">{row.refReturns}</span>
                                            <span className="text-xs opacity-70 mx-1">/</span>
                                            <span className="text-xs opacity-70">{formatNumber(row.refSales)}</span>
                                        </td>
                                        <td className={`px-6 py-3 text-right font-mono font-bold text-xs ${gapColor}`}>
                                            {formatPercent(rowDelta)}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </details>
        </div>
    </div>
  );
};
