import {
  Component,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
  HostListener,
} from '@angular/core';

@Component({
  selector: 'app-matrix-rain',
  standalone: true,
  template: `<canvas #matrixCanvas class="matrix-canvas" aria-hidden="true"></canvas>`,
  styles: [
    `
      :host {
        position: fixed;
        inset: 0;
        z-index: 0;
        pointer-events: none;
        display: block;
      }
      .matrix-canvas {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        display: block;
      }
    `,
  ],
})
export class MatrixRainComponent implements AfterViewInit, OnDestroy {
  @ViewChild('matrixCanvas', { static: true }) canvas!: ElementRef<HTMLCanvasElement>;

  private ctx!: CanvasRenderingContext2D;
  private drops: number[] = [];
  private fontSize = 16;
  private columns = 0;
  private rafId = 0;
  private chars = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホ0123456789ABCDEF';

  private run = true;

  ngAfterViewInit(): void {
    const el = this.canvas.nativeElement;
    this.ctx = el.getContext('2d')!;
    this.resize();
    this.start();
  }

  @HostListener('window:resize')
  onResize(): void {
    this.resize();
    this.resetDrops();
  }

  ngOnDestroy(): void {
    this.run = false;
    cancelAnimationFrame(this.rafId);
  }

  private resize(): void {
    const el = this.canvas.nativeElement;
    const isDark = document.documentElement.classList.contains('dark');
    const base = isDark ? 16 : 18;
    this.fontSize = base;
    const dpr = window.devicePixelRatio || 1;
    el.width = Math.floor(el.clientWidth * dpr);
    el.height = Math.floor(el.clientHeight * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.resetDrops();
  }

  private resetDrops(): void {
    const el = this.canvas.nativeElement;
    this.columns = Math.floor(el.clientWidth / this.fontSize);
    this.drops = new Array(this.columns)
      .fill(0)
      .map(() => Math.floor(Math.random() * -50));
  }

  private start(): void {
    const tick = () => {
      if (!this.run) return;
      this.draw();
      this.rafId = requestAnimationFrame(tick);
    };
    tick();
  }

  private draw(): void {
    const el = this.canvas.nativeElement;
    const isDark = document.documentElement.classList.contains('dark');
    const w = el.clientWidth;
    const h = el.clientHeight;

    // Translucent fade for trailing effect
    this.ctx.fillStyle = isDark ? 'rgba(6, 24, 8, 0.18)' : 'rgba(5, 22, 8, 0.10)';
    this.ctx.fillRect(0, 0, w, h);

    this.ctx.font = `${this.fontSize}px "Courier New", monospace`;
    const headColor = isDark ? '#5eff8a' : '#0aad4a';
    const bodyColor = isDark ? '#1f9e46' : '#0b7a3a';

    for (let i = 0; i < this.columns; i++) {
      const char = this.chars.charAt(Math.floor(Math.random() * this.chars.length));
      const x = i * this.fontSize;
      const y = this.drops[i] * this.fontSize;

      // Leading character bright; rest dim
      this.ctx.fillStyle = headColor;
      this.ctx.fillText(char, x, y);
      this.ctx.fillStyle = bodyColor;
      this.ctx.fillText(char, x, y + this.fontSize);

      if (y > h && Math.random() > 0.975) {
        this.drops[i] = 0;
      } else {
        this.drops[i]++;
      }
    }
  }
}
