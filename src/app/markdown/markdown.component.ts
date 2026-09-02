import { Component, ElementRef, Input, OnChanges, SecurityContext, ViewChild } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

@Component({
  selector: 'app-markdown',
  standalone: true,
  templateUrl: './markdown.component.html',
  styleUrls: ['./markdown.component.css']
})
export class MarkdownComponent implements OnChanges {

  @Input() content = '';

  html = '';

  @ViewChild('contentEl') contentEl?: ElementRef<HTMLDivElement>;

  constructor(private sanitizer: DomSanitizer) { }

  ngOnChanges(): void {
    const result = marked.parse(this.content ?? '', { gfm: true, breaks: true, async: false }) as string;
    const clean = DOMPurify.sanitize(result, { ADD_ATTR: ['target'] });
    this.html = this.sanitizer.sanitize(SecurityContext.HTML, clean) ?? '';
    this.decorateCodeBlocks();
  }

  private decorateCodeBlocks(): void {
    setTimeout(() => {
      const root = this.contentEl?.nativeElement;
      if (!root || !root.isConnected) {
        return;
      }
      root.querySelectorAll<HTMLPreElement>('pre').forEach((pre) => this.decorateCodeBlock(pre));
    });
  }

  private decorateCodeBlock(pre: HTMLPreElement): void {
    if (pre.querySelector('.code-panel')) {
      return;
    }
    const code = pre.querySelector('code');
    const langMatch = code?.className.match(/language-([\w-]+)/);
    const lang = langMatch?.[1] ?? 'code';

    // Wrap the header + code in a dark panel, leaving the pre as a light-gray
    // padded area around the code block.
    const panel = document.createElement('div');
    panel.className = 'code-panel';

    const header = document.createElement('div');
    header.className = 'code-header';

    const label = document.createElement('span');
    label.className = 'code-lang';
    label.textContent = lang;
    label.title = 'Language';

    header.append(label);
    panel.append(header);
    if (code) {
      panel.append(code);
    }
    pre.appendChild(panel);
  }
}