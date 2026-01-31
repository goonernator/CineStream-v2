'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { tourSteps, onboarding, type TourStep } from '@/lib/onboarding';

export default function OnboardingTour() {
  const pathname = usePathname();
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [mounted, setMounted] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    
    // Check if onboarding is complete
    if (typeof window !== 'undefined') {
      const isComplete = onboarding.isComplete();
      // Only show on home page and if not complete
      if (!isComplete && pathname === '/') {
        // Small delay to let the page render
        const timer = setTimeout(() => {
          setIsActive(true);
          setCurrentStep(onboarding.getCurrentStep());
        }, 1500);
        return () => clearTimeout(timer);
      }
    }
  }, [pathname]);

  const updateTargetRect = useCallback(() => {
    if (!isActive) return;
    
    const step = tourSteps[currentStep];
    
    if (!step.target || step.position === 'center') {
      setTargetRect(null);
      return;
    }
    
    const target = document.querySelector(step.target);
    
    if (target) {
      const rect = target.getBoundingClientRect();
      const padding = step.highlightPadding ?? 8;
      
      // Expand rect by padding
      const expandedRect = new DOMRect(
        rect.left - padding,
        rect.top - padding,
        rect.width + padding * 2,
        rect.height + padding * 2
      );
      
      setTargetRect(expandedRect);
    } else {
      setTargetRect(null);
    }
  }, [currentStep, isActive]);

  useEffect(() => {
    updateTargetRect();
    
    const handleResize = () => updateTargetRect();
    const handleScroll = () => updateTargetRect();
    
    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleScroll);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleScroll);
    };
  }, [updateTargetRect]);

  const handleNext = () => {
    if (currentStep < tourSteps.length - 1) {
      const nextStep = currentStep + 1;
      setCurrentStep(nextStep);
      onboarding.setCurrentStep(nextStep);
    } else {
      handleComplete();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      const prevStep = currentStep - 1;
      setCurrentStep(prevStep);
      onboarding.setCurrentStep(prevStep);
    }
  };

  const handleComplete = () => {
    onboarding.markComplete();
    setIsActive(false);
  };

  const handleSkip = () => {
    handleComplete();
  };

  if (!mounted || !isActive) return null;

  const step = tourSteps[currentStep];
  const isCenter = step.position === 'center' || !step.target;

  // Calculate tooltip position based on target and position preference
  const getTooltipStyle = (): React.CSSProperties => {
    if (isCenter || !targetRect) {
      return {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
      };
    }

    const offset = 16;
    const tooltipWidth = 360;
    const tooltipHeight = 220;

    switch (step.position) {
      case 'right':
        return {
          position: 'fixed',
          top: Math.max(16, Math.min(targetRect.top + targetRect.height / 2 - tooltipHeight / 2, window.innerHeight - tooltipHeight - 16)),
          left: Math.min(targetRect.right + offset, window.innerWidth - tooltipWidth - 16),
        };
      case 'left':
        return {
          position: 'fixed',
          top: Math.max(16, Math.min(targetRect.top + targetRect.height / 2 - tooltipHeight / 2, window.innerHeight - tooltipHeight - 16)),
          left: Math.max(16, targetRect.left - tooltipWidth - offset),
        };
      case 'bottom':
        return {
          position: 'fixed',
          top: Math.min(targetRect.bottom + offset, window.innerHeight - tooltipHeight - 16),
          left: Math.max(16, Math.min(targetRect.left + targetRect.width / 2 - tooltipWidth / 2, window.innerWidth - tooltipWidth - 16)),
        };
      case 'top':
        return {
          position: 'fixed',
          top: Math.max(16, targetRect.top - tooltipHeight - offset),
          left: Math.max(16, Math.min(targetRect.left + targetRect.width / 2 - tooltipWidth / 2, window.innerWidth - tooltipWidth - 16)),
        };
      default:
        return {};
    }
  };

  return (
    <div className="fixed inset-0 z-[9997]">
      {/* Backdrop with spotlight hole */}
      <div className="absolute inset-0 pointer-events-auto">
        {targetRect ? (
          <svg className="w-full h-full">
            <defs>
              <mask id="spotlight-mask">
                <rect x="0" y="0" width="100%" height="100%" fill="white" />
                <rect
                  x={targetRect.left}
                  y={targetRect.top}
                  width={targetRect.width}
                  height={targetRect.height}
                  rx="8"
                  ry="8"
                  fill="black"
                />
              </mask>
            </defs>
            <rect
              x="0"
              y="0"
              width="100%"
              height="100%"
              fill="rgba(0, 0, 0, 0.85)"
              mask="url(#spotlight-mask)"
            />
            {/* Spotlight border glow */}
            <rect
              x={targetRect.left - 2}
              y={targetRect.top - 2}
              width={targetRect.width + 4}
              height={targetRect.height + 4}
              rx="10"
              ry="10"
              fill="none"
              stroke="var(--netflix-red)"
              strokeWidth="2"
              className="animate-pulse"
            />
          </svg>
        ) : (
          <div className="w-full h-full bg-black/85" />
        )}
      </div>

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        className="z-[9999] w-[360px] bg-netflix-dark border border-netflix-gray/30 rounded-2xl shadow-2xl overflow-hidden animate-scale-up"
        style={getTooltipStyle()}
      >
        {/* Progress bar */}
        <div className="h-1 bg-netflix-bg">
          <div 
            className="h-full bg-netflix-red transition-all duration-300"
            style={{ width: `${((currentStep + 1) / tourSteps.length) * 100}%` }}
          />
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Step indicator dots */}
          <div className="flex items-center gap-1.5 mb-4">
            {tourSteps.map((_, index) => (
              <div
                key={index}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  index === currentStep
                    ? 'w-6 bg-netflix-red'
                    : index < currentStep
                    ? 'w-1.5 bg-netflix-red/50'
                    : 'w-1.5 bg-netflix-gray/30'
                }`}
              />
            ))}
            <span className="ml-auto text-xs text-netflix-gray">
              {currentStep + 1} / {tourSteps.length}
            </span>
          </div>

          {/* Title */}
          <h3 className="text-xl font-bold text-netflix-light mb-3">{step.title}</h3>
          
          {/* Description */}
          <p className="text-sm text-netflix-gray leading-relaxed">{step.description}</p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-netflix-gray/20 bg-netflix-bg/30">
          <button
            onClick={handleSkip}
            className="text-sm text-netflix-gray hover:text-netflix-light transition-colors"
          >
            Skip tour
          </button>
          <div className="flex items-center gap-2">
            {currentStep > 0 && (
              <button
                onClick={handlePrev}
                className="px-4 py-2 text-sm text-netflix-light hover:bg-netflix-gray/20 rounded-lg transition-colors flex items-center gap-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back
              </button>
            )}
            <button
              onClick={handleNext}
              className="px-5 py-2 text-sm bg-netflix-red hover:bg-red-600 text-white rounded-lg transition-colors flex items-center gap-1 font-medium"
            >
              {currentStep === tourSteps.length - 1 ? (
                <>
                  Get Started
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </>
              ) : (
                <>
                  Next
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
