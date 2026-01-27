export function healthHandler() {
  return {
    status: 'healthy',
    service: 'cli-service',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  };
}
