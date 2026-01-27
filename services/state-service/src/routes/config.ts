export async function configRouter(req: Request, path: string): Promise<Response> {
  // TODO: Implement config management
  return Response.json({
    message: 'Config routes - to be implemented',
    path,
  });
}
