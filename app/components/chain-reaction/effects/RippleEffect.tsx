/**
 * Ripple Effect Component - Chain Reaction Visual Effect
 * 
 * Renders expanding ripple animations for chain reactions
 * Part of Phase 2 Quantum Fluid Animation System
 * 
 * Features:
 * - Quantum-based ripple expansion
 * - GPU-accelerated animations
 * - Intensity-based scaling
 * - Physics-realistic wave propagation
 * 
 * Updated: 2025-06-10 17:53:00 +08:00
 * Integrates: quantum-animations.scss system
 */

import React, { useEffect, useRef } from 'react';
import { ActiveEffect } from '../ChainReactionProvider';

interface RippleEffectProps {
  effect: ActiveEffect;
}

export const RippleEffect: React.FC<RippleEffectProps> = ({ effect }) => {
  const rippleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!rippleRef.current) return;

    const { sourceElement, intensity, duration } = effect;
    const { position } = sourceElement;
    
    // Convert page coordinates to viewport coordinates
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    
    const viewportX = position.x - scrollLeft;
    const viewportY = position.y - scrollTop;

    // Set initial position and style
    const ripple = rippleRef.current;
    ripple.style.cssText = `
      position: absolute;
      left: ${viewportX}px;
      top: ${viewportY}px;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(100, 150, 255, ${intensity * 0.6}), rgba(100, 150, 255, 0));
      border: 2px solid rgba(100, 150, 255, ${intensity * 0.8});
      transform: translate(-50%, -50%) scale(0);
      animation: quantum-ripple-expand ${duration}ms var(--quantum-wave-propagate) forwards;
      pointer-events: none;
      z-index: 1000;
    `;

  }, [effect]);

  return <div ref={rippleRef} />;
}; 