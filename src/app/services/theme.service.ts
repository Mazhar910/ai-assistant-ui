import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {

  private readonly themeKey = 'aiAgentTheme';

  constructor() {
    const saved = localStorage.getItem(this.themeKey);
    if (saved === 'dark') {
      document.documentElement.classList.add('dark');
    } else if (saved === 'light') {
      document.documentElement.classList.remove('dark');
    } else {
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.documentElement.classList.add('dark');
      }
    }
  }

  get isDark(): boolean {
    return document.documentElement.classList.contains('dark');
  }

  toggle(): void {
    if (this.isDark) {
      document.documentElement.classList.remove('dark');
      localStorage.setItem(this.themeKey, 'light');
    } else {
      document.documentElement.classList.add('dark');
      localStorage.setItem(this.themeKey, 'dark');
    }
  }
}
