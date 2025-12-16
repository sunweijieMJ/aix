/**
 * @fileoverview Chat component English locale
 */

import type { ChatLocale } from './index';

export default {
  // Sender input
  placeholder: 'Type a message...',
  send: 'Send',
  sending: 'Sending...',
  enterToSend: 'Enter to send',
  shiftEnterNewLine: 'Shift + Enter for new line',

  // Bubble messages
  copy: 'Copy',
  copied: 'Copied',
  retry: 'Retry',
  regenerate: 'Regenerate',
  delete: 'Delete',
  user: 'You',
  assistant: 'Assistant',
  system: 'System',

  // Prompts
  selectPrompt: 'Choose one to start',
  quickStart: 'Quick Start',

  // Conversations
  newChat: 'New Chat',
  conversations: 'Conversations',
  deleteConversation: 'Delete Conversation',
  renameConversation: 'Rename',
  conversationTitle: 'Conversation {count}',

  // Error messages
  networkError: 'Network error, please try again later',
  apiError: 'API call failed',
  timeout: 'Request timeout',
  unknownError: 'Unknown error',

  // Status
  thinking: 'Thinking...',
  typing: 'Typing...',
  generating: 'Generating...',
  stopped: 'Stopped',

  // Confirmations
  confirmDelete: 'Are you sure to delete this message?',
  confirmClear: 'Are you sure to clear all messages?',
  confirmStop: 'Are you sure to stop generating?',

  // Attachments
  uploadFile: 'Upload File',
  uploadImage: 'Upload Image',
  fileUploaded: 'File uploaded',
  uploadFailed: 'Upload failed',
  fileSizeLimit: 'File size cannot exceed {size}',

  // Others
  clearAll: 'Clear All',
  exportChat: 'Export Chat',
  settings: 'Settings',
  model: 'Model',
  temperature: 'Temperature',
  maxTokens: 'Max Length',

  // ErrorBoundary
  errorTitle: 'Oops, Something went wrong',
  errorMessage: 'An error occurred',
  errorDetails: 'View error details',
  reload: 'Reload page',
} as const satisfies ChatLocale;
