
import React, { useRef, useState, useMemo } from 'react';
import { 
  Download, 
  ArrowLeft, 
  Activity, 
  Camera,
  FileText
} from 'lucide-react';
import { AppData, ComparisonData, ReportMode } from '../types';
import { StatusView } from './views/StatusView';
import { CycleView } from './views/CycleView';
import { MaturityView } from './views/MaturityView';
import { useReportExport } from '../hooks/useReportExport';
import { analyzeStatusData } from '../utils/statusAnalyzer';
import { generateStatusMarkdown } from '../utils/markdownGenerator';

interface DashboardProps {
  data: AppData | ComparisonData;
  mode: ReportMode;
  onReset: () => void;
}

// --- Main Container: Dashboard ---
export const Dashboard: React.FC<DashboardProps> = ({ data, mode, onReset }) => {
  const reportRef = useRef<HTMLDivElement>(null);
  
  // Calculate consistent filename base
  const fasin = useMemo(() => {
    if (mode === 'cycle') {
       const d = data as ComparisonData;
       return d.before?.summary?.parent_summary?.fasin || 'Unknown';
    }
    const d = data as AppData;
    // For maturity mode, we might not have 'summary', try to get from first order or summary if exists
    if (mode === 'maturity' && d.return_order && d.return_order.length > 0) {
        return d.return_order[0].fasin || d.return_order[0].asin || 'Maturity_Analysis';
    }
    return d.summary?.parent_summary?.fasin || 'Unknown';
  }, [data, mode]);

  const exportFilename = useMemo(() => {
    const dateStr = new Date().toISOString().split('T')[0];
    let prefix = 'Return_Window';
    if (mode === 'purchase') prefix = 'Purchase_Window';
    if (mode === 'cycle') prefix = 'Cycle_Analysis';
    if (mode === 'maturity') prefix = 'Maturity_Assessment';
    
    return `${prefix}_Report_${fasin}_${dateStr}`;
  }, [mode, fasin]);

  const { handleDownload, handleScreenshot, exportingStatus } = useReportExport(reportRef, exportFilename);

  // Lift state up: Manage AI insights here so they can be exported
  const [aiInsights, setAiInsights] = useState<Record<string, string>>({});

  const handleMarkdownExport = () => {
    if (mode === 'return' || mode === 'purchase') {
      try {
        const analysis = analyzeStatusData(data as AppData, mode);
        // Pass the current aiInsights to the generator
        const markdown = generateStatusMarkdown(analysis, aiInsights);
        
        const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        // Ensure this matches exportFilename logic for consistency
        link.download = `${exportFilename}.md`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } catch (e) {
        console.error("Failed to generate Markdown", e);
        alert("Markdown 生成失败，请检查数据完整性。");
      }
    } else {
      alert("当前模式暂不支持导出 Markdown，仅支持 PDF/长图。");
    }
  };

  const updateInsight = (asin: string, content: string) => {
    setAiInsights(prev => ({ ...prev, [asin]: content }));
  };

  const isReturnOrPurchase = mode === 'return' || mode === 'purchase';

  // Badge Logic
  const getBadgeStyle = () => {
      switch(mode) {
          case 'purchase': return 'bg-sky-100 text-sky-700';
          case 'cycle': return 'bg-purple-100 text-purple-700';
          case 'maturity': return 'bg-amber-100 text-amber-700';
          default: return 'bg-indigo-100 text-indigo-700';
      }
  };

  const getModeLabel = () => {
      switch(mode) {
          case 'purchase': return 'Purchase Window Analysis';
          case 'cycle': return 'Cycle Contrast Analysis';
          case 'maturity': return 'Return Rate Optimization Assessment';
          default: return 'Return Window Analysis';
      }
  };

  // Content Switching Logic
  const renderContent = () => {
      switch(mode) {
          case 'maturity':
              return <MaturityView data={data as AppData} />;
          case 'cycle':
              return <CycleView data={data as ComparisonData} />;
          case 'return':
          case 'purchase':
          default:
              return (
                <StatusView 
                    data={data as AppData} 
                    mode={mode}
                    aiInsights={aiInsights} 
                    onInsightUpdate={updateInsight} 
                />
              );
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
             <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wide ${getBadgeStyle()}`}>
                {getModeLabel()}
             </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
            {isReturnOrPurchase && (
              <button
                onClick={handleMarkdownExport}
                className="flex items-center px-4 py-2 bg-white text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors font-medium shadow-sm"
                title="导出 Markdown 格式报告 (包含已生成的 AI 诊断)"
              >
                <FileText className="w-4 h-4 mr-2" />
                MD 报告
              </button>
            )}
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
              className={`flex items-center px-4 py-2 text-white rounded-lg transition-colors font-medium shadow-sm disabled:opacity-70 disabled:cursor-not-allowed ${
                  mode === 'purchase' ? 'bg-sky-600 hover:bg-sky-700' : 
                  mode === 'maturity' ? 'bg-amber-600 hover:bg-amber-700' :
                  'bg-indigo-600 hover:bg-indigo-700'
              }`}
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
         {renderContent()}
      </div>
    </div>
  );
}