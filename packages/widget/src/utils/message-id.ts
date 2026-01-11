/**
 * Message ID utilities for client-side message tracking
 * Used for feedback integration with the Travrse API
 */

/**
 * Generate a unique message ID for tracking
 * Format: msg_{timestamp_base36}_{random_8chars}
 */
export function generateMessageId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `msg_${timestamp}_${random}`;
}

/**
 * Generate a unique user message ID
 * Format: usr_{timestamp_base36}_{random_8chars}
 */
export function generateUserMessageId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `usr_${timestamp}_${random}`;
}

/**
 * Generate a unique assistant message ID
 * Format: ast_{timestamp_base36}_{random_8chars}
 */
export function generateAssistantMessageId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `ast_${timestamp}_${random}`;
}



