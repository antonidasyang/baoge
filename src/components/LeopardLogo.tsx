import React from 'react';

export const LeopardLogo = ({ className = "w-8 h-8" }: { className?: string }) => {
  return (
    <svg 
      viewBox="0 0 100 100" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg" 
      className={className}
    >
      {/* 线条版豹头轮廓 */}
      <path 
        d="M50 15L25 35L30 55L50 85L70 55L75 35L50 15Z" 
        stroke="currentColor" 
        strokeWidth="3" 
        strokeLinejoin="round"
      />
      
      {/* 经典的尖锐耳朵 */}
      <path d="M25 35L15 15L35 25" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
      <path d="M75 35L85 15L65 25" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
      
      {/* 犀利的眼神线条 */}
      <path d="M35 45L45 48" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <path d="M65 45L55 48" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      
      {/* 极简鼻中线 */}
      <path d="M50 50V70" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.4" />
    </svg>
  );
};
