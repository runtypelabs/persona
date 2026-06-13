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
    
    case 'custom': {
      // Bring-your-own provider: `custom` is either a ready VoiceProvider
      // instance or a `() => VoiceProvider` factory (deferred construction, so
      // resources like a WebSocket or AudioContext are only created when voice
      // is actually set up). Resolve and sanity-check the shape.
      const custom = config.custom;
      if (!custom) {
        throw new Error(
          'Custom voice provider requires a `custom` provider instance or factory'
        );
      }
      const provider = typeof custom === 'function' ? custom() : custom;
      if (!provider || typeof provider.startListening !== 'function') {
        throw new Error(
          'Custom voice provider `custom` must be a VoiceProvider (or a factory returning one)'
        );
      }
      return provider;
    }

    default:
      throw new Error(`Unknown voice provider type: ${config.type}`);
  }
}

// Auto-select the best available provider
export function createBestAvailableVoiceProvider(config?: Partial<VoiceConfig>): VoiceProvider {
  // Honor an explicit bring-your-own provider before any built-in.
  if (config?.type === 'custom' && config.custom) {
    return createVoiceProvider({ type: 'custom', custom: config.custom });
  }

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