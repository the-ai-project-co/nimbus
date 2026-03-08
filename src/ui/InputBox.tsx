/**
 * InputBox Component
 *
 * A text input area with a "> " prompt character. Uses ink-text-input for
 * editing and submits on Enter. The parent component receives the submitted
 * text via the `onSubmit` callback.
 *
 * Features:
 *   - Input history (Up/Down arrows)
 *   - Multi-line paste detection with line count indicator
 *   - Slash command autocomplete (Tab to cycle)
 *   - @file mention with Tab completion (type @ then Tab to cycle files)
 *   - Reverse search (Ctrl+R) through history
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, unlinkSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

/** Maximum number of history entries to keep. */
const MAX_HISTORY = 100;

/** Path to the persistent input history file. */
const HISTORY_FILE = join(homedir(), '.nimbus', 'input-history.json');

/** Load persisted input history from disk (returns [] on any error). */
function loadHistory(): string[] {
  try {
    if (!existsSync(HISTORY_FILE)) return [];
    const raw = readFileSync(HISTORY_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.slice(-MAX_HISTORY) as string[];
  } catch { /* ignore */ }
  return [];
}

/** Save input history to disk (fire-and-forget, ignores errors). */
function saveHistory(entries: string[]): void {
  try {
    const dir = join(homedir(), '.nimbus');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(HISTORY_FILE, JSON.stringify(entries.slice(-MAX_HISTORY)), 'utf-8');
  } catch { /* non-critical */ }
}

/** All recognized slash commands for autocomplete. */
const SLASH_COMMANDS = [
  '/alias',
  '/apply',
  '/branch',
  '/auth-refresh',
  '/clear',
  '/compact',
  '/context',
  '/cost',
  '/diff',
  '/drift',
  '/explain',
  '/export',
  '/help',
  '/init',
  '/k8s-ctx',
  '/model',
  '/models',
  '/mode',
  '/new',
  '/plan',
  '/profile',
  '/redo',
  '/rollback',
  '/search',
  '/sessions',
  '/switch',
  '/terminal',
  '/tf-ws',
  '/theme',
  '/tools',
  '/tree',
  '/undo',
  '/watch',
  '/workspace',
  '/deploy',
  '/rollback',
  '/incident',
  '/runbook',
  '/plugin',
  '/share',
  '/status',
  '/remember',
  '/logs',
];

/** L1: Known subagent names for @agent completions. */
const AGENT_NAMES = ['explore', 'infra', 'security', 'cost', 'general'];

/** Props accepted by the InputBox component. */
export interface InputBoxProps {
  /** Called when the user presses Enter with non-empty input. */
  onSubmit: (text: string) => void;
  /** Called when the user presses Escape to abort the current operation. */
  onAbort?: () => void;
  /** Placeholder text shown when the input is empty. */
  placeholder?: string;
  /** Whether the input is disabled (e.g. while the agent is processing). */
  disabled?: boolean;
  /** Current agent mode — controls prompt character and color (Gap 11). */
  mode?: 'plan' | 'build' | 'deploy';
  /** Called when the input line count changes (for StatusBar multi-line indicator). */
  onLineCountChange?: (count: number) => void;
  /** GAP-21: Pre-fill the input with this text (e.g. @filepath from TreePane). */
  prefill?: string;
  /** H3: Fetch dynamic completions for slash command arguments (e.g. /k8s-ctx, /tf-ws). */
  onFetchCompletions?: (prefix: string) => Promise<string[]>;
}

/**
 * InputBox renders a ">" prompt followed by an editable text field.
 * Pressing Enter submits the value and clears the field. Pressing Escape
 * fires the optional onAbort callback. Up/Down arrows navigate history.
 * Tab autocompletes slash commands. Ctrl+R opens reverse search.
 */
export function InputBox({ onSubmit, onAbort, placeholder, disabled = false, mode = 'build', onLineCountChange, prefill, onFetchCompletions }: InputBoxProps) {
  const [value, setValue] = useState(prefill ?? '') as [string, React.Dispatch<React.SetStateAction<string>>];
  // GAP-21: When prefill changes externally, update the input value
  const prevPrefill = useRef(prefill);
  if (prefill !== prevPrefill.current) {
    prevPrefill.current = prefill;
    if (prefill !== undefined) {
      setValue(prefill);
    }
  }

  // History: most recent entry is at the end (C1: loaded from disk)
  const history = useRef<string[]>(loadHistory());
  // -1 means "not browsing history" (showing current draft)
  const historyIndex = useRef(-1);
  // Stores the in-progress text before the user started browsing history
  const draft = useRef('');

  // C1: Persist history to disk on unmount
  useEffect(() => {
    return () => {
      saveHistory(history.current);
    };
  }, []);

  // Slash command autocomplete state
  const [slashHint, setSlashHint] = useState('');
  const suggestionIndex = useRef(0);
  const lastSuggestions = useRef<string[]>([]);

  // @file completion state
  const [fileSuggestions, setFileSuggestions] = useState<string[]>([]);
  const [fileHint, setFileHint] = useState('');
  const fileSuggestionIndex = useRef(0);

  // H3: Dynamic completions for slash command arguments
  const [dynamicSuggestions, setDynamicSuggestions] = useState<string[]>([]);
  const [dynamicHint, setDynamicHint] = useState('');
  const dynamicSuggestionIndex = useRef(0);
  // Cache: prefix → {items, ts}
  const dynamicCache = useRef<Map<string, { items: string[]; ts: number }>>(new Map());

  // Ctrl+R search mode
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<string[]>([]);

  const handleSubmit = useCallback(
    (submitted: string) => {
      const trimmed = submitted.trim();
      if (trimmed.length === 0) {
        return;
      }
      onSubmit(trimmed);

      // Add to history (avoid consecutive duplicates)
      const h = history.current;
      if (h.length === 0 || h[h.length - 1] !== trimmed) {
        h.push(trimmed);
        if (h.length > MAX_HISTORY) {
          h.shift();
        }
        // C1: Persist to disk on every new entry
        saveHistory(h);
      }

      // Reset history navigation
      historyIndex.current = -1;
      draft.current = '';
      setValue('');
      setSlashHint('');
    },
    [onSubmit]
  );

  // Handle Escape, Up/Down arrows, Tab autocomplete, Ctrl+R
  useInput(
    (input, key) => {
      // --- Ctrl+E: open $EDITOR for multi-line input composition (Gap 3) ---
      if (input === 'e' && key.ctrl) {
        const editor = process.env.EDITOR ?? process.env.VISUAL ?? 'nano';
        const tmpFile = `/tmp/nimbus-input-${Date.now()}.md`;
        try {
          writeFileSync(tmpFile, value, 'utf-8');
          spawnSync(editor, [tmpFile], { stdio: 'inherit' });
          const edited = readFileSync(tmpFile, 'utf-8');
          try { unlinkSync(tmpFile); } catch { /* ignore */ }
          setValue(edited);
        } catch {
          /* editor not available — ignore */
        }
        return;
      }

      // --- Ctrl+R: toggle search mode ---
      if (input === 'r' && key.ctrl) {
        if (!searchMode) {
          setSearchMode(true);
          setSearchQuery('');
          setSearchResults([]);
        } else {
          setSearchMode(false);
        }
        return;
      }

      // --- Search mode key handling ---
      if (searchMode) {
        if (key.escape) {
          setSearchMode(false);
          return;
        }
        if (key.return) {
          // Select top result
          if (searchResults.length > 0) {
            setValue(searchResults[0]);
          }
          setSearchMode(false);
          return;
        }
        // Let the search TextInput handle other keys
        return;
      }

      if (key.escape && onAbort) {
        onAbort();
        return;
      }

      // --- Tab: autocomplete ---
      if (key.tab) {
        // @file completion
        const atMatch = value.match(/@(\S*)$/);
        if (atMatch && fileSuggestions.length > 0) {
          const idx = fileSuggestionIndex.current % fileSuggestions.length;
          const replacement = `${value.slice(0, value.length - atMatch[0].length)}@${fileSuggestions[idx]}`;
          setValue(replacement);
          fileSuggestionIndex.current = idx + 1;
          setFileHint(`[${fileSuggestions.length} files, Tab to cycle]`);
          return;
        }

        // Slash command completion
        if (value.startsWith('/')) {
          // H3: Dynamic argument completions for /k8s-ctx, /tf-ws, /model, /profile
          const dynamicPrefixes = ['/k8s-ctx ', '/tf-ws ', '/model ', '/profile '];
          const dynMatch = dynamicPrefixes.find(p => value.startsWith(p));
          if (dynMatch && onFetchCompletions) {
            const partial = value.slice(dynMatch.length);
            // Cycle through already-fetched suggestions
            if (dynamicSuggestions.length > 0) {
              const filtered = partial ? dynamicSuggestions.filter(s => s.startsWith(partial)) : dynamicSuggestions;
              if (filtered.length > 0) {
                const idx = dynamicSuggestionIndex.current % filtered.length;
                setValue(`${dynMatch}${filtered[idx]}`);
                dynamicSuggestionIndex.current = idx + 1;
                setDynamicHint(`[${filtered.length} options, Tab to cycle]`);
                return;
              }
            }
            // Fetch completions (non-blocking, cache 30s)
            const cacheKey = dynMatch;
            const cached = dynamicCache.current.get(cacheKey);
            const CACHE_TTL = 30_000;
            if (!cached || Date.now() - cached.ts > CACHE_TTL) {
              onFetchCompletions(value).then(items => {
                dynamicCache.current.set(cacheKey, { items, ts: Date.now() });
                setDynamicSuggestions(items);
                dynamicSuggestionIndex.current = 0;
                if (items.length > 0) {
                  setValue(`${dynMatch}${items[0]}`);
                  setDynamicHint(`[${items.length} options, Tab to cycle]`);
                }
              }).catch(() => { /* ignore */ });
            } else {
              setDynamicSuggestions(cached.items);
              dynamicSuggestionIndex.current = 0;
            }
            return;
          }

          const prefix = value.toLowerCase();
          const matches = SLASH_COMMANDS.filter(cmd => cmd.startsWith(prefix));
          if (matches.length === 0) {
            setSlashHint('');
            return;
          }
          if (matches.length === 1) {
            setValue(`${matches[0]} `);
            setSlashHint('');
            lastSuggestions.current = [];
            return;
          }
          // Multiple matches: cycle through them
          if (
            lastSuggestions.current.length === matches.length &&
            lastSuggestions.current.every((s, i) => s === matches[i])
          ) {
            suggestionIndex.current = (suggestionIndex.current + 1) % matches.length;
          } else {
            lastSuggestions.current = matches;
            suggestionIndex.current = 0;
          }
          setValue(matches[suggestionIndex.current]);
          setSlashHint(`[${matches.length} matches, Tab to cycle]`);
        }
        return;
      }

      const h = history.current;
      if (h.length === 0) {
        return;
      }

      if (key.upArrow) {
        if (historyIndex.current === -1) {
          // Starting to browse: save current draft
          draft.current = value;
          historyIndex.current = h.length - 1;
        } else if (historyIndex.current > 0) {
          historyIndex.current--;
        }
        setValue(h[historyIndex.current]);
        return;
      }

      if (key.downArrow) {
        if (historyIndex.current === -1) {
          return;
        } // not browsing

        if (historyIndex.current < h.length - 1) {
          historyIndex.current++;
          setValue(h[historyIndex.current]);
        } else {
          // Past the end of history: restore draft
          historyIndex.current = -1;
          setValue(draft.current);
        }
        return;
      }
    },
    { isActive: !disabled }
  );

  // Count lines for multi-line paste indicator
  const lineCount = value.split('\n').length;
  const isMultiLine = lineCount > 1;

  if (disabled) {
    return (
      <Box paddingX={1}>
        <Text dimColor>{'> '}</Text>
        <Text dimColor italic>
          {placeholder ?? 'waiting...'}
        </Text>
      </Box>
    );
  }

  // --- Search mode UI ---
  if (searchMode) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Box>
          <Text color="yellow">{'(reverse-search): '}</Text>
          <TextInput
            value={searchQuery}
            onChange={q => {
              setSearchQuery(q);
              if (q.length > 0) {
                const results = history.current
                  .filter(entry => entry.toLowerCase().includes(q.toLowerCase()))
                  .reverse()
                  .slice(0, 10);
                setSearchResults(results);
              } else {
                setSearchResults([]);
              }
            }}
            onSubmit={() => {
              if (searchResults.length > 0) {
                setValue(searchResults[0]);
              }
              setSearchMode(false);
            }}
            placeholder="type to search history..."
          />
        </Box>
        {searchResults.length > 0 && (
          <Box flexDirection="column" marginLeft={2}>
            {searchResults.slice(0, 5).map((result, i) => (
              <Text key={i} dimColor={i > 0}>
                {i === 0 ? '> ' : '  '}
                {result.length > 80 ? `${result.slice(0, 77)}...` : result}
              </Text>
            ))}
            {searchResults.length > 5 && (
              <Text dimColor italic>
                {' '}
                ... {searchResults.length - 5} more
              </Text>
            )}
          </Box>
        )}
      </Box>
    );
  }

  // Gap 11: mode-specific prompt character and color
  const promptLabel = mode === 'plan' ? '[plan]> ' : mode === 'deploy' ? '[DEPLOY]> ' : '[build]> ';
  const promptColor = mode === 'plan' ? 'blue' : mode === 'deploy' ? 'red' : 'green';

  // --- Normal input UI ---
  return (
    <Box paddingX={1}>
      <Text bold color={promptColor}>
        {promptLabel}
      </Text>
      <TextInput
        value={value}
        onChange={v => {
          // L2: Guard against large paste (>10KB) which would freeze the Ink UI
          const safeV = v.length > 10_000 ? v.slice(0, 10_000) : v;
          setValue(safeV);
          onLineCountChange?.(safeV.split('\n').length);
          // If user types while browsing history, exit history mode
          if (historyIndex.current !== -1) {
            historyIndex.current = -1;
          }
          // Reset slash autocomplete on any change
          if (!v.startsWith('/')) {
            setSlashHint('');
            lastSuggestions.current = [];
          }
          // @file / @agent mention detection
          const atMatch = v.match(/@(\S*)$/);
          if (atMatch) {
            const partial = atMatch[1];
            // L1: Try agent names first
            const agentMatches = AGENT_NAMES.filter(a => a.startsWith(partial.toLowerCase()));
            if (agentMatches.length > 0 && partial.length > 0) {
              setFileSuggestions(agentMatches.map(a => `@${a} `));
              fileSuggestionIndex.current = 0;
              setFileHint(`[${agentMatches.length} agent${agentMatches.length > 1 ? 's' : ''}, Tab to complete]`);
            } else {
            try {
              // eslint-disable-next-line @typescript-eslint/no-var-requires
              const fs = require('node:fs');
              const cwd = process.cwd();
              const entries = fs.readdirSync(cwd, { withFileTypes: true });
              const matches = (entries as Array<{ name: string; isDirectory(): boolean }>)
                .filter(
                  e =>
                    !e.name.startsWith('.') && e.name.toLowerCase().includes(partial.toLowerCase())
                )
                .map(e => (e.isDirectory() ? `${e.name}/` : e.name))
                .slice(0, 10);
              setFileSuggestions(matches);
              fileSuggestionIndex.current = 0;
              if (matches.length > 0) {
                setFileHint(`[${matches.length} files, Tab to complete]`);
              } else {
                setFileHint('');
              }
            } catch {
              setFileSuggestions([]);
              setFileHint('');
            }
            }
          } else {
            if (fileSuggestions.length > 0) {
              setFileSuggestions([]);
              setFileHint('');
            }
          }
        }}
        onSubmit={handleSubmit}
        placeholder={placeholder ?? 'Ask me anything DevOps... (? for help, /help for commands)'}
      />
      {isMultiLine && <Text color="cyan">{` [${lineCount} lines]`}</Text>}
      {slashHint && <Text dimColor>{` ${slashHint}`}</Text>}
      {fileHint && <Text dimColor>{` ${fileHint}`}</Text>}
      {dynamicHint && <Text dimColor>{` ${dynamicHint}`}</Text>}
    </Box>
  );
}
