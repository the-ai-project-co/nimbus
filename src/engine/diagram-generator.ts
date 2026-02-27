/**
 * ASCII Diagram Generator
 *
 * Generates architecture diagrams using box-drawing characters.
 * No external dependencies — pure string manipulation.
 *
 * Embedded version: identical to services/core-engine-service/src/components/diagram-generator.ts
 */

export interface DiagramComponent {
  id: string;
  label: string;
  type?: string;
}

export interface DiagramConnection {
  from: string;
  to: string;
  label?: string;
}

export interface DiagramOptions {
  title?: string;
  boxWidth?: number;
}

/**
 * Generates real ASCII architecture diagrams from component/connection data.
 */
export class DiagramGenerator {
  private readonly boxWidth: number;

  constructor(options: DiagramOptions = {}) {
    this.boxWidth = options.boxWidth || 24;
  }

  /**
   * Generate an ASCII architecture diagram.
   */
  generate(
    components: DiagramComponent[],
    connections: DiagramConnection[],
    title?: string
  ): string {
    if (components.length === 0) {
      return '(no components)';
    }

    const lines: string[] = [];

    // Title
    if (title) {
      lines.push(title);
      lines.push('='.repeat(title.length));
      lines.push('');
    }

    // Build adjacency for topological ordering
    const adj = new Map<string, string[]>();
    const inDegree = new Map<string, number>();
    for (const c of components) {
      adj.set(c.id, []);
      inDegree.set(c.id, 0);
    }
    for (const conn of connections) {
      adj.get(conn.from)?.push(conn.to);
      inDegree.set(conn.to, (inDegree.get(conn.to) || 0) + 1);
    }

    // Topological sort (Kahn's algorithm) to determine row placement
    const rows: DiagramComponent[][] = [];
    let queue = components.filter(c => (inDegree.get(c.id) || 0) === 0);
    const placed = new Set<string>();

    while (queue.length > 0) {
      rows.push([...queue]);
      const nextQueue: DiagramComponent[] = [];
      for (const node of queue) {
        placed.add(node.id);
        for (const neighbor of adj.get(node.id) || []) {
          inDegree.set(neighbor, (inDegree.get(neighbor) || 0) - 1);
          if (inDegree.get(neighbor) === 0 && !placed.has(neighbor)) {
            const comp = components.find(c => c.id === neighbor);
            if (comp) {
              nextQueue.push(comp);
            }
          }
        }
      }
      queue = nextQueue;
    }

    // Add any unplaced components (cycles) to the last row
    for (const c of components) {
      if (!placed.has(c.id)) {
        if (rows.length === 0) {
          rows.push([]);
        }
        rows[rows.length - 1].push(c);
      }
    }

    // Track center positions for drawing connections
    const colWidth = this.boxWidth + 4;

    // Render rows of boxes
    for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
      const row = rows[rowIdx];
      const rowLines = this.renderBoxRow(row, colWidth);

      for (const line of rowLines) {
        lines.push(line);
      }

      // Draw vertical connection arrows between rows
      if (rowIdx < rows.length - 1) {
        const nextRow = rows[rowIdx + 1];
        const arrowLines = this.renderArrows(row, nextRow, connections, colWidth);
        for (const line of arrowLines) {
          lines.push(line);
        }
      }
    }

    // Legend for connections
    if (connections.length > 0) {
      lines.push('');
      lines.push('Connections:');
      for (const conn of connections) {
        const fromComp = components.find(c => c.id === conn.from);
        const toComp = components.find(c => c.id === conn.to);
        if (fromComp && toComp) {
          const label = conn.label ? ` (${conn.label})` : '';
          lines.push(`  ${fromComp.label} --> ${toComp.label}${label}`);
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * Render a row of component boxes.
   */
  private renderBoxRow(components: DiagramComponent[], colWidth: number): string[] {
    const w = this.boxWidth;
    const top = `+${'-'.repeat(w)}+`;
    const bot = `+${'-'.repeat(w)}+`;

    const topLine: string[] = [];
    const labelLine: string[] = [];
    const typeLine: string[] = [];
    const botLine: string[] = [];

    for (const comp of components) {
      const padding = colWidth - w - 2;
      const pad = ' '.repeat(Math.max(0, padding / 2));

      topLine.push(pad + top + pad);

      const truncLabel =
        comp.label.length > w - 2 ? `${comp.label.substring(0, w - 5)}...` : comp.label;
      const labelPadded = truncLabel.padStart(Math.floor((w + truncLabel.length) / 2)).padEnd(w);
      labelLine.push(`${pad}|${labelPadded}|${pad}`);

      if (comp.type) {
        const truncType =
          comp.type.length > w - 2 ? `${comp.type.substring(0, w - 5)}...` : comp.type;
        const typePadded = truncType.padStart(Math.floor((w + truncType.length) / 2)).padEnd(w);
        typeLine.push(`${pad}|${typePadded}|${pad}`);
      } else {
        typeLine.push(`${pad}|${' '.repeat(w)}|${pad}`);
      }

      botLine.push(pad + bot + pad);
    }

    return [topLine.join(''), labelLine.join(''), typeLine.join(''), botLine.join('')];
  }

  /**
   * Render vertical arrows between two rows of components.
   */
  private renderArrows(
    fromRow: DiagramComponent[],
    toRow: DiagramComponent[],
    connections: DiagramConnection[],
    colWidth: number
  ): string[] {
    const totalCols = Math.max(fromRow.length, toRow.length);
    const lineWidth = totalCols * colWidth;

    // Find which connections go between these rows
    const fromIds = new Set(fromRow.map(c => c.id));
    const toIds = new Set(toRow.map(c => c.id));
    const activeConns = connections.filter(c => fromIds.has(c.from) && toIds.has(c.to));

    if (activeConns.length === 0) {
      return [''];
    }

    // Draw simple vertical arrows at the center of each from-component
    const arrowRow1 = new Array(lineWidth).fill(' ');
    const arrowRow2 = new Array(lineWidth).fill(' ');
    const arrowRow3 = new Array(lineWidth).fill(' ');

    for (const conn of activeConns) {
      const fromIdx = fromRow.findIndex(c => c.id === conn.from);
      if (fromIdx >= 0) {
        const center = Math.floor(fromIdx * colWidth + colWidth / 2);
        if (center < lineWidth) {
          arrowRow1[center] = '|';
          arrowRow2[center] = '|';
          arrowRow3[center] = 'V';
        }
      }
    }

    return [
      arrowRow1.join('').trimEnd(),
      arrowRow2.join('').trimEnd(),
      arrowRow3.join('').trimEnd(),
    ];
  }

  /**
   * Generate a diagram for infrastructure components.
   * Convenience method that maps common infra component names to diagram elements.
   */
  generateInfrastructureDiagram(componentNames: string[], provider: string = 'aws'): string {
    const components: DiagramComponent[] = componentNames.map(name => ({
      id: name,
      label: name.toUpperCase(),
      type: provider.toUpperCase(),
    }));

    // Infer common connections
    const connections: DiagramConnection[] = [];
    const hasVpc = componentNames.includes('vpc');

    for (const name of componentNames) {
      if (hasVpc && name !== 'vpc' && ['eks', 'rds', 'ecs', 'lambda'].includes(name)) {
        connections.push({ from: 'vpc', to: name, label: 'network' });
      }
      if (name === 'eks' && componentNames.includes('rds')) {
        connections.push({ from: 'eks', to: 'rds', label: 'database' });
      }
    }

    return this.generate(
      components,
      connections,
      `${provider.toUpperCase()} Infrastructure Architecture`
    );
  }
}
