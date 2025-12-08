
import React, { useState, useCallback } from 'react';
import { UploadCloud, FileJson, Check, AlertCircle, Sparkles, BarChart3, LineChart, PieChart, FileText, StickyNote } from 'lucide-react';
import { AppData } from '../types';

interface FileUploadProps {
  onDataLoaded: (data: AppData) => void;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onDataLoaded }) => {
  const [filesStatus, setFilesStatus] = useState({
    structure: false,
    summary: false,
    reasons: false,
    explanations: false,
    listing: false,
  });
  const [tempData, setTempData] = useState<AppData>({
    structure: null,
    summary: null,
    reasons: null,
    explanations: null,
    listing: null,
  });
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const files = event.target.files;
    if (!files) return;

    const newTempData = { ...tempData };
    const newStatus = { ...filesStatus };

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const text = await file.text();
        const json = JSON.parse(text);

        if (json.asin_structure) {
          newTempData.structure = json;
          newStatus.structure = true;
        } else if (json.parent_summary) {
          newTempData.summary = json;
          newStatus.summary = true;
        } else if (json.problem_asin_reasons) {
          newTempData.reasons = json;
          newStatus.reasons = true;
        } else if (json.reason_explanations || json.evidence) {
          newTempData.explanations = json;
          newStatus.explanations = true;
        } else if (json.problem_asin_listing) {
          newTempData.listing = json;
          newStatus.listing = true;
        }
      } catch (e) {
        console.error("Error parsing file", file.name, e);
        setError(`解析 "${file.name}" 失败，请确保文件内容为有效的 JSON 格式。`);
      }
    }

    setTempData(newTempData);
    setFilesStatus(newStatus);
    setIsDragging(false);
  }, [tempData, filesStatus]);

  const handleGenerateReport = () => {
    if (!tempData.structure || !tempData.summary || !tempData.reasons) {
      setError("请上传全部必需的 JSON 文件以生成完整报告。");
      return;
    }
    
    if (!tempData.explanations) {
       setError("请上传反馈依据 (evidence) 文件。");
       return;
    }

    if (!tempData.listing) {
      setError("请上传 Listing 详情 (listing) 文件。");
      return;
   }

    onDataLoaded(tempData);
  };

  const completedCount = Object.values(filesStatus).filter(Boolean).length;
  const progressPercentage = (completedCount / 5) * 100;

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
      <div className="hidden lg:flex lg:w-5/12 bg-slate-900 relative flex-col justify-between p-12 text-white overflow-hidden">
        {/* Background Gradients */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-600/30 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2"></div>
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-purple-600/20 rounded-full blur-[100px] translate-y-1/2 -translate-x-1/2"></div>
        
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

        <div className="relative z-10 pt-8 border-t border-slate-800">
           <p className="text-xs text-slate-500">
             © 2025 Returns Insight Pro. Designed for Amazon Sellers.
           </p>
        </div>
      </div>

      {/* Right Panel - Upload Interaction (60%) */}
      <div className="w-full lg:w-7/12 bg-slate-50 flex flex-col items-center justify-center p-6 md:p-12 lg:p-24 relative">
        <div className="w-full max-w-xl">
            <div className="mb-8">
               <h2 className="text-3xl font-bold text-slate-800 mb-2">导入分析数据</h2>
               <p className="text-slate-500">请上传 5 份必需的 JSON 数据源以开始分析。</p>
            </div>

            {/* Upload Zone */}
            <div 
              className={`relative group w-full aspect-[3/1] rounded-2xl border-2 border-dashed transition-all duration-300 ease-in-out mb-8 flex flex-col items-center justify-center cursor-pointer overflow-hidden
                ${isDragging 
                  ? 'border-indigo-500 bg-indigo-50/50' 
                  : 'border-slate-300 bg-white hover:border-indigo-400 hover:bg-slate-50/50'
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
                 <p className="text-base font-semibold text-slate-700">点击上传 或 拖拽文件到此处</p>
                 <p className="text-xs text-slate-400 mt-1">支持批量上传 (summary, structure, reasons, evidence, listing)</p>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="mb-8">
               <div className="flex justify-between items-end mb-2">
                  <span className="text-sm font-bold text-slate-700">数据完整度</span>
                  <span className={`text-sm font-medium ${completedCount === 5 ? 'text-emerald-600' : 'text-slate-400'}`}>
                    {Math.round(progressPercentage)}%
                  </span>
               </div>
               <div className="h-2.5 w-full bg-slate-200 rounded-full overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-500 ease-out rounded-full ${completedCount === 5 ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                    style={{ width: `${progressPercentage}%` }}
                  ></div>
               </div>
            </div>

            {/* File Status Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
              {fileRequirements.map((item) => {
                const isReady = filesStatus[item.key as keyof typeof filesStatus];
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
                completedCount === 5
                  ? 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200'
                  : 'bg-slate-300 cursor-not-allowed text-slate-50'
              }`}
              disabled={completedCount !== 5}
            >
              <Sparkles className={`w-5 h-5 ${completedCount === 5 ? 'animate-pulse' : ''}`} />
              {completedCount === 5 ? '生成分析报告' : '请先上传所有数据文件'}
            </button>
        </div>
      </div>
    </div>
  );
};
