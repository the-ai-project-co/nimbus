/**
 * Tree Component
 *
 * Renders a file/directory tree using box-drawing characters.
 * Directories are shown in bold cyan, files in dim text.
 * An optional maxDepth limits how deep the tree is rendered.
 */

import React from 'react';
import { Box, Text } from 'ink';

/** A single node in the tree. */
interface TreeItem {
  name: string;
  type: 'file' | 'directory';
  children?: TreeItem[];
}

interface TreeProps {
  items: TreeItem[];
  title?: string;
  maxDepth?: number;
}

interface TreeNodeProps {
  item: TreeItem;
  prefix: string;
  isLast: boolean;
  depth: number;
  maxDepth?: number;
}

function TreeNode({ item, prefix, isLast, depth, maxDepth }: TreeNodeProps) {
  const connector = isLast ? '\u2514\u2500\u2500 ' : '\u251C\u2500\u2500 ';
  const childPrefix = prefix + (isLast ? '    ' : '\u2502   ');
  const children = item.children ?? [];
  const isDir = item.type === 'directory';
  const depthExceeded = maxDepth !== undefined && depth >= maxDepth;

  return (
    <Box flexDirection="column">
      <Box>
        <Text dimColor>{prefix}{connector}</Text>
        {isDir ? (
          <Text bold color="cyan">{item.name}/</Text>
        ) : (
          <Text dimColor>{item.name}</Text>
        )}
      </Box>
      {isDir && !depthExceeded &&
        children.map((child, i) => (
          <TreeNode
            key={child.name + i}
            item={child}
            prefix={childPrefix}
            isLast={i === children.length - 1}
            depth={depth + 1}
            maxDepth={maxDepth}
          />
        ))}
      {isDir && depthExceeded && children.length > 0 && (
        <Box>
          <Text dimColor>{childPrefix}\u2514\u2500\u2500 ...</Text>
        </Box>
      )}
    </Box>
  );
}

export function Tree({ items, title, maxDepth }: TreeProps) {
  return (
    <Box flexDirection="column" padding={1}>
      {title && (
        <Box marginBottom={1}>
          <Text bold color="cyan">
            {title}
          </Text>
        </Box>
      )}

      {items.length === 0 && (
        <Box>
          <Text dimColor>Empty tree.</Text>
        </Box>
      )}

      {items.map((item, i) => (
        <TreeNode
          key={item.name + i}
          item={item}
          prefix=""
          isLast={i === items.length - 1}
          depth={0}
          maxDepth={maxDepth}
        />
      ))}
    </Box>
  );
}
