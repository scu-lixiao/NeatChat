/**
 * Data Flow Effect Component - Chain Reaction Visual Effect
 * 
 * Renders data flow visualization for information transfer
 * Part of Phase 2 Quantum Fluid Animation System
 * 
 * Features:
 * - Quantum data packet visualization
 * - Binary stream simulation
 * - GPU-accelerated flow animations
 * - Information density representation
 * 
 * Updated: 2025-06-10 17:55:00 +08:00
 * Integrates: quantum-animations.scss system
 */

import React, { useEffect, useRef } from 'react';
import { ActiveEffect } from '../ChainReactionProvider';

interface DataFlowProps {
  effect: ActiveEffect;
}

export const DataFlow: React.FC<DataFlowProps> = ({ effect }) => {
  const dataFlowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dataFlowRef.current || effect.targetElements.length === 0) return;

    const { sourceElement, targetElements, intensity, duration } = effect;
    const target = targetElements[0];

    // Convert page coordinates to viewport coordinates
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    
    const sourceX = sourceElement.position.x - scrollLeft;
    const sourceY = sourceElement.position.y - scrollTop;
    const targetX = target.position.x - scrollLeft;
    const targetY = target.position.y - scrollTop;

    // Calculate flow path
    const dx = targetX - sourceX;
    const dy = targetY - sourceY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Create data packets
    const packetCount = Math.min(8, Math.floor(distance / 30));
    const container = dataFlowRef.current;
    
    for (let i = 0; i < packetCount; i++) {
      const packet = document.createElement('div');
      const delay = (i * duration) / (packetCount * 2);
      
      // Generate random binary data appearance
      const binaryChars = ['0', '1', '|', '-', '•'];
      const char = binaryChars[Math.floor(Math.random() * binaryChars.length)];
      
      packet.textContent = char;
      packet.style.cssText = `
        position: absolute;
        left: ${sourceX}px;
        top: ${sourceY}px;
        font-family: 'Courier New', monospace;
        font-size: 12px;
        color: rgba(100, 255, 150, ${intensity});
        text-shadow: 
          0 0 5px rgba(100, 255, 150, ${intensity * 0.8}),
          0 0 10px rgba(100, 255, 150, ${intensity * 0.4});
        transform: translate(-50%, -50%);
        animation: quantum-data-flow ${duration}ms var(--quantum-data-stream) ${delay}ms forwards;
        pointer-events: none;
        z-index: 1002;
        opacity: 0;
      `;
      
      // Set custom CSS properties for animation targets
      packet.style.setProperty('--target-x', `${targetX - sourceX}px`);
      packet.style.setProperty('--target-y', `${targetY - sourceY}px`);
      
      container.appendChild(packet);
    }

    // Create data stream line
    const streamLine = document.createElement('div');
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    
    streamLine.style.cssText = `
      position: absolute;
      left: ${sourceX}px;
      top: ${sourceY}px;
      width: ${distance}px;
      height: 1px;
      background: linear-gradient(90deg, 
        rgba(100, 255, 150, 0),
        rgba(100, 255, 150, ${intensity * 0.6}),
        rgba(100, 255, 150, 0)
      );
      transform-origin: 0 50%;
      transform: rotate(${angle}deg) scaleX(0);
      animation: quantum-stream-line ${duration * 0.8}ms var(--quantum-data-stream) forwards;
      pointer-events: none;
      z-index: 998;
    `;
    
    container.appendChild(streamLine);

  }, [effect]);

  return <div ref={dataFlowRef} />;
}; 