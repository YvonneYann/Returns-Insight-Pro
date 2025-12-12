
import React, { useRef } from 'react';
import { 
  Download, 
  ArrowLeft, 
  Activity, 
  Camera
} from 'lucide-react';
import { AppData, ComparisonData, ReportMode } from '../types';
import { StatusView } from './views/StatusView';
import { CycleView } from './views/CycleView';
import { useReportExport } from '../hooks/useReportExport';

interface DashboardProps {
  data: AppData | ComparisonData;
  mode: ReportMode;
  onReset: () => void;
}

// --- Main Container: Dashboard ---
export const Dashboard: React.FC<DashboardProps> = ({ data, mode, onReset }) => {
  const reportRef = useRef<HTMLDivElement>(null);
  const { handleDownload, handleScreenshot, exportingStatus } = useReportExport(reportRef, mode);

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
