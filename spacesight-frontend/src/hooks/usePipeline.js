import { useState, useEffect, useRef } from 'react';
import { getPipelineStatus, getResults } from '../services/api';

const STEP_DELAY_MS = 600;

export function usePipeline(jobId) {
  const [pipelineState, setPipelineState] = useState({
    stageIndex: 0,
    status: 'idle',
    progress: 0,
    results: null,
    error: null,
  });

  // Tracks the highest stageIndex the backend has reported so far.
  const targetStageRef = useRef(0);
  // Tracks the stageIndex currently shown to the user.
  const displayedStageRef = useRef(0);
  // Whether the job has fully completed on the backend.
  const doneRef = useRef(false);
  const resultsRef = useRef(null);

  useEffect(() => {
    if (!jobId) return;

    targetStageRef.current = 0;
    displayedStageRef.current = 0;
    doneRef.current = false;
    resultsRef.current = null;

    setPipelineState({ stageIndex: 0, status: 'processing', progress: 0, results: null, error: null });

    // Advance displayed stage one step at a time so the user sees each stage light up.
    const stepInterval = setInterval(() => {
      if (displayedStageRef.current < targetStageRef.current) {
        displayedStageRef.current += 1;
        const next = displayedStageRef.current;
        const isDone = doneRef.current && next >= targetStageRef.current;

        setPipelineState(prev => ({
          ...prev,
          stageIndex: next,
          status: isDone ? 'done' : 'processing',
          progress: isDone ? 100 : prev.progress,
          results: isDone ? resultsRef.current : prev.results,
        }));

        if (isDone) {
          clearInterval(stepInterval);
          clearInterval(pollInterval);
        }
      }
    }, STEP_DELAY_MS);

    // Poll the backend for real progress.
    const pollInterval = setInterval(async () => {
      try {
        const res = await getPipelineStatus(jobId);

        // Always advance the target to whichever stage the backend is on.
        if (res.stageIndex > targetStageRef.current) {
          targetStageRef.current = res.stageIndex;
        }

        setPipelineState(prev => ({ ...prev, progress: res.progress }));

        if (res.status === 'done') {
          clearInterval(pollInterval);
          const finalResults = await getResults(jobId);
          resultsRef.current = finalResults;
          doneRef.current = true;
          // Ensure target is at the final stage so the step timer walks up to it.
          targetStageRef.current = res.stageIndex;
        }
      } catch (err) {
        clearInterval(pollInterval);
        clearInterval(stepInterval);
        setPipelineState(prev => ({ ...prev, status: 'error', error: err.message }));
      }
    }, 2000);

    return () => {
      clearInterval(stepInterval);
      clearInterval(pollInterval);
    };
  }, [jobId]);

  return pipelineState;
}
