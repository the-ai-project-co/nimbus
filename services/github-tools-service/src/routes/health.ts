export function healthHandler() {
  return {
    status: 'healthy',
    service: 'github-tools-service',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  };
}
