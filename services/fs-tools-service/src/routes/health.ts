export function healthHandler() {
  return {
    status: 'healthy',
    service: 'fs-tools-service',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  };
}
