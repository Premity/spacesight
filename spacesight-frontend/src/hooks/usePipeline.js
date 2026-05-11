import { useState, useEffect } from 'react';
import { getPipelineStatus, getResults } from '../services/api';

export function usePipeline(jobId) {
  const [pipelineState, setPipelineState] = useState({
    stageIndex: 1,
    status: 'idle',
    results: null,
    error: null
  });

  useEffect(() => {
    if (!jobId) return;

    setPipelineState(prev => ({ ...prev, status: 'processing' }));

    const intervalId = setInterval(async () => {
      try {
        const res = await getPipelineStatus(jobId);
        
        if (res.status === 'done') {
          clearInterval(intervalId);
          const finalResults = await getResults(jobId);
          setPipelineState(prev => ({
            ...prev,
            stageIndex: res.stageIndex,
            status: 'done',
            progress: 100,
            results: finalResults
          }));
        } else {
          setPipelineState(prev => ({
            ...prev,
            stageIndex: res.stageIndex,
            status: res.status,
            progress: res.progress
          }));
        }

      } catch (err) {
        setPipelineState(prev => ({ ...prev, status: 'error', error: err.message }));
        clearInterval(intervalId);
      }
    }, 2000);

    return () => clearInterval(intervalId);
  }, [jobId]);

  return pipelineState;
}
