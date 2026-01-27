export function healthHandler() {
  return {
    status: 'healthy',
    service: 'core-engine-service',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  };
}
