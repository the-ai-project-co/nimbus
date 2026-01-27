export async function historyRouter(req: Request, path: string): Promise<Response> {
  // TODO: Implement history management
  return Response.json({
    message: 'History routes - to be implemented',
    path,
  });
}
