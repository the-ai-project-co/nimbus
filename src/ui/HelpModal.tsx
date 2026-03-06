/**
 * HelpModal Component
 *
 * Dismissable overlay that shows all available slash commands and keyboard
 * shortcuts without polluting the conversation history.
 */

import React from 'react';
import { Box, Text, useInput } from 'ink';

interface HelpModalProps {
  onClose: () => void;
}

export function HelpModal({ onClose }: HelpModalProps) {
  useInput((input, key) => {
    if (key.escape || input === 'q' || input === '?') onClose();
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" padding={1} marginY={1}>
      <Text bold color="cyan"> Nimbus DevOps Agent — Help </Text>
      <Text> </Text>
      <Text bold>Slash Commands:</Text>
      <Text>  /help           Show this help</Text>
      <Text>  /mode plan      Switch to plan mode (read-only tools)</Text>
      <Text>  /mode build     Switch to build mode (file + infra tools)</Text>
      <Text>  /mode deploy    Switch to deploy mode (all tools + previews)</Text>
      <Text>  /clear          Clear conversation history</Text>
      <Text>  /compact        Compress context to free tokens</Text>
      <Text>  /context        Show context window usage</Text>
      <Text>  /cost           Show token usage and cost</Text>
      <Text>  /diff           Show unstaged git diff</Text>
      <Text>  /init           Regenerate NIMBUS.md project context</Text>
      <Text>  /model [name]   Show or switch the active model</Text>
      <Text>  /models         List all available provider models</Text>
      <Text>  /undo           Undo last file change (snapshot)</Text>
      <Text>  /redo           Redo last undone change</Text>
      <Text>  /sessions       List active sessions</Text>
      <Text>  /new [name]     Create a new session</Text>
      <Text>  /switch {'<id>'}   Switch to a different session</Text>
      <Text> </Text>
      <Text bold>DevOps Tools Available:</Text>
      <Text>  terraform, kubectl, helm, cloud_discover, cost_estimate,</Text>
      <Text>  drift_detect, deploy_preview, git, task (subagent)</Text>
      <Text> </Text>
      <Text bold>Keyboard Shortcuts:</Text>
      <Text>  ?               Open this help panel</Text>
      <Text>  Tab             Cycle mode (plan → build → deploy)</Text>
      <Text>  Ctrl+R          Search input history</Text>
      <Text>  Ctrl+C          Interrupt or exit</Text>
      <Text>  Esc / q / ?     Close this help</Text>
      <Text> </Text>
      <Text dimColor>Press Esc, q, or ? to close</Text>
    </Box>
  );
}
