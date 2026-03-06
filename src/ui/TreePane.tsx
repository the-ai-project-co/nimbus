/**
 * TreePane Component (L1)
 *
 * Collapsible file tree sidebar using box-drawing characters.
 * Shows 2 levels deep by default; toggle via /tree slash command.
 */

import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface TreePaneProps {
  /** Root directory to display. Defaults to process.cwd(). */
  cwd?: string;
  /** Recently modified file paths (for highlighting). */
  recentFiles?: string[];
  /** Callback when user presses Enter on a file (to inject @filepath). */
  onSelectFile?: (filePath: string) => void;
}

interface TreeNode {
  name: string;
  fullPath: string;
  isDir: boolean;
  children?: TreeNode[];
}

function buildTree(dir: string, depth: number, maxDepth: number): TreeNode[] {
  if (depth > maxDepth) return [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    return entries
      .filter(e => !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== 'dist')
      .slice(0, 30) // limit entries per level
      .map(e => {
        const fullPath = path.join(dir, e.name);
        const node: TreeNode = { name: e.name, fullPath, isDir: e.isDirectory() };
        if (e.isDirectory() && depth < maxDepth) {
          node.children = buildTree(fullPath, depth + 1, maxDepth);
        }
        return node;
      });
  } catch {
    return [];
  }
}

function renderTree(
  nodes: TreeNode[],
  prefix: string,
  selectedIdx: number,
  flatList: TreeNode[],
  recentPaths: Set<string>
): React.ReactNode[] {
  const elements: React.ReactNode[] = [];
  nodes.forEach((node, i) => {
    const isLast = i === nodes.length - 1;
    const connector = isLast ? '└─' : '├─';
    const childPrefix = prefix + (isLast ? '   ' : '│  ');
    const globalIdx = flatList.indexOf(node);
    const isSelected = globalIdx === selectedIdx;
    const isRecent = recentPaths.has(node.fullPath);

    elements.push(
      <Text key={node.fullPath} color={isSelected ? 'cyan' : isRecent ? 'yellow' : undefined} bold={isSelected}>
        {prefix}{connector} {node.isDir ? '[/] ' : ''}{node.name}
      </Text>
    );

    if (node.children && node.children.length > 0) {
      elements.push(...renderTree(node.children, childPrefix, selectedIdx, flatList, recentPaths));
    }
  });
  return elements;
}

function flattenTree(nodes: TreeNode[]): TreeNode[] {
  const result: TreeNode[] = [];
  for (const node of nodes) {
    result.push(node);
    if (node.children) {
      result.push(...flattenTree(node.children));
    }
  }
  return result;
}

export function TreePane({ cwd = process.cwd(), recentFiles = [], onSelectFile }: TreePaneProps) {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const recentPaths = new Set(recentFiles);

  useEffect(() => {
    const nodes = buildTree(cwd, 0, 2);
    setTree(nodes);
  }, [cwd]);

  const flat = flattenTree(tree);

  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedIdx(prev => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      setSelectedIdx(prev => Math.min(flat.length - 1, prev + 1));
    } else if (key.return && flat[selectedIdx]) {
      const node = flat[selectedIdx];
      if (!node.isDir && onSelectFile) {
        onSelectFile(node.fullPath);
      }
    }
  });

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor="gray"
      paddingX={1}
      flexShrink={0}
      overflow="hidden"
    >
      <Box marginBottom={1}>
        <Text bold color="cyan">Files</Text>
        <Text dimColor> (↑↓ navigate · Enter to @ref · /tree to toggle)</Text>
      </Box>

      <Text bold dimColor>{path.basename(cwd)}/</Text>
      {renderTree(tree, '', selectedIdx, flat, recentPaths)}
    </Box>
  );
}
