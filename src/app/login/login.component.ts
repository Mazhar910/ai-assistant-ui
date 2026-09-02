import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { ThemeService } from '../services/theme.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent {

  mode: 'login' | 'register' = 'login';
  username = '';
  email = '';
  password = '';
  confirmPassword = '';
  loading = false;
  error = '';
  success = '';

  constructor(
    private authService: AuthService,
    private router: Router,
    public themeService: ThemeService
  ) {}

  toggleMode(): void {
    this.mode = this.mode === 'login' ? 'register' : 'login';
    this.error = '';
    this.success = '';
    this.username = '';
    this.email = '';
    this.password = '';
    this.confirmPassword = '';
  }

  submit(): void {
    this.error = '';
    this.success = '';

    if (this.mode === 'register') {
      if (!this.username.trim() || !this.email.trim() || !this.password) {
        this.error = 'All fields are required';
        return;
      }
      if (this.password !== this.confirmPassword) {
        this.error = 'Passwords do not match';
        return;
      }
      if (this.password.length < 6) {
        this.error = 'Password must be at least 6 characters';
        return;
      }

      this.loading = true;
      this.authService.register(this.username.trim(), this.email.trim(), this.password).subscribe({
        next: (res) => {
          this.loading = false;
          if (res.token) {
            this.router.navigate(['/chat']);
          } else {
            this.error = res.message || 'Registration failed';
          }
        },
        error: (err) => {
          this.loading = false;
          this.error = err?.error?.message || 'Registration failed. Please try again.';
        }
      });
    } else {
      if (!this.username.trim() || !this.password) {
        this.error = 'Username and password are required';
        return;
      }

      this.loading = true;
      this.authService.login(this.username.trim(), this.password).subscribe({
        next: (res) => {
          this.loading = false;
          if (res.token) {
            this.router.navigate(['/chat']);
          } else {
            this.error = res.message || 'Login failed';
          }
        },
        error: (err) => {
          this.loading = false;
          if (err?.status === 401 || err?.status === 403) {
            this.error = err?.error?.message || 'Invalid credentials';
          } else {
            this.error = err?.error?.message || 'Login failed. Please try again.';
          }
        }
      });
    }
  }
}
