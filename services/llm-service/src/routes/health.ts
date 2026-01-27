export function healthHandler() {
  return {
    status: 'healthy',
    service: 'llm-service',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  };
}
