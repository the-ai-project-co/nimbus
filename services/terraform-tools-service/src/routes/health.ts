export function healthHandler() {
  return {
    status: 'healthy',
    service: 'terraform-tools-service',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  };
}
