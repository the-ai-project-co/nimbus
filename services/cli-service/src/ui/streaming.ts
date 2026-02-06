/**
 * Streaming Text Display
 *
 * Utilities for displaying streaming LLM responses in the terminal
 */

import { ui } from '../wizard/ui';

export interface StreamingDisplayOptions {
  /** Prefix to show before the response (e.g., "Nimbus: ") */
  prefix?: string;
  /** Color for the prefix */
  prefixColor?: string;
  /** Whether to show a cursor while streaming */
  showCursor?: boolean;
  /** Character to use as cursor */
  cursorChar?: string;
}

/**
 * StreamingDisplay handles real-time text output from LLM responses
 */
export class StreamingDisplay {
  private options: Required<StreamingDisplayOptions>;
  private buffer: string = '';
  private lineStarted: boolean = false;
  private cursorInterval?: Timer;

  constructor(options: StreamingDisplayOptions = {}) {
    this.options = {
      prefix: options.prefix || '',
      prefixColor: options.prefixColor || 'blue',
      showCursor: options.showCursor ?? true,
      cursorChar: options.cursorChar || '|',
    };
  }

  /**
   * Start a new streaming response
   */
  start(): void {
    this.buffer = '';
    this.lineStarted = false;

    // Print the prefix
    if (this.options.prefix) {
      ui.write(ui.color(this.options.prefix, this.options.prefixColor as any));
    }

    this.lineStarted = true;

    // Start cursor blink if enabled
    if (this.options.showCursor) {
      this.startCursor();
    }
  }

  /**
   * Append text to the streaming display
   */
  append(text: string): void {
    // Stop cursor while writing
    this.stopCursor();

    // Handle newlines in the text
    const lines = text.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (i > 0) {
        // This is after a newline
        ui.print(''); // End current line
        this.lineStarted = false;
      }

      if (line) {
        if (!this.lineStarted) {
          // Add indentation for continuation lines
          ui.write('  '); // Indent to align with prefix
          this.lineStarted = true;
        }
        ui.write(line);
      }

      this.buffer += (i > 0 ? '\n' : '') + line;
    }

    // Restart cursor
    if (this.options.showCursor) {
      this.startCursor();
    }
  }

  /**
   * Complete the streaming display
   */
  complete(): string {
    this.stopCursor();

    // Ensure we end on a new line
    if (this.lineStarted) {
      ui.print('');
    }

    return this.buffer;
  }

  /**
   * Handle an error during streaming
   */
  error(message: string): void {
    this.stopCursor();

    if (this.lineStarted) {
      ui.print('');
    }

    ui.error(message);
  }

  private startCursor(): void {
    if (this.cursorInterval) return;

    let visible = true;
    this.cursorInterval = setInterval(() => {
      if (visible) {
        ui.write(ui.dim(this.options.cursorChar));
      } else {
        // Backspace to remove cursor
        ui.write('\b \b');
      }
      visible = !visible;
    }, 500);
  }

  private stopCursor(): void {
    if (this.cursorInterval) {
      clearInterval(this.cursorInterval);
      this.cursorInterval = undefined;
      // Clear any remaining cursor character
      ui.write('\b \b');
    }
  }
}

/**
 * Simple streaming helper for one-off usage
 */
export async function displayStreaming(
  generator: AsyncGenerator<{ content?: string; type: string }>,
  options: StreamingDisplayOptions = {}
): Promise<string> {
  const display = new StreamingDisplay(options);
  display.start();

  try {
    for await (const chunk of generator) {
      if (chunk.type === 'content' && chunk.content) {
        display.append(chunk.content);
      } else if (chunk.type === 'error') {
        display.error((chunk as any).message || 'Unknown error');
        return '';
      }
    }

    return display.complete();
  } catch (error: any) {
    display.error(error.message || 'Streaming failed');
    return '';
  }
}
