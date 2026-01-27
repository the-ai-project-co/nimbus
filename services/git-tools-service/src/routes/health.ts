export function healthHandler() {
  return {
    status: 'healthy',
    service: 'git-tools-service',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  };
}
