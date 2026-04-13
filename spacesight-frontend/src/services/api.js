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
            type: 'multi',
            totalStars: 3,
            totalPlanets: 3,
            totalObservationSpan: 1459,
            totalDataPoints: 145000,
            stars: [
              {
                id: "KIC-757450",
                name: "KIC-757450",
                planets: [
                  { id: "KIC-757450 b", orbitalPeriod: 12.5, transitDepth: 0.45, estimatedRadius: 2.1, confidence: "High" },
                  { id: "KIC-757450 c", orbitalPeriod: 45.2, transitDepth: 0.12, estimatedRadius: 1.2, confidence: "High" }
                ],
                lightCurve: Array.from({ length: 1000 }, (_, i) => ({ time: i, flux: 1 - Math.random() * 0.01 })),
                blsPeriodogram: Array.from({ length: 100 }, (_, i) => ({ period: i, power: Math.random() })),
                orbitalParams: {},
                observationSpan: 1459,
                dataPoints: 65000
              },
              {
                id: "KIC-002757168",
                name: "KIC-002757168",
                planets: [
                  { id: "KIC-002757168 b", orbitalPeriod: 8.3, transitDepth: 0.18, estimatedRadius: 1.5, confidence: "Medium" }
                ],
                lightCurve: Array.from({ length: 1000 }, (_, i) => ({ time: i, flux: 1 - Math.random() * 0.01 })),
                blsPeriodogram: Array.from({ length: 100 }, (_, i) => ({ period: i, power: Math.random() })),
                orbitalParams: {},
                observationSpan: 1200,
                dataPoints: 50000
              },
              {
                id: "KIC-009651668",
                name: "KIC-009651668",
                planets: [],
                noPlanetConfidence: 73,
                lightCurve: Array.from({ length: 1000 }, (_, i) => ({ time: i, flux: 1 - Math.random() * 0.01 })),
                blsPeriodogram: Array.from({ length: 100 }, (_, i) => ({ period: i, power: Math.random() })),
                orbitalParams: {},
                observationSpan: 950,
                dataPoints: 30000
              }
            ]
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
