/**
 * HelpModal Component
 *
 * Dismissable overlay that shows all available slash commands and keyboard
 * shortcuts without polluting the conversation history.
 *
 * Commands are grouped by category for discoverability.
 */

import React from 'react';
import { Box, Text, useInput } from 'ink';

interface HelpModalProps {
  onClose: () => void;
}

function Section({ title }: { title: string }) {
  return (
    <Box marginTop={1}>
      <Text bold color="yellow">{title}</Text>
    </Box>
  );
}

function Cmd({ name, desc }: { name: string; desc: string }) {
  const padded = name.padEnd(22);
  return (
    <Text>  <Text color="cyan">{padded}</Text><Text dimColor>{desc}</Text></Text>
  );
}

export function HelpModal({ onClose }: HelpModalProps) {
  useInput((input, key) => {
    if (key.escape || input === 'q' || input === '?') onClose();
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" padding={1} marginY={1}>
      <Text bold color="cyan"> Nimbus DevOps Agent — Help </Text>

      {/* ── DevOps ── */}
      <Section title="DevOps Commands" />
      <Cmd name="/plan"           desc="Generate infrastructure plan (terraform plan)" />
      <Cmd name="/apply"          desc="Apply pending infrastructure changes" />
      <Cmd name="/drift"          desc="Detect infrastructure drift vs live state" />
      <Cmd name="/deploy"         desc="Full plan → apply → rollout workflow" />
      <Cmd name="/rollback"       desc="Safely roll back last deployment" />
      <Cmd name="/k8s-ctx [ctx]"  desc="List or switch kubectl context" />
      <Cmd name="/tf-ws [ws]"     desc="List or switch Terraform workspace" />
      <Cmd name="/logs"           desc="Stream pod/container logs" />
      <Cmd name="/auth-refresh"   desc="Refresh cloud credentials (AWS/GCP/Azure)" />
      <Cmd name="/incident"       desc="Create or view incidents" />
      <Cmd name="/runbook [file]" desc="Execute a runbook YAML file" />

      {/* ── Session ── */}
      <Section title="Session" />
      <Cmd name="/sessions"       desc="List recent sessions" />
      <Cmd name="/new [name]"     desc="Create a new session" />
      <Cmd name="/switch <id>"    desc="Switch to a different session" />
      <Cmd name="/export"         desc="Export session as Markdown runbook" />
      <Cmd name="/share"          desc="Share this session (generates URL)" />
      <Cmd name="/cost"           desc="Show token usage and cost for this session" />
      <Cmd name="/compact"        desc="Compress context to free token budget" />
      <Cmd name="/context"        desc="Show context window breakdown" />
      <Cmd name="/clear"          desc="Clear conversation history" />
      <Cmd name="/remember"       desc="Save a note to NIMBUS.md persistent context" />
      <Cmd name="/profile [name]" desc="Load or switch a named config profile" />

      {/* ── Navigation ── */}
      <Section title="Navigation" />
      <Cmd name="/search [query]" desc="Search conversation history" />
      <Cmd name="/tree"           desc="Toggle file tree sidebar" />
      <Cmd name="/terminal"       desc="Toggle tool output terminal pane" />
      <Cmd name="/watch [glob]"   desc="Watch files for changes (default: DevOps files)" />
      <Cmd name="/diff"           desc="Show unstaged git diff" />
      <Cmd name="/undo"           desc="Undo last file change (snapshot)" />
      <Cmd name="/redo"           desc="Redo last undone change" />

      {/* ── Settings ── */}
      <Section title="Settings" />
      <Cmd name="/mode plan"      desc="Switch to plan mode (read-only tools)" />
      <Cmd name="/mode build"     desc="Switch to build mode (file + infra tools)" />
      <Cmd name="/mode deploy"    desc="Switch to deploy mode (all tools + previews)" />
      <Cmd name="/model [name]"   desc="Show or switch the active LLM model" />
      <Cmd name="/models"         desc="List all available provider models" />
      <Cmd name="/theme [name]"   desc="Switch color theme (dark/light/solarized)" />
      <Cmd name="/init"           desc="Regenerate NIMBUS.md project context" />
      <Cmd name="/tools"          desc="List all available agent tools" />
      <Cmd name="/plugin <cmd>"   desc="Manage MCP plugins (install/uninstall/list)" />

      {/* ── Keyboard shortcuts ── */}
      <Section title="Keyboard Shortcuts" />
      <Text>  <Text color="cyan">{"?  or  /help     "}</Text><Text dimColor>Open this help panel</Text></Text>
      <Text>  <Text color="cyan">{"Tab              "}</Text><Text dimColor>Cycle mode (plan → build → deploy)</Text></Text>
      <Text>  <Text color="cyan">{"Ctrl+R           "}</Text><Text dimColor>Search input history</Text></Text>
      <Text>  <Text color="cyan">{"Ctrl+C           "}</Text><Text dimColor>Cancel current tool or exit</Text></Text>
      <Text>  <Text color="cyan">{"Esc              "}</Text><Text dimColor>Abort current operation</Text></Text>
      <Text>  <Text color="cyan">{"G (uppercase)    "}</Text><Text dimColor>Scroll to bottom of messages</Text></Text>
      <Text>  <Text color="cyan">{"Esc / q / ?      "}</Text><Text dimColor>Close this help panel</Text></Text>

      <Box marginTop={1}>
        <Text dimColor>Press Esc, q, or ? to close</Text>
      </Box>
    </Box>
  );
}
