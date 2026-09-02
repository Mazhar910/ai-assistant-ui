export interface ChatMessage {
  role: string;
  content: string;
}

export interface ChatRequest {
  message: string;
  conversationId?: string;
}

export interface ChatResponse {
  conversationId: string;
  reply: string;
  timestamp: string;
  /** Model that produced this reply, when one was selected via the fallback chain. */
  model?: string;
}

/** Server session listing (updatedAt serialized as an ISO-8601 string). */
export interface ChatSession {
  conversationId: string;
  title: string;
  updatedAt: string;
}

/** UI-side session record: updatedAt normalized to epoch millis for sorting/merging. */
export interface ChatSessionRecord {
  conversationId: string;
  title: string;
  updatedAt: number;
}

export interface AuthResponse {
  token?: string;
  username?: string;
  role?: string;
  message?: string;
}

export interface User {
  id: number;
  username: string;
  email: string;
  role: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  totalTokens: number;
  conversationCount: number;
}

export interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  totalTokens: number;
  totalConversations: number;
  tokensByModel: { model: string; tokens: number }[];
  dailyUsage: { date: string; tokens: number }[];
}

export type ChatJobState = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export interface ChatJobStatus {
  jobId: string;
  conversationId?: string;
  state: ChatJobState;
  submittedAt: string;
  reply?: string;
  errorCode?: string;
  error?: string;
  message?: string;
}
