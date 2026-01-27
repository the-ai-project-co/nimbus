export function healthHandler() {
  return {
    status: 'healthy',
    service: 'state-service',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  };
}
