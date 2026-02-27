/**
 * CLI UI Components
 *
 * Provides styled output utilities for the interactive wizard
 */

import type {
  SelectOption,
  ProgressConfig,
  SpinnerConfig,
  TableConfig,
  BoxConfig,
  DiffConfig,
} from './types';

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',

  // Foreground colors
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',

  // Bright foreground colors
  brightRed: '\x1b[91m',
  brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m',
  brightBlue: '\x1b[94m',
  brightMagenta: '\x1b[95m',
  brightCyan: '\x1b[96m',
  brightWhite: '\x1b[97m',

  // Background colors
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
};

// Box drawing characters
const boxChars = {
  single: {
    topLeft: '┌',
    topRight: '┐',
    bottomLeft: '└',
    bottomRight: '┘',
    horizontal: '─',
    vertical: '│',
    teeLeft: '├',
    teeRight: '┤',
    teeTop: '┬',
    teeBottom: '┴',
    cross: '┼',
  },
  double: {
    topLeft: '╔',
    topRight: '╗',
    bottomLeft: '╚',
    bottomRight: '╝',
    horizontal: '═',
    vertical: '║',
    teeLeft: '╠',
    teeRight: '╣',
    teeTop: '╦',
    teeBottom: '╩',
    cross: '╬',
  },
  rounded: {
    topLeft: '╭',
    topRight: '╮',
    bottomLeft: '╰',
    bottomRight: '╯',
    horizontal: '─',
    vertical: '│',
    teeLeft: '├',
    teeRight: '┤',
    teeTop: '┬',
    teeBottom: '┴',
    cross: '┼',
  },
  heavy: {
    topLeft: '┏',
    topRight: '┓',
    bottomLeft: '┗',
    bottomRight: '┛',
    horizontal: '━',
    vertical: '┃',
    teeLeft: '┣',
    teeRight: '┫',
    teeTop: '┳',
    teeBottom: '┻',
    cross: '╋',
  },
};

/**
 * CLI UI utilities for the wizard
 */
export class WizardUI {
  private terminalWidth: number;
  private spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private spinnerInterval?: Timer;

  constructor() {
    this.terminalWidth = process.stdout.columns || 80;
  }

  // ==================== Color Helpers ====================

  color(text: string, colorName: keyof typeof colors): string {
    return `${colors[colorName]}${text}${colors.reset}`;
  }

  bold(text: string): string {
    return `${colors.bold}${text}${colors.reset}`;
  }

  dim(text: string): string {
    return `${colors.dim}${text}${colors.reset}`;
  }

  // ==================== Icons ====================

  get icons() {
    return {
      success: this.color('✓', 'green'),
      error: this.color('✗', 'red'),
      warning: this.color('⚠', 'yellow'),
      info: this.color('ℹ', 'blue'),
      question: this.color('?', 'cyan'),
      pointer: this.color('❯', 'cyan'),
      circle: '○',
      circleFilled: '●',
      checkbox: '☐',
      checkboxChecked: '☑',
      radioOn: '◉',
      radioOff: '○',
      arrowRight: '→',
      arrowLeft: '←',
      arrowUp: '↑',
      arrowDown: '↓',
    };
  }

  // ==================== Output Methods ====================

  /**
   * Print a line to stdout
   */
  print(text: string = ''): void {
    process.stdout.write(`${text}\n`);
  }

  /**
   * Print without newline
   */
  write(text: string): void {
    process.stdout.write(text);
  }

  /**
   * Clear the current line
   */
  clearLine(): void {
    process.stdout.write('\r\x1b[K');
  }

  /**
   * Move cursor up n lines
   */
  cursorUp(n: number = 1): void {
    process.stdout.write(`\x1b[${n}A`);
  }

  /**
   * Print a blank line
   */
  newLine(): void {
    this.print();
  }

  // ==================== Message Types ====================

  success(message: string): void {
    this.print(`  ${this.icons.success} ${message}`);
  }

  error(message: string): void {
    this.print(`  ${this.icons.error} ${this.color(message, 'red')}`);
  }

  warning(message: string): void {
    this.print(`  ${this.icons.warning} ${this.color(message, 'yellow')}`);
  }

  info(message: string): void {
    this.print(`  ${this.icons.info} ${message}`);
  }

  // ==================== Box Drawing ====================

  /**
   * Draw a box around content
   */
  box(config: BoxConfig): void {
    const chars = boxChars[config.style || 'rounded'];
    const padding = config.padding ?? 1;
    const width = config.width || this.terminalWidth - 4;
    const innerWidth = width - 2;

    const lines = Array.isArray(config.content) ? config.content : config.content.split('\n');

    // Top border
    let topBorder = chars.topLeft + chars.horizontal.repeat(innerWidth) + chars.topRight;
    if (config.title) {
      const titleText = ` ${config.title} `;
      const titleStart = Math.floor((innerWidth - titleText.length) / 2);
      topBorder =
        chars.topLeft +
        chars.horizontal.repeat(titleStart) +
        (config.titleColor ? this.color(titleText, config.titleColor as any) : titleText) +
        chars.horizontal.repeat(innerWidth - titleStart - titleText.length) +
        chars.topRight;
    }

    this.print(config.borderColor ? this.color(topBorder, config.borderColor as any) : topBorder);

    // Padding top
    for (let i = 0; i < padding; i++) {
      this.print(
        (config.borderColor
          ? this.color(chars.vertical, config.borderColor as any)
          : chars.vertical) +
          ' '.repeat(innerWidth) +
          (config.borderColor
            ? this.color(chars.vertical, config.borderColor as any)
            : chars.vertical)
      );
    }

    // Content
    for (const line of lines) {
      const paddedLine =
        ' '.repeat(padding) +
        line +
        ' '.repeat(Math.max(0, innerWidth - padding * 2 - line.length));
      this.print(
        (config.borderColor
          ? this.color(chars.vertical, config.borderColor as any)
          : chars.vertical) +
          paddedLine.substring(0, innerWidth) +
          (config.borderColor
            ? this.color(chars.vertical, config.borderColor as any)
            : chars.vertical)
      );
    }

    // Padding bottom
    for (let i = 0; i < padding; i++) {
      this.print(
        (config.borderColor
          ? this.color(chars.vertical, config.borderColor as any)
          : chars.vertical) +
          ' '.repeat(innerWidth) +
          (config.borderColor
            ? this.color(chars.vertical, config.borderColor as any)
            : chars.vertical)
      );
    }

    // Bottom border
    const bottomBorder = chars.bottomLeft + chars.horizontal.repeat(innerWidth) + chars.bottomRight;
    this.print(
      config.borderColor ? this.color(bottomBorder, config.borderColor as any) : bottomBorder
    );
  }

  /**
   * Draw a header box for the wizard
   */
  header(title: string, subtitle?: string): void {
    const content = subtitle ? [title, this.dim(subtitle)] : [title];
    this.box({
      content,
      style: 'rounded',
      borderColor: 'cyan',
      padding: 1,
    });
    this.newLine();
  }

  // ==================== Table ====================

  /**
   * Draw a table
   */
  table(config: TableConfig): void {
    const _chars = boxChars.single;
    const colWidths: number[] = [];

    // Calculate column widths
    for (const col of config.columns) {
      let maxWidth = col.header.length;
      for (const row of config.data) {
        const value = String(row[col.key] ?? '');
        maxWidth = Math.max(maxWidth, value.length);
      }
      colWidths.push(col.width || Math.min(maxWidth + 2, 40));
    }

    // Draw header
    const headerRow = config.columns
      .map((col, i) => {
        const text = col.header.padEnd(colWidths[i]);
        return this.bold(text);
      })
      .join(' │ ');

    const separator = colWidths.map(w => '─'.repeat(w)).join('─┼─');

    if (config.title) {
      this.print(this.bold(config.title));
    }

    this.print(`┌─${colWidths.map(w => '─'.repeat(w)).join('─┬─')}─┐`);
    this.print(`│ ${headerRow} │`);
    this.print(`├─${separator}─┤`);

    // Draw rows
    for (let i = 0; i < config.data.length; i++) {
      const row = config.data[i];
      const cells = config.columns.map((col, j) => {
        let value = row[col.key];
        if (col.formatter) {
          value = col.formatter(value);
        }
        const text = String(value ?? '').padEnd(colWidths[j]);
        return text;
      });

      const prefix = config.showRowNumbers ? `${(i + 1).toString().padStart(3)}. ` : '';
      this.print(`│ ${prefix}${cells.join(' │ ')} │`);
    }

    this.print(`└─${colWidths.map(w => '─'.repeat(w)).join('─┴─')}─┘`);
  }

  // ==================== Progress ====================

  /**
   * Draw a progress bar
   */
  progressBar(current: number, total: number, config: ProgressConfig): void {
    const barWidth = 40;
    const percentage = Math.round((current / total) * 100);
    const filled = Math.round((current / total) * barWidth);
    const empty = barWidth - filled;

    const bar = this.color('█'.repeat(filled), 'green') + this.dim('░'.repeat(empty));

    const status = config.showPercentage ? ` ${percentage}%` : ` ${current}/${total}`;

    this.clearLine();
    this.write(`  ${config.message} ${bar}${status}`);
  }

  /**
   * Complete progress bar
   */
  progressComplete(message: string): void {
    this.clearLine();
    this.print(`  ${this.icons.success} ${message}`);
  }

  // ==================== Spinner ====================

  /**
   * Start a spinner
   */
  startSpinner(config: SpinnerConfig): void {
    let frameIndex = 0;

    this.spinnerInterval = setInterval(() => {
      const frame = this.color(this.spinnerFrames[frameIndex], 'cyan');
      this.clearLine();
      this.write(`  ${frame} ${config.message}`);
      frameIndex = (frameIndex + 1) % this.spinnerFrames.length;
    }, 80);
  }

  /**
   * Update spinner message
   */
  updateSpinner(message: string): void {
    // The spinner loop will pick up the new message
    // For now, just update the display
    if (this.spinnerInterval) {
      this.clearLine();
      const frame = this.color(this.spinnerFrames[0], 'cyan');
      this.write(`  ${frame} ${message}`);
    }
  }

  /**
   * Stop spinner with success
   */
  stopSpinnerSuccess(message: string): void {
    if (this.spinnerInterval) {
      clearInterval(this.spinnerInterval);
      this.spinnerInterval = undefined;
    }
    this.clearLine();
    this.print(`  ${this.icons.success} ${message}`);
  }

  /**
   * Stop spinner with failure
   */
  stopSpinnerFail(message: string): void {
    if (this.spinnerInterval) {
      clearInterval(this.spinnerInterval);
      this.spinnerInterval = undefined;
    }
    this.clearLine();
    this.print(`  ${this.icons.error} ${this.color(message, 'red')}`);
  }

  // ==================== Diff Display ====================

  /**
   * Display a side-by-side diff
   */
  sideBySideDiff(config: DiffConfig): void {
    const halfWidth = Math.floor((this.terminalWidth - 3) / 2);
    const chars = boxChars.single;

    const originalLines = config.original.split('\n');
    const modifiedLines = config.modified.split('\n');
    const maxLines = Math.max(originalLines.length, modifiedLines.length);

    if (config.title) {
      this.print(this.bold(config.title));
    }

    // Header
    this.print(
      chars.topLeft +
        chars.horizontal.repeat(halfWidth) +
        chars.teeTop +
        chars.horizontal.repeat(halfWidth) +
        chars.topRight
    );

    const leftHeader = ' CURRENT CODE'.padEnd(halfWidth);
    const rightHeader = ' SUGGESTED IMPROVEMENTS'.padEnd(halfWidth);
    this.print(
      chars.vertical +
        this.color(leftHeader, 'yellow') +
        chars.vertical +
        this.color(rightHeader, 'green') +
        chars.vertical
    );

    this.print(
      chars.teeLeft +
        chars.horizontal.repeat(halfWidth) +
        chars.cross +
        chars.horizontal.repeat(halfWidth) +
        chars.teeRight
    );

    // Content
    for (let i = 0; i < maxLines; i++) {
      const leftLine = (originalLines[i] || '').substring(0, halfWidth - 2).padEnd(halfWidth);
      const rightLine = (modifiedLines[i] || '').substring(0, halfWidth - 2).padEnd(halfWidth);
      const isDifferent = originalLines[i] !== modifiedLines[i];

      this.print(
        chars.vertical +
          (isDifferent ? this.color(leftLine, 'red') : leftLine) +
          chars.vertical +
          (isDifferent ? this.color(rightLine, 'green') : rightLine) +
          chars.vertical
      );
    }

    // Footer
    this.print(
      chars.bottomLeft +
        chars.horizontal.repeat(halfWidth) +
        chars.teeBottom +
        chars.horizontal.repeat(halfWidth) +
        chars.bottomRight
    );
  }

  // ==================== Selection Display ====================

  /**
   * Display options (for reference, actual selection uses readline)
   */
  displayOptions(options: SelectOption[], selectedIndex: number): void {
    for (let i = 0; i < options.length; i++) {
      const opt = options[i];
      const isSelected = i === selectedIndex;
      const prefix = isSelected ? this.icons.pointer : ' ';
      const icon = isSelected ? this.icons.radioOn : this.icons.radioOff;

      let line = `  ${prefix} ${icon} ${opt.label}`;

      if (opt.disabled) {
        line = this.dim(`${line} (${opt.disabledReason || 'unavailable'})`);
      } else if (isSelected) {
        line = this.color(line, 'cyan');
      }

      this.print(line);

      if (opt.description && isSelected) {
        this.print(this.dim(`      ${opt.description}`));
      }
    }
  }

  // ==================== Dividers ====================

  /**
   * Print a horizontal divider
   */
  divider(char: string = '─'): void {
    this.print(this.dim(char.repeat(this.terminalWidth)));
  }

  /**
   * Print a section header
   */
  section(title: string): void {
    this.newLine();
    this.print(this.bold(this.color(title, 'cyan')));
    this.divider();
  }
}

// Export singleton instance
export const ui = new WizardUI();
