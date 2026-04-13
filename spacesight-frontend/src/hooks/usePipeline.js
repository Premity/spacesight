import { useState, useEffect } from 'react';
import { getPipelineStatus } from '../services/api';

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
        
        setPipelineState(prev => ({
          ...prev,
          stageIndex: res.stageIndex,
          status: res.status,
          results: res.results
        }));

        if (res.status === 'done') {
          clearInterval(intervalId);
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
