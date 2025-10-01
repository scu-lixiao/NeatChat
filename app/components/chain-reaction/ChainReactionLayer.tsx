/**
 * Chain Reaction Layer - Portal Rendering System
 * 
 * Renders chain reaction effects in a portal layer above all content
 * Part of Phase 2 Quantum Fluid Animation System
 * 
 * Features:
 * - Portal-based rendering to avoid z-index conflicts
 * - Real-time effect rendering and cleanup
 * - Performance-optimized animation handling
 * - GPU-accelerated effect components
 * 
 * Updated: 2025-06-10 17:52:00 +08:00
 * Integrates: quantum-animations.scss + effect components
 */

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useChainReactionContext } from './ChainReactionProvider';
import { RippleEffect } from './effects/RippleEffect';
import { EnergyTransfer } from './effects/EnergyTransfer';
import { DataFlow } from './effects/DataFlow';
import { MagneticField } from './effects/MagneticField';

export const ChainReactionLayer: React.FC = () => {
  const { activeEffects, isEnabled } = useChainReactionContext();
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);

  // Create portal container
  useEffect(() => {
    const container = document.createElement('div');
    container.id = 'chain-reaction-layer';
    container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 9999;
      overflow: hidden;
    `;
    
    document.body.appendChild(container);
    setPortalContainer(container);

    return () => {
      if (container.parentNode) {
        container.parentNode.removeChild(container);
      }
    };
  }, []);

  // Don't render if disabled or no container
  if (!isEnabled || !portalContainer || activeEffects.length === 0) {
    return null;
  }

  // Render effects in portal
  return createPortal(
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {activeEffects.map((effect) => {
        const key = effect.id;
        
        switch (effect.type) {
          case 'ripple':
            return (
              <RippleEffect
                key={key}
                effect={effect}
              />
            );
          
          case 'energy-transfer':
            return (
              <EnergyTransfer
                key={key}
                effect={effect}
              />
            );
          
          case 'data-flow':
            return (
              <DataFlow
                key={key}
                effect={effect}
              />
            );
          
          case 'magnetic-field':
            return (
              <MagneticField
                key={key}
                effect={effect}
              />
            );
          
          default:
            console.warn(`Unknown chain reaction effect type: ${effect.type}`);
            return null;
        }
      })}
    </div>,
    portalContainer
  );
}; 