import { FileSystemOperations } from './fs/operations';
import { logger } from '@nimbus/shared-utils';

interface RouteContext {
  req: Request;
  url: URL;
  path: string;
  method: string;
}

/**
 * Parse JSON body from request
 */
async function parseBody<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}

/**
 * Create success response
 */
function success(data: any, status: number = 200): Response {
  return Response.json({ success: true, data }, { status });
}

/**
 * Create error response
 */
function error(message: string, status: number = 500): Response {
  return Response.json({ success: false, error: message }, { status });
}

/**
 * Health check handler
 */
export function healthHandler(): Response {
  return Response.json({
    status: 'healthy',
    service: 'fs-tools-service',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
  });
}

/**
 * POST /api/fs/read - Read file content
 */
async function handleRead(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{ path: string; encoding?: BufferEncoding }>(ctx.req);

    if (!body.path) {
      return error('Missing required field: path', 400);
    }

    const fsOps = new FileSystemOperations();
    const content = await fsOps.readFile(body.path, body.encoding);

    return success({ content, path: body.path });
  } catch (err: any) {
    logger.error('Read file failed', err);
    return error(err.message);
  }
}

/**
 * POST /api/fs/write - Write file content
 */
async function handleWrite(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{ path: string; content: string; createDirs?: boolean }>(ctx.req);

    if (!body.path || body.content === undefined) {
      return error('Missing required fields: path, content', 400);
    }

    const fsOps = new FileSystemOperations();
    const result = await fsOps.writeFile(body.path, body.content, { createDirs: body.createDirs });

    return success(result);
  } catch (err: any) {
    logger.error('Write file failed', err);
    return error(err.message);
  }
}

/**
 * POST /api/fs/append - Append to file
 */
async function handleAppend(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{ path: string; content: string }>(ctx.req);

    if (!body.path || !body.content) {
      return error('Missing required fields: path, content', 400);
    }

    const fsOps = new FileSystemOperations();
    const result = await fsOps.appendFile(body.path, body.content);

    return success(result);
  } catch (err: any) {
    logger.error('Append file failed', err);
    return error(err.message);
  }
}

/**
 * POST /api/fs/list - List files in directory
 */
async function handleList(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{
      directory: string;
      pattern?: string;
      recursive?: boolean;
      includeHidden?: boolean;
      onlyFiles?: boolean;
      onlyDirectories?: boolean;
    }>(ctx.req);

    if (!body.directory) {
      return error('Missing required field: directory', 400);
    }

    const fsOps = new FileSystemOperations();
    const files = await fsOps.list(body.directory, {
      pattern: body.pattern,
      recursive: body.recursive,
      includeHidden: body.includeHidden,
      onlyFiles: body.onlyFiles,
      onlyDirectories: body.onlyDirectories,
    });

    return success({ files, count: files.length });
  } catch (err: any) {
    logger.error('List directory failed', err);
    return error(err.message);
  }
}

/**
 * POST /api/fs/search - Search for content in files
 */
async function handleSearch(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{
      directory: string;
      pattern: string;
      caseSensitive?: boolean;
      wholeWord?: boolean;
      maxResults?: number;
      includeContext?: boolean;
      filePattern?: string;
    }>(ctx.req);

    if (!body.directory || !body.pattern) {
      return error('Missing required fields: directory, pattern', 400);
    }

    const fsOps = new FileSystemOperations();
    const results = await fsOps.search(body.directory, {
      pattern: body.pattern,
      caseSensitive: body.caseSensitive,
      wholeWord: body.wholeWord,
      maxResults: body.maxResults,
      includeContext: body.includeContext,
      filePattern: body.filePattern,
    });

    return success({ results, count: results.length });
  } catch (err: any) {
    logger.error('Search failed', err);
    return error(err.message);
  }
}

/**
 * POST /api/fs/tree - Generate directory tree
 */
async function handleTree(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{
      directory: string;
      maxDepth?: number;
      includeHidden?: boolean;
      includeFiles?: boolean;
    }>(ctx.req);

    if (!body.directory) {
      return error('Missing required field: directory', 400);
    }

    const fsOps = new FileSystemOperations();
    const tree = await fsOps.tree(body.directory, {
      maxDepth: body.maxDepth,
      includeHidden: body.includeHidden,
      includeFiles: body.includeFiles ?? true,
    });

    return success({ tree });
  } catch (err: any) {
    logger.error('Tree generation failed', err);
    return error(err.message);
  }
}

/**
 * POST /api/fs/diff - Get file diff
 */
async function handleDiff(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{
      file1: string;
      file2: string;
      unified?: number;
      ignoreWhitespace?: boolean;
    }>(ctx.req);

    if (!body.file1 || !body.file2) {
      return error('Missing required fields: file1, file2', 400);
    }

    const fsOps = new FileSystemOperations();
    const diff = await fsOps.diff(body.file1, body.file2, {
      unified: body.unified,
      ignoreWhitespace: body.ignoreWhitespace,
    });

    return success({ diff });
  } catch (err: any) {
    logger.error('Diff failed', err);
    return error(err.message);
  }
}

/**
 * POST /api/fs/copy - Copy file or directory
 */
async function handleCopy(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{
      source: string;
      destination: string;
      recursive?: boolean;
      overwrite?: boolean;
    }>(ctx.req);

    if (!body.source || !body.destination) {
      return error('Missing required fields: source, destination', 400);
    }

    const fsOps = new FileSystemOperations();
    const result = await fsOps.copy(body.source, body.destination, {
      recursive: body.recursive,
      overwrite: body.overwrite,
    });

    return success(result);
  } catch (err: any) {
    logger.error('Copy failed', err);
    return error(err.message);
  }
}

/**
 * POST /api/fs/move - Move/rename file or directory
 */
async function handleMove(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{ source: string; destination: string }>(ctx.req);

    if (!body.source || !body.destination) {
      return error('Missing required fields: source, destination', 400);
    }

    const fsOps = new FileSystemOperations();
    const result = await fsOps.move(body.source, body.destination);

    return success(result);
  } catch (err: any) {
    logger.error('Move failed', err);
    return error(err.message);
  }
}

/**
 * DELETE /api/fs/delete - Delete file or directory
 */
async function handleDelete(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{ path: string; recursive?: boolean; force?: boolean }>(ctx.req);

    if (!body.path) {
      return error('Missing required field: path', 400);
    }

    const fsOps = new FileSystemOperations();
    const result = await fsOps.delete(body.path, {
      recursive: body.recursive,
      force: body.force,
    });

    return success(result);
  } catch (err: any) {
    logger.error('Delete failed', err);
    return error(err.message);
  }
}

/**
 * POST /api/fs/mkdir - Create directory
 */
async function handleMkdir(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{ path: string; recursive?: boolean }>(ctx.req);

    if (!body.path) {
      return error('Missing required field: path', 400);
    }

    const fsOps = new FileSystemOperations();
    const result = await fsOps.mkdir(body.path, { recursive: body.recursive });

    return success(result);
  } catch (err: any) {
    logger.error('Mkdir failed', err);
    return error(err.message);
  }
}

/**
 * POST /api/fs/exists - Check if file/directory exists
 */
async function handleExists(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{ path: string }>(ctx.req);

    if (!body.path) {
      return error('Missing required field: path', 400);
    }

    const fsOps = new FileSystemOperations();
    const exists = await fsOps.exists(body.path);

    return success({ exists, path: body.path });
  } catch (err: any) {
    logger.error('Exists check failed', err);
    return error(err.message);
  }
}

/**
 * POST /api/fs/stat - Get file stats
 */
async function handleStat(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{ path: string }>(ctx.req);

    if (!body.path) {
      return error('Missing required field: path', 400);
    }

    const fsOps = new FileSystemOperations();
    const stats = await fsOps.stat(body.path);

    return success({ stats, path: body.path });
  } catch (err: any) {
    logger.error('Stat failed', err);
    return error(err.message);
  }
}

/**
 * POST /api/fs/readdir - Read directory entries
 */
async function handleReadDir(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{ path: string }>(ctx.req);

    if (!body.path) {
      return error('Missing required field: path', 400);
    }

    const fsOps = new FileSystemOperations();
    const entries = await fsOps.readDir(body.path);

    return success({ entries, count: entries.length });
  } catch (err: any) {
    logger.error('ReadDir failed', err);
    return error(err.message);
  }
}

/**
 * Main router function
 */
export async function router(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  const ctx: RouteContext = { req, url, path, method };

  // Health check
  if (path === '/health') {
    return healthHandler();
  }

  // API routes
  if (path.startsWith('/api/fs')) {
    const route = path.replace('/api/fs', '');

    // POST routes
    if (method === 'POST') {
      switch (route) {
        case '/read':
          return handleRead(ctx);
        case '/write':
          return handleWrite(ctx);
        case '/append':
          return handleAppend(ctx);
        case '/list':
          return handleList(ctx);
        case '/search':
          return handleSearch(ctx);
        case '/tree':
          return handleTree(ctx);
        case '/diff':
          return handleDiff(ctx);
        case '/copy':
          return handleCopy(ctx);
        case '/move':
          return handleMove(ctx);
        case '/mkdir':
          return handleMkdir(ctx);
        case '/exists':
          return handleExists(ctx);
        case '/stat':
          return handleStat(ctx);
        case '/readdir':
          return handleReadDir(ctx);
      }
    }

    // DELETE routes
    if (method === 'DELETE') {
      switch (route) {
        case '/delete':
          return handleDelete(ctx);
      }
    }
  }

  return new Response('Not Found', { status: 404 });
}
