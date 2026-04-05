export const submitLightCurve = async (file) => {
  // Mock submitting and getting a jobId
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({ jobId: 'job-' + Math.random().toString(36).substr(2, 9), status: 'accepted' });
    }, 1000);
  });
};

// We will hold a module-level state for our mock progress sequentially marching
const jobState = new Map();

export const getPipelineStatus = async (jobId) => {
  return new Promise((resolve) => {
    setTimeout(() => {
      if (!jobState.has(jobId)) {
         jobState.set(jobId, { stageIndex: 1, startTime: Date.now() });
      }

      const job = jobState.get(jobId);
      const now = Date.now();
      const elapsedSeconds = (now - job.startTime) / 1000;
      
      // Advance 1 stage every 2 seconds
      let currentStage = Math.floor(elapsedSeconds / 2) + 1;
      
      if (currentStage >= 8) {
         currentStage = 8;
         resolve({
           jobId,
           status: 'done',
           stageIndex: 8,
           stageName: 'Done',
           results: {
             planetFound: true,
             confidenceScore: 0.94,
             orbitalPeriodDays: 12.5,
             planetRadiusEarths: 2.1,
             transitDepth: 0.005,
             visualizations: {
                phaseFoldedCurve: "mock-url"
             }
           }
         });
         return;
      }

      const stages = [
         "Start", "Loading", "Preprocessing", "Filtering", 
         "Normalization", "CNN Inference", "BLS Analysis", "Done"
      ];

      resolve({
         jobId,
         status: 'processing',
         stageIndex: currentStage,
         stageName: stages[currentStage - 1],
         results: null
      });

    }, 300); // 300ms network delay mock
  });
};
