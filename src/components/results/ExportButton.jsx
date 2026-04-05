import React, { useState } from 'react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

export default function ExportButton({ results }) {
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    
    try {
      const target = document.getElementById('results-export-target');
      if (!target) {
        throw new Error('Export target not found');
      }
      
      const canvas = await html2canvas(target, {
        scale: 2,
        backgroundColor: '#0a0a0f',
        useCORS: true,
      });

      const imgData = canvas.toDataURL('image/jpeg', 1.0);
      
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      const imgProps = pdf.getImageProperties(imgData);
      const imgWidth = pdfWidth;
      const imgHeight = (imgProps.height * imgWidth) / imgProps.width;

      let finalHeight = imgHeight;
      // If the content is taller than one page, scale it to fit on one page
      if (imgHeight > pdfHeight) {
         finalHeight = pdfHeight;
         // Adjust width to maintain aspect ratio
         const scaleWidth = (imgProps.width * finalHeight) / imgProps.height;
         // Center it horizontally
         const offsetX = (pdfWidth - scaleWidth) / 2;
         pdf.addImage(imgData, 'JPEG', offsetX, 0, scaleWidth, finalHeight);
      } else {
         pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, imgHeight);
      }
      
      // Page 2: Raw JSON data
      pdf.addPage();
      pdf.setFontSize(8);
      pdf.setTextColor(180, 180, 180);
      pdf.text('SpaceSight Analysis Data Export', 10, 10);
      pdf.text(`Timestamp: ${new Date().toISOString()}`, 10, 15);
      
      const jsonString = JSON.stringify(results, null, 2);
      const lines = jsonString.split('\n');
      
      let y = 25;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (y > 280) { 
          pdf.addPage();
          y = 15;
        }
        pdf.text(line, 10, y);
        y += 4; 
      }
      
      pdf.save(`spacesight-results-${Date.now()}.pdf`);
    } catch (error) {
       console.error('Failed to export PDF:', error);
       alert('Export failed. Check console for details.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <button 
      onClick={handleExport}
      disabled={isExporting}
      className={`px-6 py-2.5 rounded-full font-orbitron font-medium text-sm text-white transition-all duration-300 flex items-center gap-2 ${isExporting ? 'bg-space-surface border border-white/10 opacity-70 cursor-wait' : 'bg-space-purple/10 border border-space-purple hover:bg-space-purple hover:shadow-[0_0_25px_rgba(124,58,237,0.6)]'}`}
    >
      {isExporting ? (
        <>
          <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
             <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
             <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Generating PDF...
        </>
      ) : (
        'Export Results ↓'
      )}
    </button>
  );
}
