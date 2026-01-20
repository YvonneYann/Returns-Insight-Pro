
import React, { useState, useCallback } from 'react';
import { UploadCloud, FileJson, Check, AlertCircle, Sparkles, BarChart3, LineChart, PieChart, FileText, StickyNote, RefreshCcw, ArrowLeft, ArrowRight, Clock, History, ShoppingCart, Hourglass, Calendar, ArrowLeftRight } from 'lucide-react';
import { AppData, ComparisonData, ReportMode, RawOrderRow } from '../types';

interface FileUploadProps {
  mode: ReportMode | null;
  setMode: (mode: ReportMode | null) => void;
  onDataLoaded: (data: AppData | ComparisonData) => void;
}

// Initial empty state for AppData
const initialAppData: AppData = {
  structure: null,
  summary: null,
  reasons: null,
  explanations: null,
  listing: null,
  return_order: null,
  t0Date: null,
  comparisonSpan: 30
};

const initialFilesStatus = {
  structure: false,
  summary: false,
  reasons: false,
  explanations: false,
  listing: false,
  return_order: false
};

export const FileUpload: React.FC<FileUploadProps> = ({ mode, setMode, onDataLoaded }) => {
  // Return Window Mode State (Used for 'return', 'purchase', and 'maturity')
  const [returnFilesStatus, setReturnFilesStatus] = useState(initialFilesStatus);
  const [returnTempData, setReturnTempData] = useState<AppData>(initialAppData);
  const [t0Date, setT0Date] = useState<string>(''); // Local state for input
  const [comparisonSpan, setComparisonSpan] = useState<number>(30); // Default 30 days

  // Cycle Mode State
  const [cycleFilesStatus, setCycleFilesStatus] = useState({
    before: { ...initialFilesStatus },
    after: { ...initialFilesStatus },
  });
  const [cycleTempData, setCycleTempData] = useState<ComparisonData>({
    before: { ...initialAppData },
    after: { ...initialAppData },
  });

  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Helper: Normalize data to ensure it has the correct wrapper object and standard keys
  const normalizeData = (type: keyof AppData, json: any) => {
    // 1. Handle "summary" specifically: It expects an object, but input might be an array
    if (type === 'summary') {
      let summaryObj = json.parent_summary || 
                       json.parent_summary_before || 
                       json.parent_summary_after || 
                       json.parent_summary_return_window || 
                       json.parent_summary_purchase_window ||
                       json;
      if (Array.isArray(summaryObj)) {
        summaryObj = summaryObj[0];
      }
      return { parent_summary: summaryObj };
    }

    // 2. Handle specific suffixed keys mapping
    if (type === 'structure') {
      const content = json.asin_structure || 
                      json.asin_structure_before || 
                      json.asin_structure_after || 
                      json.asin_structure_return_window || 
                      json.asin_structure_purchase_window ||
                      json;
      return { asin_structure: Array.isArray(content) ? content : [] };
    }

    if (type === 'reasons') {
      const content = json.problem_asin_reasons || 
                      json.problem_asin_reasons_before || 
                      json.problem_asin_reasons_after || 
                      json.problem_asin_reasons_return_window || 
                      json.problem_asin_reasons_purchase_window ||
                      json;
      return { problem_asin_reasons: Array.isArray(content) ? content : [] };
    }

    if (type === 'listing') {
      const content = json.problem_asin_listing || 
                      json.problem_asin_listing_before || 
                      json.problem_asin_listing_after || 
                      json.problem_asin_listing_return_window || 
                      json.problem_asin_listing_purchase_window ||
                      json;
      return { problem_asin_listing: Array.isArray(content) ? content : [] };
    }

    if (type === 'explanations') {
      const exp = json.reason_explanations || 
                  json.reason_explanations_before || 
                  json.reason_explanations_after || 
                  json.reason_explanations_return_window ||
                  json.reason_explanations_purchase_window;
                  
      const ev = json.evidence || 
                 json.evidence_before || 
                 json.evidence_after || 
                 json.evidence_return_window ||
                 json.evidence_purchase_window;
      
      const result: any = {};
      if (exp) result.reason_explanations = Array.isArray(exp) ? exp : [];
      if (ev) result.evidence = Array.isArray(ev) ? ev : [];
      if (!exp && !ev && Array.isArray(json)) {
         result.evidence = json;
      }
      return result;
    }

    if (type === 'return_order') {
       // Expecting an array of RawOrderRow
       // Or { return_order: [...] }
       const content = json.return_order || json.orders || json;
       return Array.isArray(content) ? content : [];
    }
    
    return json;
  };

  const determineFileType = (json: any, fileName: string): keyof AppData | null => {
    const name = fileName.toLowerCase();
    const keys = Object.keys(json);
    
    // Check for array root (could be return_order or evidence)
    if (Array.isArray(json) && json.length > 0) {
        const first = json[0];
        if (first.purchase_date && first.asin) return 'return_order';
        if (first.explanation || first.evidence) return 'explanations';
    }

    // 1. Key-based detection
    if (keys.some(k => k.includes('asin_structure'))) return 'structure';
    if (keys.some(k => k.includes('parent_summary'))) return 'summary';
    if (keys.some(k => k.includes('problem_asin_reasons'))) return 'reasons';
    if (keys.some(k => k.includes('reason_explanations') || k.includes('evidence'))) return 'explanations';
    if (keys.some(k => k.includes('problem_asin_listing'))) return 'listing';
    if (keys.some(k => k.includes('return_order'))) return 'return_order';

    // 2. Filename-based detection
    if (name.includes('structure')) return 'structure';
    if (name.includes('summary')) return 'summary';
    if (name.includes('reasons')) return 'reasons';
    if (name.includes('explanations') || name.includes('evidence')) return 'explanations';
    if (name.includes('listing')) return 'listing';
    if (name.includes('return_order') || name.includes('order')) return 'return_order';

    return null;
  };

  const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const files = event.target.files;
    if (!files) return;

    // --- LOGIC FOR SINGLE DATASET MODES (Return, Purchase, Maturity) ---
    if (mode === 'return' || mode === 'purchase' || mode === 'maturity') {
      const newTempData = { ...returnTempData };
      const newStatus = { ...returnFilesStatus };

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          const text = await file.text();
          const json = JSON.parse(text);
          const type = determineFileType(json, file.name);

          if (type) {
            // @ts-ignore
            newTempData[type] = normalizeData(type, json);
            // @ts-ignore
            newStatus[type] = true;
          }
        } catch (e) {
          console.error("Error parsing file", file.name, e);
          setError(`解析 "${file.name}" 失败，请确保文件内容为有效的 JSON 格式。`);
        }
      }
      setReturnTempData(newTempData);
      setReturnFilesStatus(newStatus);
    } 
    // --- LOGIC FOR CYCLE MODE ---
    else if (mode === 'cycle') {
      const newCycleData = { ...cycleTempData };
      const newCycleStatus = { ...cycleFilesStatus };
      
      let hasError = false;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileName = file.name.toLowerCase();
        let side: 'before' | 'after' | null = null;

        if (fileName.includes('before')) side = 'before';
        else if (fileName.includes('after')) side = 'after';

        if (!side) continue;

        try {
          const text = await file.text();
          const json = JSON.parse(text);
          const type = determineFileType(json, file.name);

          if (type) {
            // @ts-ignore
            newCycleData[side][type] = normalizeData(type, json);
            // @ts-ignore
            newCycleStatus[side][type] = true;
          }
        } catch (e) {
          console.error("Error parsing file", file.name, e);
          setError(`解析 "${file.name}" 失败。`);
          hasError = true;
        }
      }
      
      setCycleTempData(newCycleData);
      setCycleFilesStatus(newCycleStatus);
      if (!hasError) setError(null);
    }

    setIsDragging(false);
  }, [mode, returnTempData, returnFilesStatus, cycleTempData, cycleFilesStatus]);

  const handleGenerateReport = () => {
    if (mode === 'maturity') {
       if (!returnTempData.return_order || !t0Date) {
           setError("请上传包含订单明细 (return_order) 的 JSON 文件，并选择改动上线日期 (T0)。");
           return;
       }
       // Inject T0 and Span into data
       onDataLoaded({ ...returnTempData, t0Date, comparisonSpan });
    }
    else if (mode === 'return' || mode === 'purchase') {
      if (!returnTempData.structure || !returnTempData.summary || !returnTempData.reasons || !returnTempData.explanations || !returnTempData.listing) {
        setError("请上传全部 5 个必需的 JSON 文件以生成报告。");
        return;
      }
      onDataLoaded(returnTempData);
    } else if (mode === 'cycle') {
      const beforeComplete = Object.values(cycleFilesStatus.before).every((v, i) => i < 5 ? v : true); // Check first 5 (ignore return_order)
      const afterComplete = Object.values(cycleFilesStatus.after).every((v, i) => i < 5 ? v : true);

      // Relaxed check for cycle, only need 5 basic files each side
      const basicFiles = ['summary', 'structure', 'reasons', 'explanations', 'listing'];
      const isReadyBefore = basicFiles.every(k => cycleFilesStatus.before[k as keyof typeof cycleFilesStatus.before]);
      const isReadyAfter = basicFiles.every(k => cycleFilesStatus.after[k as keyof typeof cycleFilesStatus.after]);

      if (!isReadyBefore || !isReadyAfter) {
         setError("请上传全部 10 个必需的文件（调整前5个 + 调整后5个）。");
         return;
      }
      onDataLoaded(cycleTempData);
    }
  };

  // Progress Calculation
  let completedCount = 0;
  let totalRequired = 0;
  
  if (mode === 'return' || mode === 'purchase') {
    completedCount = Object.entries(returnFilesStatus).filter(([k, v]) => k !== 'return_order' && v).length;
    totalRequired = 5;
  } else if (mode === 'maturity') {
      // For maturity, we mainly need 'return_order' and T0 date
      completedCount = (returnFilesStatus.return_order ? 1 : 0) + (t0Date ? 1 : 0);
      totalRequired = 2;
  } else if (mode === 'cycle') {
    const basicFiles = ['summary', 'structure', 'reasons', 'explanations', 'listing'];
    completedCount = basicFiles.filter(k => cycleFilesStatus.before[k as keyof typeof cycleFilesStatus.before]).length + 
                     basicFiles.filter(k => cycleFilesStatus.after[k as keyof typeof cycleFilesStatus.after]).length;
    totalRequired = 10;
  }
  
  const progressPercentage = Math.min((completedCount / totalRequired) * 100, 100);

  // Determine subtext based on mode
  const getSubtext = (base: string) => {
      if (mode === 'purchase') return `${base} / *_purchase_window`;
      return `${base} / *_return_window`;
  };

  const fileRequirements = [
    { key: 'summary', label: '父体汇总', sub: getSubtext('summary'), icon: BarChart3 },
    { key: 'structure', label: 'ASIN 结构', sub: getSubtext('structure'), icon: FileJson },
    { key: 'reasons', label: '退货原因', sub: getSubtext('reasons'), icon: AlertCircle },
    { key: 'explanations', label: '反馈依据', sub: getSubtext('evidence'), icon: Sparkles },
    { key: 'listing', label: 'Listing详情', sub: getSubtext('listing'), icon: StickyNote },
  ];

  return (
    <div className="flex min-h-screen w-full bg-white font-sans text-slate-900">
      {/* Left Panel - Branding & Visuals */}
      <div className="hidden lg:flex lg:w-5/12 bg-slate-900 relative flex-col justify-start gap-8 p-12 text-white overflow-hidden overflow-y-auto scrollbar-hide">
        {/* Background Gradients */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-600/30 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-purple-600/20 rounded-full blur-[100px] translate-y-1/2 -translate-x-1/2 pointer-events-none"></div>
        
        {/* Content */}
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-8">
            <div className="bg-indigo-500/20 p-2 rounded-lg backdrop-blur-sm border border-indigo-500/30">
               <BarChart3 className="w-6 h-6 text-indigo-400" />
            </div>
            <span className="font-bold text-xl tracking-tight">Returns Insight Pro</span>
          </div>
          
          <h1 className="text-4xl xl:text-5xl font-extrabold leading-tight mb-6">
            Unlock the Power of <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">
              Return Data
            </span>
          </h1>
          
          <p className="text-slate-400 text-lg max-w-md leading-relaxed">
            将复杂的亚马逊退货数据转化为清晰的行动指南。自动识别异常 ASIN，深度拆解退货归因，一键生成专业诊断报告。
          </p>
        </div>

        {/* Feature List */}
        <div className="relative z-10 space-y-6 mt-8">
           <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center flex-shrink-0 border border-slate-700">
                <LineChart className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h3 className="font-bold text-lg">结构化分析</h3>
                <p className="text-slate-400 text-sm">自动划分“主战场”、“问题款”与“观察对象”，精准锁定优化重心。</p>
              </div>
           </div>
           
           <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center flex-shrink-0 border border-slate-700">
                <Hourglass className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h3 className="font-bold text-lg">退货率优化成效评估</h3>
                <p className="text-slate-400 text-sm">基于历史趋势，通过‘同口径对比’验证实况，利用‘滞后模型’推演终值，消除时间差干扰，辅助全周期决策。</p>
              </div>
           </div>

           <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center flex-shrink-0 border border-slate-700">
                <FileText className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h3 className="font-bold text-lg">一键 PDF 报告</h3>
                <p className="text-slate-400 text-sm">生成符合 BI 标准的分析报告，支持 A4 打印与离线分享。</p>
              </div>
           </div>
        </div>
      </div>

      {/* Right Panel - Interaction */}
      <div className="w-full lg:w-7/12 bg-slate-50 flex flex-col relative overflow-hidden">
        
        {/* Background Decorations */}
        <div className="absolute inset-0 pointer-events-none">
           <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] bg-indigo-200/20 rounded-full blur-[100px]"></div>
           <div className="absolute bottom-[-20%] left-[-10%] w-[500px] h-[500px] bg-purple-200/20 rounded-full blur-[100px]"></div>
           <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,#000_70%,transparent_100%)]"></div>
        </div>
        
        {/* Mode Selection Screen */}
        {!mode ? (
           <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-12 animate-in fade-in slide-in-from-right-8 duration-500 relative z-10 overflow-y-auto">
              <div className="w-full max-w-2xl bg-white/80 backdrop-blur-sm p-8 rounded-3xl border border-white/60 shadow-xl shadow-slate-200/50">
                <div className="mb-8 text-center">
                    <div className="inline-flex items-center justify-center p-3 bg-indigo-50 rounded-xl mb-4 text-indigo-600 ring-1 ring-indigo-100">
                        <Sparkles className="w-6 h-6" />
                    </div>
                    <h2 className="text-3xl font-extrabold text-slate-800 mb-3 tracking-tight">开始新的分析</h2>
                    <p className="text-slate-500 text-base">请选择适合您当前业务场景的数据分析模式</p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Return Window Mode */}
                  <button 
                    onClick={() => setMode('return')}
                    className="group relative p-5 bg-white border border-slate-200 rounded-xl hover:border-indigo-500 hover:shadow-md transition-all duration-300 text-left"
                  >
                     <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center mb-4 group-hover:bg-indigo-600 transition-colors duration-300 border border-indigo-100/50">
                        <BarChart3 className="w-5 h-5 text-indigo-600 group-hover:text-white transition-colors" />
                     </div>
                     <h3 className="font-bold text-slate-800 mb-1">退货窗口分析（Return Window）</h3>
                     <p className="text-slate-500 text-xs leading-relaxed">基于退货发生日统计，快速诊断当前退货率、原因分布与异常ASIN。</p>
                  </button>

                  {/* Purchase Window Mode */}
                  <button 
                    onClick={() => setMode('purchase')}
                    className="group relative p-5 bg-white border border-slate-200 rounded-xl hover:border-sky-500 hover:shadow-md transition-all duration-300 text-left"
                  >
                     <div className="w-10 h-10 rounded-lg bg-sky-50 flex items-center justify-center mb-4 group-hover:bg-sky-600 transition-colors duration-300 border border-sky-100/50">
                        <ShoppingCart className="w-5 h-5 text-sky-600 group-hover:text-white transition-colors" />
                     </div>
                     <h3 className="font-bold text-slate-800 mb-1">下单归因分析（Purchase Window）</h3>
                     <p className="text-slate-500 text-xs leading-relaxed">基于下单日期回溯，精准分析特定销售批次或时间段的最终退货表现。</p>
                  </button>

                  {/* Cycle Mode */}
                  <button 
                    onClick={() => setMode('cycle')}
                    className="group relative p-5 bg-white border border-slate-200 rounded-xl hover:border-purple-500 hover:shadow-md transition-all duration-300 text-left"
                  >
                     <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center mb-4 group-hover:bg-purple-600 transition-colors duration-300 border border-purple-100/50">
                        <RefreshCcw className="w-5 h-5 text-purple-600 group-hover:text-white transition-colors" />
                     </div>
                     <h3 className="font-bold text-slate-800 mb-1">退货周期归因（A/B Test）</h3>
                     <p className="text-slate-500 text-xs leading-relaxed">通过Before/After对比分析，验证Listing优化或产品改良的实际效果。</p>
                  </button>

                  {/* Maturity Mode (NEW) */}
                  <button 
                    onClick={() => setMode('maturity')}
                    className="group relative p-5 bg-white border border-slate-200 rounded-xl hover:border-amber-500 hover:shadow-md transition-all duration-300 text-left"
                  >
                     <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center mb-4 group-hover:bg-amber-500 transition-colors duration-300 border border-amber-100/50">
                        <Hourglass className="w-5 h-5 text-amber-600 group-hover:text-white transition-colors" />
                     </div>
                     <h3 className="font-bold text-slate-800 mb-1">退货率优化成效评估（Return Rate Optimization Assessment）</h3>
                     <p className="text-slate-500 text-xs leading-relaxed">基于历史趋势，通过‘同口径对比’验证实况，利用‘滞后模型’推演终值，消除时间差干扰，辅助全周期决策。</p>
                  </button>
                </div>

                <div className="mt-8 pt-6 border-t border-slate-100 text-center">
                    <p className="text-xs text-slate-400 font-medium">支持拖拽上传 JSON 数据源 • 自动生成可视化报告</p>
                </div>
              </div>
           </div>
        ) : (
          /* Upload Screen */
          <div className="flex-1 flex flex-col items-center justify-start p-6 pt-10 md:p-12 md:pt-20 lg:p-24 lg:pt-20 animate-in fade-in slide-in-from-right-8 duration-500 overflow-y-auto relative z-10">
             <div className="w-full max-w-3xl">
                <button 
                  onClick={() => {
                    setMode(null);
                    setError(null);
                    setReturnFilesStatus(initialFilesStatus);
                    setReturnTempData(initialAppData);
                    setT0Date('');
                    setComparisonSpan(30);
                  }}
                  className="mb-6 flex items-center text-slate-400 hover:text-indigo-600 transition-colors text-sm font-medium"
                >
                  <ArrowLeft className="w-4 h-4 mr-1" />
                  返回模式选择
                </button>

                <div className="mb-8">
                   <div className="flex items-center gap-3 mb-2">
                      <div className={`p-2 rounded-lg ${
                          mode === 'return' ? 'bg-indigo-100 text-indigo-600' : 
                          mode === 'purchase' ? 'bg-sky-100 text-sky-600' :
                          mode === 'maturity' ? 'bg-amber-100 text-amber-600' :
                          'bg-purple-100 text-purple-600'
                      }`}>
                         {mode === 'return' && <BarChart3 className="w-5 h-5" />}
                         {mode === 'purchase' && <ShoppingCart className="w-5 h-5" />}
                         {mode === 'cycle' && <RefreshCcw className="w-5 h-5" />}
                         {mode === 'maturity' && <Hourglass className="w-5 h-5" />}
                      </div>
                      <h2 className="text-3xl font-bold text-slate-800">
                        {mode === 'maturity' ? '退货率优化成效评估' : '导入分析数据'}
                      </h2>
                   </div>
                   <p className="text-slate-500">
                      {mode === 'maturity' 
                         ? '请上传包含 return_order 的 JSON 文件，并设定改动上线日 (T0)。' 
                         : (mode === 'cycle' 
                            ? '请上传包含 before 和 after 后缀的对照文件（共10个）。'
                            : '请上传 5 份必需的 JSON 数据源以开始分析。')
                      }
                   </p>
                </div>

                {/* Date Picker for Maturity Mode */}
                {mode === 'maturity' && (
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
                    {/* T0 Date Input */}
                    <div className="md:col-span-3 bg-amber-50 border border-amber-200 rounded-xl p-5 flex flex-col justify-center shadow-sm relative overflow-hidden">
                        <label className="block text-sm font-bold text-amber-900 mb-2 z-10">
                            改动上线日 (T0)
                        </label>
                        <div className="relative z-10">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-amber-600 pointer-events-none" />
                            <input 
                                type="date" 
                                value={t0Date}
                                onChange={(e) => setT0Date(e.target.value)}
                                className="pl-10 pr-4 py-3 rounded-lg border border-amber-300 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none w-full shadow-sm text-slate-700 font-medium bg-white"
                            />
                        </div>
                    </div>

                    {/* Comparison Span Input */}
                    <div className="md:col-span-2 bg-slate-50 border border-slate-200 rounded-xl p-5 flex flex-col justify-center shadow-sm relative overflow-hidden">
                         <label className="block text-sm font-bold text-slate-700 mb-2 z-10">
                            对比周期 (Days)
                        </label>
                        <div className="relative z-10">
                            <ArrowLeftRight className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
                            <input 
                                type="number" 
                                min="1"
                                max="180"
                                value={comparisonSpan}
                                onChange={(e) => setComparisonSpan(Number(e.target.value))}
                                className="pl-10 pr-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none w-full shadow-sm text-slate-700 font-medium bg-white"
                            />
                        </div>
                         <p className="text-[10px] text-slate-400 mt-2 z-10">
                             对比 T0 前后 {comparisonSpan} 天的数据表现
                         </p>
                    </div>
                  </div>
                )}

                {/* Upload Zone */}
                <div 
                  className={`relative group w-full aspect-[4/1] md:aspect-[5/1] rounded-2xl border-2 border-dashed transition-all duration-300 ease-in-out mb-8 flex flex-col items-center justify-center cursor-pointer overflow-hidden
                    ${isDragging 
                      ? 'border-indigo-500 bg-indigo-50/50' 
                      : 'border-slate-300 bg-white/80 hover:border-indigo-400 hover:bg-slate-50/50'
                    }`}
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => { e.preventDefault(); setIsDragging(false); }}
                >
                  <input 
                    type="file" 
                    multiple 
                    accept=".json"
                    onChange={handleFileChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                  />
                  
                  <div className="relative z-10 flex flex-col items-center pointer-events-none">
                     <div className={`p-3 rounded-full bg-slate-100 mb-3 transition-transform duration-300 ${isDragging ? 'scale-110 bg-indigo-100 text-indigo-600' : 'text-slate-400 group-hover:text-indigo-50'}`}>
                        <UploadCloud className="w-8 h-8" />
                     </div>
                     <p className="text-base font-semibold text-slate-700">点击上传 或 拖拽所有文件到此处</p>
                     <p className="text-xs text-slate-400 mt-1">
                        {mode === 'maturity' 
                            ? '支持包含 return_order 的 JSON 文件'
                            : (mode === 'cycle' ? '请同时拖入调整前 (before) 和调整后 (after) 的文件' : '支持 standard JSON structure')
                        }
                     </p>
                  </div>
                </div>

                {/* File Status Grid */}
                {mode === 'maturity' ? (
                     <div className="flex items-center p-4 rounded-xl border transition-all duration-300 bg-white border-amber-200 shadow-sm ring-1 ring-amber-500/10 mb-8">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center mr-3 shrink-0 ${
                          returnFilesStatus.return_order ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'
                        }`}>
                          {returnFilesStatus.return_order ? <Check className="w-5 h-5" /> : <FileJson className="w-5 h-5" />}
                        </div>
                        <div className="min-w-0">
                          <h4 className={`font-semibold text-sm truncate ${returnFilesStatus.return_order ? 'text-slate-800' : 'text-slate-500'}`}>
                            订单明细 (Return Order)
                          </h4>
                          <p className="text-xs text-slate-400 font-mono truncate">Required: purchase_date, return_date</p>
                        </div>
                     </div>
                ) : (
                    mode !== 'cycle' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                            {fileRequirements.map((item) => {
                              const isReady = returnFilesStatus[item.key as keyof typeof returnFilesStatus];
                              const Icon = item.icon;
                              return (
                                <div 
                                  key={item.key}
                                  className={`flex items-center p-4 rounded-xl border transition-all duration-300 ${
                                    isReady 
                                      ? 'bg-white border-emerald-200 shadow-sm ring-1 ring-emerald-500/10' 
                                      : 'bg-white/50 border-slate-200 opacity-70'
                                  }`}
                                >
                                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center mr-3 shrink-0 ${
                                    isReady ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'
                                  }`}>
                                    {isReady ? <Check className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
                                  </div>
                                  <div className="min-w-0">
                                    <h4 className={`font-semibold text-sm truncate ${isReady ? 'text-slate-800' : 'text-slate-500'}`}>
                                      {item.label}
                                    </h4>
                                    <p className="text-xs text-slate-400 font-mono truncate">{item.sub}</p>
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                    )
                )}
                
                {/* Cycle Mode Grid */}
                {mode === 'cycle' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
                     {/* Column Before */}
                     <div>
                        <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-200">
                           <History className="w-4 h-4 text-amber-500" />
                           <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wide">调整前 (Before)</h3>
                        </div>
                        <div className="space-y-3">
                           {fileRequirements.map((item) => {
                             const isReady = cycleFilesStatus.before[item.key as keyof typeof cycleFilesStatus.before];
                             const Icon = item.icon;
                             return (
                                <div key={`before-${item.key}`} className={`flex items-center p-3 rounded-lg border transition-all ${
                                   isReady ? 'bg-amber-50/50 border-amber-200' : 'bg-white/60 border-slate-200 opacity-70'
                                }`}>
                                   <div className={`w-8 h-8 rounded flex items-center justify-center mr-3 ${
                                      isReady ? 'bg-amber-100 text-amber-600' : 'bg-slate-200 text-slate-400'
                                   }`}>
                                      {isReady ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                                   </div>
                                   <div>
                                      <p className={`text-xs font-semibold ${isReady ? 'text-slate-800' : 'text-slate-400'}`}>{item.label}</p>
                                   </div>
                                </div>
                             )
                           })}
                        </div>
                     </div>
                     {/* Column After */}
                     <div>
                        <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-200">
                           <Clock className="w-4 h-4 text-purple-500" />
                           <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wide">调整后 (After)</h3>
                        </div>
                        <div className="space-y-3">
                           {fileRequirements.map((item) => {
                             const isReady = cycleFilesStatus.after[item.key as keyof typeof cycleFilesStatus.after];
                             const Icon = item.icon;
                             return (
                                <div key={`after-${item.key}`} className={`flex items-center p-3 rounded-lg border transition-all ${
                                   isReady ? 'bg-purple-50/50 border-purple-200' : 'bg-white/60 border-slate-200 opacity-70'
                                }`}>
                                   <div className={`w-8 h-8 rounded flex items-center justify-center mr-3 ${
                                      isReady ? 'bg-purple-100 text-purple-600' : 'bg-slate-200 text-slate-400'
                                   }`}>
                                      {isReady ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                                   </div>
                                   <div>
                                      <p className={`text-xs font-semibold ${isReady ? 'text-slate-800' : 'text-slate-400'}`}>{item.label}</p>
                                   </div>
                                </div>
                             )
                           })}
                        </div>
                     </div>
                  </div>
                )}

                {/* Error Message */}
                {error && (
                  <div className="flex items-start text-rose-600 bg-rose-50 p-4 rounded-xl mb-6 text-sm border border-rose-100 animate-in fade-in slide-in-from-top-2">
                    <AlertCircle className="w-5 h-5 mr-3 flex-shrink-0 mt-0.5" />
                    <span className="font-medium">{error}</span>
                  </div>
                )}

                {/* Action Button */}
                <button
                  onClick={handleGenerateReport}
                  className={`w-full py-4 rounded-xl text-white font-bold text-lg shadow-lg transition-all transform duration-200 active:scale-[0.98] flex items-center justify-center gap-2 ${
                    completedCount === totalRequired
                      ? 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200'
                      : 'bg-slate-300 cursor-not-allowed text-slate-50'
                  }`}
                  disabled={completedCount !== totalRequired}
                >
                  <Sparkles className={`w-5 h-5 ${completedCount === totalRequired ? 'animate-pulse' : ''}`} />
                  {completedCount === totalRequired 
                     ? (mode === 'maturity' ? '开始评估优化成效' : '生成分析报告') 
                     : '请先完成数据配置'
                  }
                </button>
             </div>
          </div>
        )}
      </div>
    </div>
  );
};