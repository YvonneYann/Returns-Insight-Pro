import React, { useState } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

export const useReportExport = (reportRef: React.RefObject<HTMLDivElement | null>, filenameBase: string) => {
  const [exportingStatus, setExportingStatus] = useState<'pdf' | 'image' | null>(null);

  const prepareCanvas = async () => {
    if (!reportRef.current) return null;

    // Save current scroll position
    const currentScrollX = window.scrollX;
    const currentScrollY = window.scrollY;

    // Scroll to top to prevent html2canvas offset issues
    window.scrollTo(0, 0);
    await new Promise(resolve => setTimeout(resolve, 100));

    try {
      // Use scrollHeight for accurate full height capture
      // Add extra padding at the bottom (e.g. 100px) to avoid abrupt cut-off
      const extraPadding = 100;
      const fullHeight = reportRef.current.scrollHeight + extraPadding;
      const fullWidth = reportRef.current.scrollWidth;

      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#f8fafc',
        scrollX: 0,
        scrollY: 0,
        width: fullWidth,
        height: fullHeight,
        windowWidth: document.documentElement.offsetWidth,
        windowHeight: document.documentElement.scrollHeight,
        onclone: (clonedDoc) => {
          // Fix 1: Handle overflow clipping issues
          const elements = clonedDoc.querySelectorAll('.overflow-hidden');
          elements.forEach((el) => {
            (el as HTMLElement).style.overflow = 'visible';
          });

          // Fix 2: Remove animations to ensure static rendering
          const animatedElements = clonedDoc.querySelectorAll('.animate-in');
          animatedElements.forEach((el) => {
            el.classList.remove('animate-in', 'fade-in', 'slide-in-from-top-4', 'slide-in-from-right-8', 'duration-500', 'duration-700');
          });

          // Fix 3: Add Bottom Padding to Text
          // Helps with baseline shift issues in html2canvas where text renders lower than browser
          const textElements = clonedDoc.querySelectorAll('h1, h2, h3, .text-4xl, .text-2xl, .text-xl, .font-bold');
          textElements.forEach((el) => {
            const htmlEl = el as HTMLElement;
            htmlEl.style.paddingBottom = '5px';
            const display = window.getComputedStyle(htmlEl).display;
            if (display === 'inline') {
              htmlEl.style.display = 'inline-block';
            }
          });
        }
      });
      
      // Restore scroll position
      window.scrollTo(currentScrollX, currentScrollY);
      return canvas;
    } catch (e) {
      window.scrollTo(currentScrollX, currentScrollY);
      throw e;
    }
  };

  const handleDownload = async () => {
    if (!reportRef.current) return;
    setExportingStatus('pdf');

    try {
      const canvas = await prepareCanvas();
      if (!canvas) return;

      const imgData = canvas.toDataURL('image/png');
      
      // Calculate dimensions for Single Page PDF (Long Image Style)
      // 保持宽度为 A4 标准宽度 (210mm)，高度根据比例自适应
      const pdfWidth = 210; 
      const pxWidth = canvas.width;
      const pxHeight = canvas.height;
      const pdfHeight = (pxHeight * pdfWidth) / pxWidth;

      // Initialize jsPDF with custom single page format
      const pdf = new jsPDF({ 
        orientation: pdfHeight > pdfWidth ? 'p' : 'l', 
        unit: 'mm', 
        format: [pdfWidth, pdfHeight] 
      });
      
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`${filenameBase}.pdf`);
    } catch (error) {
      console.error('Export failed', error);
      alert('Failed to generate PDF. Please try again.');
    } finally {
      setExportingStatus(null);
    }
  };

  const handleScreenshot = async () => {
    if (!reportRef.current) return;
    setExportingStatus('image');

    try {
      const canvas = await prepareCanvas();
      if (!canvas) return;

      const imgData = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = imgData;
      link.download = `${filenameBase}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Screenshot failed', error);
      alert('Failed to generate screenshot.');
    } finally {
      setExportingStatus(null);
    }
  };

  return {
    handleDownload,
    handleScreenshot,
    exportingStatus
  };
};