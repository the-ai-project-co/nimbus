export function healthHandler() {
  return {
    status: 'healthy',
    service: 'generator-service',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  };
}
