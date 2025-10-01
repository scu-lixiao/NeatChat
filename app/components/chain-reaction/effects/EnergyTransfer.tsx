/**
 * Energy Transfer Effect Component - Chain Reaction Visual Effect
 * 
 * Renders energy flow animations between source and target elements
 * Part of Phase 2 Quantum Fluid Animation System
 * 
 * Features:
 * - Quantum energy beam visualization
 * - GPU-accelerated path animations
 * - Dynamic intensity scaling
 * - Physics-based energy decay
 * 
 * Updated: 2025-06-10 17:54:00 +08:00
 * Integrates: quantum-animations.scss system
 */

import React, { useEffect, useRef } from 'react';
import { ActiveEffect } from '../ChainReactionProvider';

interface EnergyTransferProps {
  effect: ActiveEffect;
}

export const EnergyTransfer: React.FC<EnergyTransferProps> = ({ effect }) => {
  const energyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!energyRef.current || effect.targetElements.length === 0) return;

    const { sourceElement, targetElements, intensity, duration } = effect;
    const target = targetElements[0]; // Use first target for now

    // Convert page coordinates to viewport coordinates
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    
    const sourceX = sourceElement.position.x - scrollLeft;
    const sourceY = sourceElement.position.y - scrollTop;
    const targetX = target.position.x - scrollLeft;
    const targetY = target.position.y - scrollTop;

    // Calculate distance and angle
    const dx = targetX - sourceX;
    const dy = targetY - sourceY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);

    // Create energy beam
    const energy = energyRef.current;
    energy.style.cssText = `
      position: absolute;
      left: ${sourceX}px;
      top: ${sourceY}px;
      width: ${distance}px;
      height: 3px;
      background: linear-gradient(90deg, 
        rgba(100, 150, 255, ${intensity * 0.9}), 
        rgba(150, 200, 255, ${intensity * 0.7}), 
        rgba(100, 150, 255, ${intensity * 0.5})
      );
      box-shadow: 
        0 0 10px rgba(100, 150, 255, ${intensity * 0.8}),
        0 0 20px rgba(100, 150, 255, ${intensity * 0.4});
      transform-origin: 0 50%;
      transform: rotate(${angle}deg) scaleX(0);
      animation: quantum-energy-transfer ${duration}ms var(--quantum-energy-flow) forwards;
      pointer-events: none;
      z-index: 999;
    `;

    // Add energy particles along the path
    const particleCount = Math.min(5, Math.floor(distance / 50));
    for (let i = 0; i < particleCount; i++) {
      const particle = document.createElement('div');
      const progress = (i + 1) / (particleCount + 1);
      const particleX = sourceX + dx * progress;
      const particleY = sourceY + dy * progress;
      
      particle.style.cssText = `
        position: absolute;
        left: ${particleX}px;
        top: ${particleY}px;
        width: 4px;
        height: 4px;
        border-radius: 50%;
        background: rgba(100, 150, 255, ${intensity});
        box-shadow: 0 0 8px rgba(100, 150, 255, ${intensity * 0.8});
        transform: translate(-50%, -50%) scale(0);
        animation: quantum-particle-flow ${duration}ms var(--quantum-wave-propagate) ${i * 50}ms forwards;
        pointer-events: none;
        z-index: 1001;
      `;
      
      energy.appendChild(particle);
    }

  }, [effect]);

  return <div ref={energyRef} />;
}; 