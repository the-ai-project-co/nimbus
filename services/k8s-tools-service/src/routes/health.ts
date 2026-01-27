export function healthHandler() {
  return {
    status: 'healthy',
    service: 'k8s-tools-service',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  };
}
