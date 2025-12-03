import React, { useState } from 'react';
import { FileUpload } from './components/FileUpload';
import { Dashboard } from './components/Dashboard';
import { AppData } from './types';

const App: React.FC = () => {
  const [data, setData] = useState<AppData | null>(null);

  if (!data) {
    return <FileUpload onDataLoaded={setData} />;
  }

  return <Dashboard data={data} onReset={() => setData(null)} />;
};

export default App;