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
    currentStar: 0,
    currentStarName: null,
    totalStars: 1,
  });

  const targetStageRef = useRef(0);
  const displayedStageRef = useRef(0);
  const doneRef = useRef(false);
  const resultsRef = useRef(null);
  const lastStarRef = useRef(0);

  useEffect(() => {
    if (!jobId) return;

    targetStageRef.current = 0;
    displayedStageRef.current = 0;
    doneRef.current = false;
    resultsRef.current = null;
    lastStarRef.current = 0;

    setPipelineState({
      stageIndex: 0,
      status: 'processing',
      progress: 0,
      results: null,
      error: null,
      currentStar: 0,
      currentStarName: null,
      totalStars: 1,
    });

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

    const pollInterval = setInterval(async () => {
      try {
        const res = await getPipelineStatus(jobId);

        // When the backend advances to a new star, reset stage animation so
        // the user sees each stage light up again for the new star.
        if (res.currentStar && res.currentStar !== lastStarRef.current) {
          lastStarRef.current = res.currentStar;
          if (res.currentStar > 1) {
            // Allow stage indicator to walk forward from "loading" again
            displayedStageRef.current = Math.min(displayedStageRef.current, 1);
            targetStageRef.current = Math.min(targetStageRef.current, 1);
          }
        }

        if (res.stageIndex > targetStageRef.current) {
          targetStageRef.current = res.stageIndex;
        }

        setPipelineState(prev => ({
          ...prev,
          progress: res.progress,
          currentStar: res.currentStar ?? prev.currentStar,
          currentStarName: res.currentStarName ?? prev.currentStarName,
          totalStars: res.totalStars ?? prev.totalStars,
          error: res.error ?? prev.error,
        }));

        if (res.error) {
          clearInterval(pollInterval);
          clearInterval(stepInterval);
          setPipelineState(prev => ({ ...prev, status: 'error', error: res.error }));
          return;
        }

        if (res.done === true) {
          clearInterval(pollInterval);
          const finalResults = await getResults(jobId);
          resultsRef.current = finalResults;
          doneRef.current = true;
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
