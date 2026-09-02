import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

import { ChatSessionRecord } from '../models/chat';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.css']
})
export class SidebarComponent {

  @Input() sessions: ChatSessionRecord[] = [];
  @Input() activeSessionId: string | null = null;
  @Input() isAdmin = false;
  @Input() userName = '';
  @Input() isDark = false;

  @Output() newChat = new EventEmitter<void>();
  @Output() selectSession = new EventEmitter<string>();
  @Output() deleteSession = new EventEmitter<string>();
  @Output() toggleTheme = new EventEmitter<void>();
  @Output() logout = new EventEmitter<void>();
  @Output() goAdmin = new EventEmitter<void>();

  get userInitials(): string {
    const parts = this.userName.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    const first = parts[0].charAt(0);
    const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
    return (first + last).toUpperCase();
  }
}
