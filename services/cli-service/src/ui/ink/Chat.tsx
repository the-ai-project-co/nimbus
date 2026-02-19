/**
 * Chat Component
 *
 * Main chat container that manages message state, LLM streaming,
 * and renders the conversation using Ink primitives.
 */

import React, { useState, useCallback } from 'react';
import { Box, Text, useApp } from 'ink';
import { MessageDisplay } from './Message';
import { ChatInput } from './Input';
import { LoadingSpinner } from './Spinner';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

interface ChatProps {
  model?: string;
  systemPrompt?: string;
  showTokenCount?: boolean;
}

export function Chat({ model, systemPrompt, showTokenCount }: ChatProps) {
  const { exit } = useApp();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastTokenCount, setLastTokenCount] = useState<number | null>(null);

  const handleSubmit = useCallback(
    async (input: string) => {
      if (!input.trim()) return;

      if (input.trim() === '/exit' || input.trim() === '/quit') {
        exit();
        return;
      }

      const userMessage: ChatMessage = {
        role: 'user',
        content: input,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);
      setError(null);
      setLastTokenCount(null);

      try {
        // Dynamic import to avoid issues if LLM service is not available
        const { LLMClient } = await import('../../clients');
        const llmClient = new LLMClient();

        const allMessages = [
          ...(systemPrompt
            ? [{ role: 'system' as const, content: systemPrompt }]
            : []),
          ...messages.map((m) => ({ role: m.role, content: m.content })),
          { role: 'user' as const, content: input },
        ];

        let responseContent = '';
        let tokenCount: number | null = null;
        const stream = llmClient.streamChat(allMessages, { model });

        for await (const chunk of stream) {
          if (chunk.type === 'content' && chunk.content) {
            responseContent += chunk.content;
          } else if (chunk.type === 'done' && chunk.tokenCount) {
            tokenCount = chunk.tokenCount;
          } else if (chunk.type === 'error') {
            throw new Error(chunk.message || 'Stream error');
          }
        }

        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: responseContent,
          timestamp: new Date(),
        };

        setMessages((prev) => [...prev, assistantMessage]);

        if (showTokenCount && tokenCount !== null) {
          setLastTokenCount(tokenCount);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to get response');
      } finally {
        setIsLoading(false);
      }
    },
    [messages, model, systemPrompt, showTokenCount, exit],
  );

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Nimbus Chat
        </Text>
        <Text dimColor> (Ink UI) </Text>
        {model && <Text dimColor>| Model: {model}</Text>}
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        {messages.map((msg, i) => (
          <MessageDisplay key={i} message={msg} />
        ))}
      </Box>

      {isLoading && <LoadingSpinner text="Thinking..." />}

      {error && (
        <Box marginBottom={1}>
          <Text color="red">Error: {error}</Text>
        </Box>
      )}

      {!isLoading && <ChatInput onSubmit={handleSubmit} />}

      {showTokenCount && lastTokenCount !== null && (
        <Box marginTop={0}>
          <Text dimColor>Tokens used: {lastTokenCount}</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>Type /exit to quit</Text>
      </Box>
    </Box>
  );
}
