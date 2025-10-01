/**
 * Magnetic Field Effect Component - Chain Reaction Visual Effect
 * 
 * Renders magnetic field interactions between elements
 * Part of Phase 2 Quantum Fluid Animation System
 * 
 * Features:
 * - Quantum magnetic field lines
 * - Field strength visualization
 * - GPU-accelerated field animations
 * - Physics-based field decay
 * 
 * Updated: 2025-06-10 17:56:00 +08:00
 * Integrates: quantum-animations.scss system
 */

import React, { useEffect, useRef } from 'react';
import { ActiveEffect } from '../ChainReactionProvider';

interface MagneticFieldProps {
  effect: ActiveEffect;
}

export const MagneticField: React.FC<MagneticFieldProps> = ({ effect }) => {
  const fieldRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!fieldRef.current) return;

    const { sourceElement, intensity, duration } = effect;
    const { position } = sourceElement;
    
    // Convert page coordinates to viewport coordinates
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    
    const centerX = position.x - scrollLeft;
    const centerY = position.y - scrollTop;

    // Create magnetic field rings
    const fieldContainer = fieldRef.current;
    const ringCount = 3;
    
    for (let i = 0; i < ringCount; i++) {
      const ring = document.createElement('div');
      const size = 50 + (i * 40);
      const delay = i * 100;
      const ringIntensity = intensity * (1 - i * 0.3);
      
      ring.style.cssText = `
        position: absolute;
        left: ${centerX}px;
        top: ${centerY}px;
        width: ${size}px;
        height: ${size}px;
        border: 2px solid rgba(255, 100, 150, ${ringIntensity * 0.6});
        border-radius: 50%;
        box-shadow: 
          0 0 10px rgba(255, 100, 150, ${ringIntensity * 0.4}),
          inset 0 0 10px rgba(255, 100, 150, ${ringIntensity * 0.2});
        transform: translate(-50%, -50%) scale(0);
        animation: quantum-magnetic-field ${duration}ms var(--quantum-magnetic-propagate) ${delay}ms forwards;
        pointer-events: none;
        z-index: 997;
        opacity: 0;
      `;
      
      fieldContainer.appendChild(ring);
    }

    // Create magnetic field lines (simplified as rotating lines)
    const lineCount = 6;
    for (let i = 0; i < lineCount; i++) {
      const line = document.createElement('div');
      const angle = (i * 360) / lineCount;
      const lineLength = 60 + (intensity * 40);
      
      line.style.cssText = `
        position: absolute;
        left: ${centerX}px;
        top: ${centerY}px;
        width: ${lineLength}px;
        height: 1px;
        background: linear-gradient(90deg,
          rgba(255, 100, 150, 0),
          rgba(255, 100, 150, ${intensity * 0.8}),
          rgba(255, 100, 150, 0)
        );
        transform-origin: 0 50%;
        transform: translate(0, -50%) rotate(${angle}deg) scaleX(0);
        animation: quantum-field-line ${duration}ms var(--quantum-magnetic-propagate) ${i * 50}ms forwards;
        pointer-events: none;
        z-index: 996;
      `;
      
      fieldContainer.appendChild(line);
    }

  }, [effect]);

  return <div ref={fieldRef} />;
}; 