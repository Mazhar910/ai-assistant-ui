import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MatrixRainComponent } from './matrix-rain/matrix-rain.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, MatrixRainComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  title = 'ai-agent-ui';
}
