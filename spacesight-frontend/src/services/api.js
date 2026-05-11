const BASE_URL = "http://127.0.0.1:8000";

// -------------------------------
// 1. SUBMIT FILE → /analyze
// -------------------------------
export const submitLightCurve = async (file) => {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${BASE_URL}/analyze`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error("Failed to submit file");
  }

  const data = await response.json();
  return data; // { jobId }
};

// -------------------------------
// 2. GET STATUS → /status/{jobId}
// -------------------------------
export const getPipelineStatus = async (jobId) => {
  const response = await fetch(`${BASE_URL}/status/${jobId}`);

  if (!response.ok) {
    throw new Error("Failed to fetch status");
  }

  const data = await response.json();

  return {
    jobId,
    status: data.done ? "done" : "processing",
    stageIndex: data.stageIndex || 0,
    stageName: data.stage,
    progress: data.progress,
  };
};

// -------------------------------
// 3. GET RESULTS → /results/{jobId}
// -------------------------------
export const getResults = async (jobId) => {
  const response = await fetch(`${BASE_URL}/results/${jobId}`);

  if (!response.ok) {
    throw new Error("Failed to fetch results");
  }

  return await response.json();
};