/**
 * Chain Reaction Animation System - Core Provider
 * 
 * Manages global chain reaction state and animation scheduling
 * Part of Phase 2 Quantum Fluid Animation System
 * 
 * Features:
 * - Element registration and spatial relationship tracking
 * - Animation sequence scheduling and management
 * - Energy transfer and ripple effect coordination
 * - Data flow visualization support
 * 
 * Updated: 2025-06-10 17:50:00 +08:00
 * Integrates: premium-animations.scss quantum system
 */

import React, { createContext, useContext, useRef, useState, useCallback, ReactNode } from 'react';

// Types for chain reaction system
export interface ChainReactionElement {
  id: string;
  type: 'source' | 'target' | 'both';
  position: { x: number; y: number };
  size: { width: number; height: number };
  effects: ChainReactionEffect[];
  element: HTMLElement;
}

export type ChainReactionEffect = 'ripple' | 'energy-transfer' | 'data-flow' | 'magnetic-field';

export interface ChainReactionEvent {
  id: string;
  sourceId: string;
  type: 'click' | 'hover' | 'focus' | 'data-update';
  intensity: number; // 0.1 - 1.0
  direction: 'outward' | 'inward' | 'bidirectional';
  timestamp: number;
}

export interface ActiveEffect {
  id: string;
  type: ChainReactionEffect;
  sourceElement: ChainReactionElement;
  targetElements: ChainReactionElement[];
  startTime: number;
  duration: number;
  intensity: number;
}

interface ChainReactionContextType {
  elements: Map<string, ChainReactionElement>;
  activeEffects: ActiveEffect[];
  registerElement: (element: ChainReactionElement) => () => void;
  updateElementPosition: (id: string, position: { x: number; y: number }) => void;
  triggerChainReaction: (sourceId: string, event: Omit<ChainReactionEvent, 'id' | 'timestamp'>) => void;
  isEnabled: boolean;
  setEnabled: (enabled: boolean) => void;
}

const ChainReactionContext = createContext<ChainReactionContextType | null>(null);

export const useChainReactionContext = () => {
  const context = useContext(ChainReactionContext);
  if (!context) {
    throw new Error('useChainReactionContext must be used within ChainReactionProvider');
  }
  return context;
};

interface ChainReactionProviderProps {
  children: ReactNode;
  enabled?: boolean;
}

export const ChainReactionProvider: React.FC<ChainReactionProviderProps> = ({ 
  children, 
  enabled = true 
}) => {
  const [isEnabled, setEnabled] = useState(enabled);
  const elementsRef = useRef<Map<string, ChainReactionElement>>(new Map());
  const [activeEffects, setActiveEffects] = useState<ActiveEffect[]>([]);
  const animationFrameRef = useRef<number>();

  // Calculate distance between two elements
  const calculateDistance = useCallback((elem1: ChainReactionElement, elem2: ChainReactionElement): number => {
    const dx = elem2.position.x - elem1.position.x;
    const dy = elem2.position.y - elem1.position.y;
    return Math.sqrt(dx * dx + dy * dy);
  }, []);

  // Calculate angle between two elements
  const calculateAngle = useCallback((source: ChainReactionElement, target: ChainReactionElement): number => {
    const dx = target.position.x - source.position.x;
    const dy = target.position.y - source.position.y;
    return Math.atan2(dy, dx);
  }, []);

  // Find nearby elements for chain reaction propagation
  const findNearbyElements = useCallback((sourceId: string, maxDistance: number = 300): ChainReactionElement[] => {
    const source = elementsRef.current.get(sourceId);
    if (!source) return [];

    const nearby: ChainReactionElement[] = [];
    
    elementsRef.current.forEach((element) => {
      if (element.id !== sourceId && (element.type === 'target' || element.type === 'both')) {
        const distance = calculateDistance(source, element);
        if (distance <= maxDistance) {
          nearby.push(element);
        }
      }
    });

    // Sort by distance for natural propagation order
    return nearby.sort((a, b) => calculateDistance(source, a) - calculateDistance(source, b));
  }, [calculateDistance]);

  // Register element for chain reaction system
  const registerElement = useCallback((element: ChainReactionElement) => {
    elementsRef.current.set(element.id, element);
    
    // Return cleanup function
    return () => {
      elementsRef.current.delete(element.id);
    };
  }, []);

  // Update element position (for dynamic layouts)
  const updateElementPosition = useCallback((id: string, position: { x: number; y: number }) => {
    const element = elementsRef.current.get(id);
    if (element) {
      element.position = position;
    }
  }, []);

  // Generate quantum-based timing delays for chain reactions
  const generateQuantumDelays = useCallback((targetCount: number, baseDelay: number = 50): number[] => {
    const delays: number[] = [];
    for (let i = 0; i < targetCount; i++) {
      // Quantum energy levels: E = n * hf (simplified as progressive delays)
      const quantumLevel = Math.floor(i / 3) + 1; // Group every 3 elements in same quantum level
      const quantumDelay = baseDelay * quantumLevel * (1 + Math.random() * 0.3); // Add quantum uncertainty
      delays.push(quantumDelay);
    }
    return delays;
  }, []);

  // Trigger chain reaction animation
  const triggerChainReaction = useCallback((
    sourceId: string, 
    event: Omit<ChainReactionEvent, 'id' | 'timestamp'>
  ) => {
    if (!isEnabled) return;

    const sourceElement = elementsRef.current.get(sourceId);
    if (!sourceElement) {
      console.warn(`Chain reaction source element not found: ${sourceId}`);
      return;
    }

    // Find target elements based on effect type and distance
    const maxDistance = event.intensity * 400; // Intensity affects propagation distance
    const targetElements = findNearbyElements(sourceId, maxDistance);

    if (targetElements.length === 0) {
      console.log(`No target elements found for chain reaction from ${sourceId}`);
      return;
    }

    // Generate quantum delays for progressive activation
    const delays = generateQuantumDelays(targetElements.length);

    // Create effects for each target element
    sourceElement.effects.forEach((effectType) => {
      targetElements.forEach((target, index) => {
        const effectId = `${sourceId}-${target.id}-${effectType}-${Date.now()}-${index}`;
        
        setTimeout(() => {
          const effect: ActiveEffect = {
            id: effectId,
            type: effectType,
            sourceElement,
            targetElements: [target],
            startTime: Date.now(),
            duration: effectType === 'ripple' ? 600 : effectType === 'energy-transfer' ? 800 : 1000,
            intensity: event.intensity * (1 - index * 0.1), // Decreasing intensity
          };

          setActiveEffects(prev => [...prev, effect]);

          // Auto-remove effect after duration
          setTimeout(() => {
            setActiveEffects(prev => prev.filter(e => e.id !== effectId));
          }, effect.duration);

        }, delays[index]);
      });
    });

    // Log for debugging
    console.log(`Chain reaction triggered from ${sourceId} to ${targetElements.length} targets`);
  }, [isEnabled, findNearbyElements, generateQuantumDelays]);

  // Cleanup active effects periodically
  React.useEffect(() => {
    const cleanup = () => {
      const now = Date.now();
      setActiveEffects(prev => 
        prev.filter(effect => (now - effect.startTime) < effect.duration)
      );
    };

    const interval = setInterval(cleanup, 100);
    return () => clearInterval(interval);
  }, []);

  const contextValue: ChainReactionContextType = {
    elements: elementsRef.current,
    activeEffects,
    registerElement,
    updateElementPosition,
    triggerChainReaction,
    isEnabled,
    setEnabled,
  };

  return (
    <ChainReactionContext.Provider value={contextValue}>
      {children}
    </ChainReactionContext.Provider>
  );
}; 