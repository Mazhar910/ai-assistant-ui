import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ChatMessage, ChatResponse, User, AdminStats, ChatJobStatus } from '../models/chat';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AgentService {

  private readonly baseUrl = `${environment.apiBaseUrl}/agent`;
  private readonly adminUrl = `${environment.apiBaseUrl}/admin`;

  constructor(private http: HttpClient) { }

  sendMessage(message: string, conversationId?: string): Observable<ChatResponse> {
    return this.http.post<ChatResponse>(`${this.baseUrl}/chat`, { message, conversationId });
  }

  /** Submits a chat turn to the async job queue; returns immediately with a jobId. */
  sendMessageAsync(message: string, conversationId?: string): Observable<ChatJobStatus> {
    return this.http.post<ChatJobStatus>(`${this.baseUrl}/chat/async`, { message, conversationId });
  }

  /** Polls the status of an async chat job until it completes or fails. */
  getJobStatus(jobId: string): Observable<ChatJobStatus> {
    return this.http.get<ChatJobStatus>(`${this.baseUrl}/jobs/${jobId}/status`);
  }

  newConversation(): Observable<{ conversationId: string }> {
    return this.http.post<{ conversationId: string }>(`${this.baseUrl}/conversation`, {});
  }

  getHistory(conversationId: string): Observable<ChatMessage[]> {
    return this.http.get<ChatMessage[]>(`${this.baseUrl}/conversation/${conversationId}`);
  }

  clearConversation(conversationId: string): Observable<{ cleared: boolean }> {
    return this.http.delete<{ cleared: boolean }>(`${this.baseUrl}/conversation/${conversationId}`);
  }

  getSessions(): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/sessions`);
  }

  getSuggestions(): Observable<string[]> {
    return this.http.get<string[]>(`${this.baseUrl}/suggestions`);
  }

  // Admin APIs
  getAllUsers(): Observable<User[]> {
    return this.http.get<User[]>(`${this.adminUrl}/users`);
  }

  toggleUserAccess(userId: number): Observable<any> {
    return this.http.put<any>(`${this.adminUrl}/user/${userId}/toggle-access`, {});
  }

  changeUserRole(userId: number, role: string): Observable<any> {
    return this.http.put<any>(`${this.adminUrl}/user/${userId}/role`, { role });
  }

  deleteUser(userId: number): Observable<any> {
    return this.http.delete<any>(`${this.adminUrl}/user/${userId}`);
  }

  getStats(): Observable<AdminStats> {
    return this.http.get<AdminStats>(`${this.adminUrl}/stats`);
  }

  getUserStats(userId: number): Observable<any> {
    return this.http.get<any>(`${this.adminUrl}/stats/user/${userId}`);
  }
}
