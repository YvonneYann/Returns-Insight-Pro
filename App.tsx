
import React, { useState } from 'react';
import { FileUpload } from './components/FileUpload';
import { Dashboard } from './components/Dashboard';
import { AppData, ComparisonData, ReportMode } from './types';

const App: React.FC = () => {
  const [data, setData] = useState<AppData | ComparisonData | null>(null);
  const [reportMode, setReportMode] = useState<ReportMode | null>(null);

  if (!data) {
    return (
      <FileUpload 
        mode={reportMode} 
        setMode={setReportMode} 
        onDataLoaded={setData} 
      />
    );
  }

  return (
    <Dashboard 
      data={data} 
      mode={reportMode!} 
      onReset={() => {
        setData(null);
        setReportMode(null);
      }} 
    />
  );
};

export default App;
