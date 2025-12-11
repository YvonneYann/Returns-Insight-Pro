
import React, { useState, useCallback } from 'react';
import { UploadCloud, FileJson, Check, AlertCircle, Sparkles, BarChart3, LineChart, PieChart, FileText, StickyNote, RefreshCcw, ArrowLeft, ArrowRight, Clock, History } from 'lucide-react';
import { AppData, ComparisonData, ReportMode } from '../types';

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
};

const initialFilesStatus = {
  structure: false,
  summary: false,
  reasons: false,
  explanations: false,
  listing: false,
};

export const FileUpload: React.FC<FileUploadProps> = ({ mode, setMode, onDataLoaded }) => {
  // Status Mode State
  const [statusFilesStatus, setStatusFilesStatus] = useState(initialFilesStatus);
  const [statusTempData, setStatusTempData] = useState<AppData>(initialAppData);

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
      let summaryObj = json.parent_summary || json.parent_summary_before || json.parent_summary_after || json;
      if (Array.isArray(summaryObj)) {
        summaryObj = summaryObj[0];
      }
      return { parent_summary: summaryObj };
    }

    // 2. Handle specific suffixed keys mapping for Cycle mode
    if (type === 'structure') {
      const content = json.asin_structure || json.asin_structure_before || json.asin_structure_after || json;
      return { asin_structure: Array.isArray(content) ? content : [] };
    }

    if (type === 'reasons') {
      const content = json.problem_asin_reasons || json.problem_asin_reasons_before || json.problem_asin_reasons_after || json;
      return { problem_asin_reasons: Array.isArray(content) ? content : [] };
    }

    if (type === 'listing') {
      const content = json.problem_asin_listing || json.problem_asin_listing_before || json.problem_asin_listing_after || json;
      return { problem_asin_listing: Array.isArray(content) ? content : [] };
    }

    if (type === 'explanations') {
      // Explanations can come in 'reason_explanations' or 'evidence' or suffixed versions
      const exp = json.reason_explanations || json.reason_explanations_before || json.reason_explanations_after;
      const ev = json.evidence || json.evidence_before || json.evidence_after;
      
      const result: any = {};
      if (exp) result.reason_explanations = Array.isArray(exp) ? exp : [];
      if (ev) result.evidence = Array.isArray(ev) ? ev : [];
      
      // If pure array passed and assumed to be evidence/explanations (fallback)
      if (!exp && !ev && Array.isArray(json)) {
         result.evidence = json;
      }
      return result;
    }
    
    return json;
  };

  const determineFileType = (json: any, fileName: string): keyof AppData | null => {
    const name = fileName.toLowerCase();
    const keys = Object.keys(json);

    // 1. Key-based detection (Highly reliable)
    if (keys.some(k => k.includes('asin_structure'))) return 'structure';
    if (keys.some(k => k.includes('parent_summary'))) return 'summary';
    if (keys.some(k => k.includes('problem_asin_reasons'))) return 'reasons';
    if (keys.some(k => k.includes('reason_explanations') || k.includes('evidence'))) return 'explanations';
    if (keys.some(k => k.includes('problem_asin_listing'))) return 'listing';

    // 2. Filename-based detection (Fallback)
    if (name.includes('structure')) return 'structure';
    if (name.includes('summary')) return 'summary';
    if (name.includes('reasons')) return 'reasons';
    if (name.includes('explanations') || name.includes('evidence')) return 'explanations';
    if (name.includes('listing')) return 'listing';

    return null;
  };

  const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const files = event.target.files;
    if (!files) return;

    // --- LOGIC FOR STATUS MODE ---
    if (mode === 'status') {
      const newTempData = { ...statusTempData };
      const newStatus = { ...statusFilesStatus };

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          const text = await file.text();
          const json = JSON.parse(text);
          const type = determineFileType(json, file.name);

          if (type) {
            // @ts-ignore - Dynamic assignment
            newTempData[type] = normalizeData(type, json);
            newStatus[type] = true;
          }
        } catch (e) {
          console.error("Error parsing file", file.name, e);
          setError(`解析 "${file.name}" 失败，请确保文件内容为有效的 JSON 格式。`);
        }
      }
      setStatusTempData(newTempData);
      setStatusFilesStatus(newStatus);
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

        if (!side) {
          // Attempt to guess based on content keys if filename is ambiguous (rare but possible)
          // For now, rely on filename as instructed
          continue;
        }

        try {
          const text = await file.text();
          const json = JSON.parse(text);
          const type = determineFileType(json, file.name);

          if (type) {
            // @ts-ignore
            newCycleData[side][type] = normalizeData(type, json);
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
  }, [mode, statusTempData, statusFilesStatus, cycleTempData, cycleFilesStatus]);

  const handleGenerateReport = () => {
    if (mode === 'status') {
      if (!statusTempData.structure || !statusTempData.summary || !statusTempData.reasons || !statusTempData.explanations || !statusTempData.listing) {
        setError("请上传全部 5 个必需的 JSON 文件以生成报告。");
        return;
      }
      onDataLoaded(statusTempData);
    } else if (mode === 'cycle') {
      const beforeComplete = Object.values(cycleFilesStatus.before).every(Boolean);
      const afterComplete = Object.values(cycleFilesStatus.after).every(Boolean);

      if (!beforeComplete || !afterComplete) {
         setError("请上传全部 10 个必需的文件（调整前5个 + 调整后5个）。");
         return;
      }
      onDataLoaded(cycleTempData);
    }
  };

  // Progress Calculation
  let completedCount = 0;
  let totalRequired = 0;
  
  if (mode === 'status') {
    completedCount = Object.values(statusFilesStatus).filter(Boolean).length;
    totalRequired = 5;
  } else if (mode === 'cycle') {
    completedCount = Object.values(cycleFilesStatus.before).filter(Boolean).length + Object.values(cycleFilesStatus.after).filter(Boolean).length;
    totalRequired = 10;
  }
  
  const progressPercentage = (completedCount / totalRequired) * 100;

  const fileRequirements = [
    { key: 'summary', label: '父体汇总', sub: 'summary.json', icon: BarChart3 },
    { key: 'structure', label: 'ASIN 结构', sub: 'structure.json', icon: FileJson },
    { key: 'reasons', label: '退货原因', sub: 'reasons.json', icon: AlertCircle },
    { key: 'explanations', label: '反馈依据', sub: 'evidence.json', icon: Sparkles },
    { key: 'listing', label: 'Listing详情', sub: 'listing.json', icon: StickyNote },
  ];

  return (
    <div className="flex min-h-screen w-full bg-white font-sans text-slate-900">
      {/* Left Panel - Branding & Visuals (40%) */}
      <div className="hidden lg:flex lg:w-5/12 bg-slate-900 relative flex-col justify-start gap-8 p-12 text-white overflow-hidden overflow-y-auto scrollbar-hide">
        {/* Background Gradients */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-600/30 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-purple-600/20 rounded-full blur-[100px] translate-y-1/2 -translate-x-1/2 pointer-events-none"></div>
        
        {/* Top Info Bar (Moved from bottom) */}
        <div className="relative z-10 pb-6 border-b border-slate-800">
           <p className="text-xs text-slate-500 font-medium tracking-wide">
             © 2025 Returns Insight Pro. Designed for Amazon Sellers.
           </p>
        </div>

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
        <div className="relative z-10 space-y-6">
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
                <PieChart className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h3 className="font-bold text-lg">智能归因诊断</h3>
                <p className="text-slate-400 text-sm">基于置信度模型，自动提取核心退货原因，拒绝数据噪音。</p>
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

      {/* Right Panel - Interaction (60%) */}
      <div className="w-full lg:w-7/12 bg-slate-50 flex flex-col relative overflow-hidden">
        
        {/* Background Decorations to reduce white space */}
        <div className="absolute inset-0 pointer-events-none">
           <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] bg-indigo-200/20 rounded-full blur-[100px]"></div>
           <div className="absolute bottom-[-20%] left-[-10%] w-[500px] h-[500px] bg-purple-200/20 rounded-full blur-[100px]"></div>
           {/* Grid Pattern */}
           <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,#000_70%,transparent_100%)]"></div>
        </div>
        
        {/* Mode Selection Screen */}
        {!mode ? (
           <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-12 animate-in fade-in slide-in-from-right-8 duration-500 relative z-10">
              <div className="w-full max-w-xl bg-white/80 backdrop-blur-sm p-10 rounded-3xl border border-white/60 shadow-xl shadow-slate-200/50">
                <div className="mb-8 text-center">
                    <div className="inline-flex items-center justify-center p-3 bg-indigo-50 rounded-xl mb-4 text-indigo-600 ring-1 ring-indigo-100">
                        <Sparkles className="w-6 h-6" />
                    </div>
                    <h2 className="text-3xl font-extrabold text-slate-800 mb-3 tracking-tight">开始新的分析</h2>
                    <p className="text-slate-500 text-base">请选择适合您当前业务场景的数据分析模式</p>
                </div>
                
                <div className="grid gap-5">
                  <button 
                    onClick={() => setMode('status')}
                    className="group relative flex items-start p-5 bg-white border border-slate-200 rounded-xl hover:border-indigo-500 hover:shadow-lg hover:shadow-indigo-500/10 transition-all duration-300 text-left"
                  >
                     <div className="w-12 h-12 rounded-lg bg-indigo-50 flex items-center justify-center mr-4 group-hover:bg-indigo-600 transition-colors duration-300 shrink-0 border border-indigo-100/50">
                        <BarChart3 className="w-6 h-6 text-indigo-600 group-hover:text-white transition-colors" />
                     </div>
                     <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                            <h3 className="text-lg font-bold text-slate-800 group-hover:text-indigo-700 transition-colors">退货现状分析</h3>
                            <ArrowRight className="w-5 h-5 text-slate-300 group-hover:text-indigo-500 transform group-hover:translate-x-1 transition-all" />
                        </div>
                        <p className="text-slate-500 text-sm leading-relaxed">基于退货发生日统计。快速诊断当前退货率、原因分布与异常 ASIN，适合周/月度例行检查。</p>
                     </div>
                  </button>

                  <button 
                    onClick={() => setMode('cycle')}
                    className="group relative flex items-start p-5 bg-white border border-slate-200 rounded-xl hover:border-purple-500 hover:shadow-lg hover:shadow-purple-500/10 transition-all duration-300 text-left"
                  >
                     <div className="w-12 h-12 rounded-lg bg-purple-50 flex items-center justify-center mr-4 group-hover:bg-purple-600 transition-colors duration-300 shrink-0 border border-purple-100/50">
                        <RefreshCcw className="w-6 h-6 text-purple-600 group-hover:text-white transition-colors" />
                     </div>
                     <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                            <h3 className="text-lg font-bold text-slate-800 group-hover:text-purple-700 transition-colors">退货周期归因 (A/B Test)</h3>
                            <ArrowRight className="w-5 h-5 text-slate-300 group-hover:text-purple-500 transform group-hover:translate-x-1 transition-all" />
                        </div>
                        <p className="text-slate-500 text-sm leading-relaxed">基于下单日期归因。通过 Before/After 对比分析，验证 Listing 优化或产品改良的实际效果。</p>
                     </div>
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
                    // Reset states potentially?
                  }}
                  className="mb-6 flex items-center text-slate-400 hover:text-indigo-600 transition-colors text-sm font-medium"
                >
                  <ArrowLeft className="w-4 h-4 mr-1" />
                  返回模式选择
                </button>

                <div className="mb-8">
                   <div className="flex items-center gap-3 mb-2">
                      <div className={`p-2 rounded-lg ${mode === 'status' ? 'bg-indigo-100 text-indigo-600' : 'bg-purple-100 text-purple-600'}`}>
                         {mode === 'status' ? <BarChart3 className="w-5 h-5" /> : <RefreshCcw className="w-5 h-5" />}
                      </div>
                      <h2 className="text-3xl font-bold text-slate-800">
                        {mode === 'status' ? '导入现状数据' : '导入周期数据'}
                      </h2>
                   </div>
                   <p className="text-slate-500">
                      {mode === 'status' 
                        ? '请上传 5 份必需的 JSON 数据源以开始分析。' 
                        : '请上传包含 before 和 after 后缀的对照文件（共10个）。'
                      }
                   </p>
                </div>

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
                     <div className={`p-3 rounded-full bg-slate-100 mb-3 transition-transform duration-300 ${isDragging ? 'scale-110 bg-indigo-100 text-indigo-600' : 'text-slate-400 group-hover:text-indigo-500 group-hover:bg-indigo-50'}`}>
                        <UploadCloud className="w-8 h-8" />
                     </div>
                     <p className="text-base font-semibold text-slate-700">点击上传 或 拖拽所有文件到此处</p>
                     <p className="text-xs text-slate-400 mt-1">
                        {mode === 'status' 
                           ? '支持批量上传 (summary, structure, reasons, evidence, listing)' 
                           : '请同时拖入调整前 (before) 和调整后 (after) 的所有文件'
                        }
                     </p>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="mb-8">
                   <div className="flex justify-between items-end mb-2">
                      <span className="text-sm font-bold text-slate-700">数据完整度</span>
                      <span className={`text-sm font-medium ${completedCount === totalRequired ? 'text-emerald-600' : 'text-slate-400'}`}>
                        {Math.round(progressPercentage)}%
                      </span>
                   </div>
                   <div className="h-2.5 w-full bg-slate-200 rounded-full overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-500 ease-out rounded-full ${completedCount === totalRequired ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                        style={{ width: `${progressPercentage}%` }}
                      ></div>
                   </div>
                </div>

                {/* File Status Grid */}
                {mode === 'status' ? (
                  // Status Mode - Single Grid
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                    {fileRequirements.map((item) => {
                      const isReady = statusFilesStatus[item.key as keyof typeof statusFilesStatus];
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
                ) : (
                  // Cycle Mode - Dual Column Grid
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
                                      <p className="text-[10px] text-slate-400">*before.json</p>
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
                                      <p className="text-[10px] text-slate-400">*after.json</p>
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
                     ? (mode === 'status' ? '生成现状分析报告' : '生成对比分析报告') 
                     : (mode === 'status' ? '请先上传所有数据文件' : '请先上传所有 10 份文件')
                  }
                </button>
             </div>
          </div>
        )}
      </div>
    </div>
  );
};
