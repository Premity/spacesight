import React, { useState, useCallback, useContext, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { submitLightCurve } from '../services/api';
import { usePipeline } from '../hooks/usePipeline';
import { AppContext } from '../context/AppContext';
import { useNavigate } from 'react-router-dom';

const STAGES = [
  "Start", "Loading", "Preprocessing",
  "CNN Inference", "BLS Analysis", "Generate Visualizations", "Done"
];

export default function AnalyzePage() {
  const [file, setFile] = useState(null);
  const [jobId, setJobId] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { setResults } = useContext(AppContext);
  const navigate = useNavigate();

  const pipelineState = usePipeline(jobId);

  useEffect(() => {
    if (pipelineState.status === 'done' && pipelineState.results) {
      setResults(pipelineState.results);
      // Wait a moment so user can see "Done", then redirect
      const timer = setTimeout(() => {
        navigate('/results');
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [pipelineState.status, pipelineState.results, navigate, setResults]);

  const onDrop = useCallback(acceptedFiles => {
    if (acceptedFiles?.length > 0) {
      setFile(acceptedFiles[0]);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/zip': ['.zip'],
      'application/x-npz': ['.npz']
    },
    maxFiles: 1
  });

  const handleBeginAnalysis = async () => {
    if (!file) return;
    setIsSubmitting(true);
    try {
      const res = await submitLightCurve(file);
      setJobId(res.jobId);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (jobId) {
    // STATE 2: PIPELINE TRACKER
    return (
      <div className="min-h-screen pt-32 pb-20 px-6 flex flex-col items-center relative z-10 w-full overflow-hidden text-space-text font-inter">
        <h2 className="font-orbitron font-bold text-3xl md:text-4xl mb-12 drop-shadow-md">Analysis in Progress</h2>

        <div className="w-full max-w-lg bg-space-surface/50 border border-white/10 p-10 rounded-[2rem] backdrop-blur-md shadow-[0_0_40px_rgba(0,0,0,0.5)] relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-space-purple to-space-teal opacity-50"></div>

          <div className="flex flex-col gap-6">
            {STAGES.map((stageName, idx) => {
              const stageIndex = idx + 1;
              const isCompleted = pipelineState.stageIndex > stageIndex;
              const isActive = pipelineState.stageIndex === stageIndex && pipelineState.stageIndex > 0 && pipelineState.status !== 'done';
              const isFuture = pipelineState.stageIndex < stageIndex;

              return (
                <div key={stageName} className={`flex items-center gap-5 transition-all duration-300 ${isFuture ? 'opacity-40' : 'opacity-100'} ${isActive ? 'scale-105 transform origin-left' : ''}`}>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 shrink-0 transition-all duration-300 ${isActive ? 'border-space-purple bg-space-purple/20 shadow-[0_0_15px_rgba(124,58,237,0.5)]' :
                    isCompleted ? 'border-space-teal bg-space-teal/20' :
                      'border-space-text/20 bg-space-surface'
                    }`}>
                    {isActive && (
                      <svg className="animate-spin h-5 w-5 text-space-purple" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    )}
                    {isCompleted && (
                      <svg className="h-5 w-5 text-space-teal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path>
                      </svg>
                    )}
                    {isFuture && (
                      <span className="w-2 h-2 bg-space-text/30 rounded-full"></span>
                    )}
                  </div>
                  <div className="flex flex-col w-full">
                    <span className={`font-orbitron tracking-widest uppercase text-sm ${isActive ? 'text-space-purple font-bold drop-shadow-md' : isCompleted ? 'text-space-teal' : 'text-space-text/50'}`}>
                      {stageName}
                    </span>
                    <div className="w-full bg-space-surface h-1.5 rounded-full mt-2 overflow-hidden border border-white/5">
                      <div
                        className={`h-full transition-all duration-500 ${isCompleted ? 'bg-space-teal' : 'bg-space-purple'}`}
                        style={{ width: `${isCompleted ? 100 : (isFuture ? 0 : pipelineState.progress)}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {pipelineState.status === 'done' && (
            <div className="mt-10 text-center animate-fade-in">
              <h3 className="font-orbitron text-xl text-white font-bold mb-2">Analysis Complete</h3>
              <p className="text-space-text/60 text-sm">Redirecting to results...</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // STATE 1: UPLOAD VIEW
  return (
    <div className="min-h-[80vh] pt-32 pb-20 px-6 flex flex-col items-center justify-center relative z-10 w-full text-space-text font-inter">
      <h1 className="font-orbitron font-bold text-4xl md:text-5xl mb-6 text-center drop-shadow-md">New Analysis</h1>
      <p className="text-space-text/60 text-center max-w-lg mb-12">Submit Kepler light curve data (.npz or .zip) to initiate the transit detection pipeline.</p>

      <div
        {...getRootProps()}
        className={`w-full max-w-2xl bg-space-surface/60 backdrop-blur-md rounded-[2.5rem] p-16 flex flex-col items-center text-center cursor-pointer transition-all duration-300 border-2 border-dashed ${isDragActive ? 'border-space-purple bg-space-purple/10 scale-105 shadow-[0_0_30px_rgba(124,58,237,0.3)]' : 'border-space-purple/40 hover:border-space-purple hover:bg-space-surface/80 hover:shadow-[0_0_20px_rgba(124,58,237,0.15)]'}`}
      >
        <input {...getInputProps()} />
        <svg className={`w-20 h-20 mb-6 transition-colors duration-300 ${isDragActive ? 'text-space-purple' : 'text-space-purple/60'}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>

        {file ? (
          <div className="animate-fade-in flex flex-col items-center">
            <span className="font-orbitron text-xl text-white font-semibold mb-2">{file.name}</span>
            <span className="text-space-text/50 text-sm tracking-wider">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
          </div>
        ) : (
          <>
            <p className="font-orbitron text-xl text-white font-semibold mb-3">
              {isDragActive ? "Drop file to upload" : "Drop your .npz or .zip file here"}
            </p>
            <p className="text-space-text/50 italic">or click to browse</p>
          </>
        )}
      </div>

      <button
        onClick={handleBeginAnalysis}
        disabled={!file || isSubmitting}
        className={`mt-14 px-10 py-4 rounded-full font-orbitron font-bold tracking-widest uppercase text-sm text-white transition-all duration-300 flex items-center justify-center min-w-[280px] ${!file ? 'bg-space-surface border border-white/10 opacity-50 cursor-not-allowed' : 'bg-space-purple hover:bg-space-violet shadow-[0_0_20px_rgba(124,58,237,0.6)] hover:shadow-[0_0_35px_rgba(168,85,247,0.8)] hover:-translate-y-1'}`}
      >
        {isSubmitting ? (
          <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        ) : 'Begin Analysis'}
      </button>
    </div>
  );
}
