export function healthHandler() {
  return {
    status: 'healthy',
    service: 'helm-tools-service',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  };
}
