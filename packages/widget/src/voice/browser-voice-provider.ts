// Browser Voice Provider
// Fallback implementation using Web Speech API

import type { VoiceProvider, VoiceResult, VoiceStatus, VoiceConfig } from '../types';

export class BrowserVoiceProvider implements VoiceProvider {
  type: 'browser' = 'browser';
  private recognition: any = null;
  private resultCallbacks: ((result: VoiceResult) => void)[] = [];
  private errorCallbacks: ((error: Error) => void)[] = [];
  private statusCallbacks: ((status: VoiceStatus) => void)[] = [];
  private isListening = false;
  private w: any = typeof window !== 'undefined' ? window : undefined;

  constructor(private config: VoiceConfig['browser'] = {}) {}

  async connect() {
    // Browser provider doesn't need connection
    this.statusCallbacks.forEach(cb => cb('connected'));
  }

  async startListening() {
    try {
      if (this.isListening) {
        throw new Error('Already listening');
      }
      
      if (!this.w) {
        throw new Error('Window object not available');
      }
      
      // @ts-ignore - Browser SpeechRecognition API
      const SpeechRecognition = this.w!.SpeechRecognition || this.w!.webkitSpeechRecognition;
      
      if (!SpeechRecognition) {
        throw new Error('Browser speech recognition not supported');
      }
      
      this.recognition = new SpeechRecognition();
      this.recognition.lang = this.config?.language || 'en-US';
      this.recognition.continuous = this.config?.continuous || false;
      this.recognition.interimResults = true;
      
      this.recognition.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((result: any) => result[0])
          .map((result: any) => result.transcript)
          .join('');
        
        const isFinal = event.results[event.results.length - 1].isFinal;
        
        this.resultCallbacks.forEach(cb => cb({
          text: transcript,
          confidence: isFinal ? 0.8 : 0.5,
          provider: 'browser'
        }));
        
        if (isFinal && !this.config?.continuous) {
          this.stopListening();
        }
      };
      
      this.recognition.onerror = (event: any) => {
        this.errorCallbacks.forEach(cb => cb(new Error(event.error)));
        this.statusCallbacks.forEach(cb => cb('error'));
      };
      
      this.recognition.onstart = () => {
        this.isListening = true;
        this.statusCallbacks.forEach(cb => cb('listening'));
      };
      
      this.recognition.onend = () => {
        this.isListening = false;
        this.statusCallbacks.forEach(cb => cb('idle'));
      };
      
      this.recognition.start();
      
    } catch (error) {
      this.errorCallbacks.forEach(cb => cb(error as Error));
      this.statusCallbacks.forEach(cb => cb('error'));
      throw error;
    }
  }

  async stopListening() {
    if (this.recognition) {
      this.recognition.stop();
      this.recognition = null;
    }
    
    this.isListening = false;
    this.statusCallbacks.forEach(cb => cb('idle'));
  }

  onResult(callback: (result: VoiceResult) => void): void {
    this.resultCallbacks.push(callback);
  }

  onError(callback: (error: Error) => void): void {
    this.errorCallbacks.push(callback);
  }

  onStatusChange(callback: (status: VoiceStatus) => void): void {
    this.statusCallbacks.push(callback);
  }

  async disconnect(): Promise<void> {
    await this.stopListening();
    this.statusCallbacks.forEach(cb => cb('disconnected'));
  }

  // Check if browser supports speech recognition
  static isSupported(): boolean {
    // @ts-ignore
    return 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
  }
}