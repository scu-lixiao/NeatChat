/**
 * useChainReaction Hook - Simplified API for Chain Reaction System
 * 
 * Provides easy-to-use interface for components to participate in chain reactions
 * Part of Phase 2 Quantum Fluid Animation System
 * 
 * Features:
 * - Automatic element registration with position tracking
 * - Simplified trigger methods
 * - Performance-optimized position updates
 * - TypeScript-friendly API
 * 
 * Updated: 2025-06-10 17:51:00 +08:00
 * Integrates: ChainReactionProvider system
 */

import { useCallback, useEffect, useRef } from 'react';
import { useChainReactionContext, ChainReactionEffect, ChainReactionElement } from '../components/chain-reaction/ChainReactionProvider';

export interface UseChainReactionOptions {
  id: string;
  type?: 'source' | 'target' | 'both';
  effects?: ChainReactionEffect[];
  autoRegister?: boolean;
}

export interface UseChainReactionReturn {
  elementRef: React.RefObject<HTMLElement>;
  triggerReaction: (options?: {
    type?: 'click' | 'hover' | 'focus' | 'data-update';
    intensity?: number;
    direction?: 'outward' | 'inward' | 'bidirectional';
  }) => void;
  updatePosition: () => void;
  isRegistered: boolean;
}

export const useChainReaction = (options: UseChainReactionOptions): UseChainReactionReturn => {
  const { registerElement, updateElementPosition, triggerChainReaction } = useChainReactionContext();
  const elementRef = useRef<HTMLElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const isRegisteredRef = useRef(false);

  const {
    id,
    type = 'both',
    effects = ['ripple', 'energy-transfer'],
    autoRegister = true
  } = options;

  // Get element position and size
  const getElementBounds = useCallback(() => {
    if (!elementRef.current) return null;
    
    const rect = elementRef.current.getBoundingClientRect();
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    
    return {
      position: {
        x: rect.left + scrollLeft + rect.width / 2, // Center point
        y: rect.top + scrollTop + rect.height / 2
      },
      size: {
        width: rect.width,
        height: rect.height
      }
    };
  }, []);

  // Register element with chain reaction system
  const registerElementWithSystem = useCallback(() => {
    if (!elementRef.current || isRegisteredRef.current) return;

    const bounds = getElementBounds();
    if (!bounds) return;

    const element: ChainReactionElement = {
      id,
      type,
      position: bounds.position,
      size: bounds.size,
      effects,
      element: elementRef.current
    };

    cleanupRef.current = registerElement(element);
    isRegisteredRef.current = true;

    console.log(`Chain reaction element registered: ${id} at (${bounds.position.x}, ${bounds.position.y})`);
  }, [id, type, effects, registerElement, getElementBounds]);

  // Update element position (for dynamic layouts)
  const updatePosition = useCallback(() => {
    if (!isRegisteredRef.current) return;

    const bounds = getElementBounds();
    if (bounds) {
      updateElementPosition(id, bounds.position);
    }
  }, [id, updateElementPosition, getElementBounds]);

  // Trigger chain reaction from this element
  const triggerReaction = useCallback((triggerOptions: {
    type?: 'click' | 'hover' | 'focus' | 'data-update';
    intensity?: number;
    direction?: 'outward' | 'inward' | 'bidirectional';
  } = {}) => {
    if (!isRegisteredRef.current) {
      console.warn(`Attempting to trigger chain reaction on unregistered element: ${id}`);
      return;
    }

    const {
      type: eventType = 'click',
      intensity = 0.8,
      direction = 'outward'
    } = triggerOptions;

    triggerChainReaction(id, {
      sourceId: id,
      type: eventType,
      intensity,
      direction
    });
  }, [id, triggerChainReaction]);

  // Auto-register element when ref is set
  useEffect(() => {
    if (autoRegister && elementRef.current && !isRegisteredRef.current) {
      // Small delay to ensure element is fully rendered
      const timer = setTimeout(registerElementWithSystem, 10);
      return () => clearTimeout(timer);
    }
  }, [autoRegister, registerElementWithSystem]);

  // Update position on window resize
  useEffect(() => {
    const handleResize = () => {
      updatePosition();
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [updatePosition]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
        isRegisteredRef.current = false;
      }
    };
  }, []);

  return {
    elementRef,
    triggerReaction,
    updatePosition,
    isRegistered: isRegisteredRef.current
  };
};

// Convenience hooks for common use cases
export const useChainReactionSource = (id: string, effects?: ChainReactionEffect[]) => {
  return useChainReaction({
    id,
    type: 'source',
    effects: effects || ['ripple', 'energy-transfer']
  });
};

export const useChainReactionTarget = (id: string) => {
  return useChainReaction({
    id,
    type: 'target',
    effects: [] // Targets don't need effects
  });
};

// Hook for data flow visualization (useful for chat messages, updates)
export const useDataFlowReaction = (id: string) => {
  return useChainReaction({
    id,
    type: 'both',
    effects: ['data-flow', 'ripple']
  });
}; 