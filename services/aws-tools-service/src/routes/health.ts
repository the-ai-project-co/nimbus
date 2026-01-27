export function healthHandler() {
  return {
    status: 'healthy',
    service: 'aws-tools-service',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  };
}
