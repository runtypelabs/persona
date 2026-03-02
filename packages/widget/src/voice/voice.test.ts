// Voice SDK Tests
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import { VoiceProvider, VoiceResult, VoiceStatus, VoiceConfig } from './provider-interface';
import { RuntypeVoiceProvider } from './runtype-voice-provider';
import { BrowserVoiceProvider } from './browser-voice-provider';
import { createVoiceProvider, createBestAvailableVoiceProvider, isVoiceSupported } from './voice-factory';

// Mock window object for browser tests
const mockWindow = {
  SpeechRecognition: undefined,
  webkitSpeechRecognition: undefined
};

beforeAll(() => {
  // @ts-ignore
  global.window = mockWindow;
});

afterAll(() => {
  // @ts-ignore
  delete global.window;
});

function mockBrowserSupport(supported: boolean) {
  if (supported) {
    mockWindow.SpeechRecognition = class {};
    mockWindow.webkitSpeechRecognition = class {};
  } else {
    delete mockWindow.SpeechRecognition;
    delete mockWindow.webkitSpeechRecognition;
  }
}

// Note: TypeScript interfaces don't exist at runtime, so we can't test them directly
// We test the concrete implementations instead

describe('RuntypeVoiceProvider', () => {
  it('should create instance with valid config', () => {
    const config = {
      agentId: 'test-agent',
      clientToken: 'test-token',
      host: 'localhost:8787',
      voiceId: 'rachel'
    };
    
    const provider = new RuntypeVoiceProvider(config);
    expect(provider).toBeInstanceOf(RuntypeVoiceProvider);
    expect(provider.type).toBe('runtype');
  });
  
  it('should have correct methods', () => {
    const config = {
      agentId: 'test-agent',
      clientToken: 'test-token'
    };
    
    const provider = new RuntypeVoiceProvider(config);
    expect(typeof provider.connect).toBe('function');
    expect(typeof provider.disconnect).toBe('function');
    expect(typeof provider.startListening).toBe('function');
    expect(typeof provider.stopListening).toBe('function');
    expect(typeof provider.onResult).toBe('function');
    expect(typeof provider.onError).toBe('function');
    expect(typeof provider.onStatusChange).toBe('function');
  });
});

describe('BrowserVoiceProvider', () => {
  it('should create instance with default config', () => {
    const provider = new BrowserVoiceProvider();
    expect(provider).toBeInstanceOf(BrowserVoiceProvider);
    expect(provider.type).toBe('browser');
  });
  
  it('should have correct methods', () => {
    const provider = new BrowserVoiceProvider();
    expect(typeof provider.connect).toBe('function');
    expect(typeof provider.disconnect).toBe('function');
    expect(typeof provider.startListening).toBe('function');
    expect(typeof provider.stopListening).toBe('function');
    expect(typeof provider.onResult).toBe('function');
    expect(typeof provider.onError).toBe('function');
    expect(typeof provider.onStatusChange).toBe('function');
  });
  
  it('should check browser support', () => {
    // Test supported
    mockBrowserSupport(true);
    expect(BrowserVoiceProvider.isSupported()).toBe(true);
    
    // Test unsupported
    mockBrowserSupport(false);
    expect(BrowserVoiceProvider.isSupported()).toBe(false);
  });
});

describe('Voice Factory', () => {
  it('should create Runtype provider', () => {
    const config: VoiceConfig = {
      type: 'runtype',
      runtype: {
        agentId: 'test-agent',
        clientToken: 'test-token'
      }
    };
    
    const provider = createVoiceProvider(config);
    expect(provider).toBeInstanceOf(RuntypeVoiceProvider);
    expect(provider.type).toBe('runtype');
  });
  
  it('should create Browser provider when supported', () => {
    // Mock browser support
    mockBrowserSupport(true);
    
    const config: VoiceConfig = {
      type: 'browser',
      browser: {
        language: 'en-US'
      }
    };
    
    const provider = createVoiceProvider(config);
    expect(provider).toBeInstanceOf(BrowserVoiceProvider);
    expect(provider.type).toBe('browser');
  });
  
  it('should throw error for unsupported browser provider', () => {
    // Mock no browser support
    mockBrowserSupport(false);
    
    const config: VoiceConfig = {
      type: 'browser'
    };
    
    expect(() => createVoiceProvider(config)).toThrow('Browser speech recognition not supported');
  });
  
  it('should throw error for custom provider', () => {
    const config: VoiceConfig = {
      type: 'custom',
      custom: {}
    };
    
    expect(() => createVoiceProvider(config)).toThrow('Custom voice providers not yet implemented');
  });
  
  it('should throw error for unknown provider type', () => {
    const config = {
      type: 'unknown' as any
    };
    
    expect(() => createVoiceProvider(config)).toThrow('Unknown voice provider type: unknown');
  });
});

describe('Best Available Voice Provider', () => {
  it('should prefer Runtype when configured', () => {
    // Mock no browser support
    mockBrowserSupport(false);
    
    const config = {
      type: 'runtype',
      runtype: {
        agentId: 'test-agent',
        clientToken: 'test-token'
      }
    };
    
    const provider = createBestAvailableVoiceProvider(config);
    expect(provider).toBeInstanceOf(RuntypeVoiceProvider);
  });
  
  it('should fall back to browser when Runtype not configured', () => {
    // Mock browser support
    mockBrowserSupport(true);
    
    const provider = createBestAvailableVoiceProvider();
    expect(provider).toBeInstanceOf(BrowserVoiceProvider);
  });
  
  it('should throw error when no providers available', () => {
    // Mock no browser support
    mockBrowserSupport(false);
    
    expect(() => createBestAvailableVoiceProvider()).toThrow('No supported voice providers available');
  });
});

describe('Voice Support Check', () => {
  it('should return true when voice is supported', () => {
    // Mock browser support
    mockBrowserSupport(true);
    
    expect(isVoiceSupported()).toBe(true);
  });
  
  it('should return true when Runtype is configured', () => {
    // Mock no browser support
    mockBrowserSupport(false);
    
    const config = {
      type: 'runtype',
      runtype: {
        agentId: 'test-agent',
        clientToken: 'test-token'
      }
    };
    
    expect(isVoiceSupported(config)).toBe(true);
  });
  
  it('should return false when no voice support available', () => {
    // Mock no browser support
    mockBrowserSupport(false);
    
    expect(isVoiceSupported()).toBe(false);
  });
});