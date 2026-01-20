import React from 'react';
import { ArrowRight, TrendingUp, TrendingDown, RefreshCcw, AlertTriangle, ArrowDown, X } from 'lucide-react';
import { formatPercent } from '../utils/formatters';

interface AsinContrastCardProps {
    asin: string;
    beforeNode?: any;
    afterNode?: any;
    beforeReasons?: any;
    afterReasons?: any;
}

export const AsinContrastCard: React.FC<AsinContrastCardProps> = ({ 
    asin, 
    beforeNode, 
    afterNode, 
    beforeReasons, 
    afterReasons
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
    // 5. Sort by After Percentage Descending
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
           </div>

           {/* Metrics & Reason Table */}
           <div className="p-5 flex flex-col gap-5">
                
                {/* Metrics Column - Horizontal Layout with Center Delta */}
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

                {/* Reasons Column */}
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
};