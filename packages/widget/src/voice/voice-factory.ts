// Voice Provider Factory
// Creates appropriate voice provider based on configuration

import type { VoiceProvider, VoiceConfig } from '../types';
import { RuntypeVoiceProvider } from './runtype-voice-provider';
import { BrowserVoiceProvider } from './browser-voice-provider';

export function createVoiceProvider(config: VoiceConfig): VoiceProvider {
  switch (config.type) {
    case 'runtype':
      if (!config.runtype) {
        throw new Error('Runtype voice provider requires configuration');
      }
      return new RuntypeVoiceProvider(config.runtype);
    
    case 'browser':
      if (!BrowserVoiceProvider.isSupported()) {
        throw new Error('Browser speech recognition not supported');
      }
      return new BrowserVoiceProvider(config.browser || {});
    
    case 'custom':
      throw new Error('Custom voice providers not yet implemented');
    
    default:
      throw new Error(`Unknown voice provider type: ${config.type}`);
  }
}

// Auto-select the best available provider
export function createBestAvailableVoiceProvider(config?: Partial<VoiceConfig>): VoiceProvider {
  // Prefer Runtype if configured
  if (config?.type === 'runtype' && config.runtype) {
    return createVoiceProvider({ type: 'runtype', runtype: config.runtype });
  }
  
  // Fall back to browser if supported
  if (BrowserVoiceProvider.isSupported()) {
    return createVoiceProvider({ 
      type: 'browser', 
      browser: config?.browser || { language: 'en-US' }
    });
  }
  
  throw new Error('No supported voice providers available');
}

// Check if any voice provider is available
export function isVoiceSupported(config?: Partial<VoiceConfig>): boolean {
  try {
    createBestAvailableVoiceProvider(config);
    return true;
  } catch (error) {
    return false;
  }
}