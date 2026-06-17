import type { VercelRequest, VercelResponse } from '@vercel/node';
import { errorResponse } from '../../src/middleware/error';
import collection from '../../src/routes/messages/collection';
import item from '../../src/routes/messages/item';
import labels from '../../src/routes/messages/labels';
import search from '../../src/routes/messages/search';

/**
 * Single Serverless Function for the whole /api/v1/messages tree. The per-route
 * handlers live under src/routes/messages so they don't each count against the
 * deployment's function limit. Sub-paths are mapped here by `rewrites` in
 * vercel.json, which inject a `__route` discriminator (and `id` where needed):
 *
 *   /messages              -> collection (GET list, POST send)  [no rewrite]
 *   /messages/search       -> search     (GET)        __route=search
 *   /messages/:id          -> item       (GET/PATCH/DELETE)  __route=item   id=:id
 *   /messages/:id/labels   -> labels     (POST/DELETE)        __route=labels id=:id
 *
 * Each handler still validates its own HTTP method.
 */
export default function handler(
  req: VercelRequest,
  res: VercelResponse,
): void | Promise<void> {
  switch (req.query.__route) {
    case 'search':
      return search(req, res);
    case 'item':
      return item(req, res);
    case 'labels':
      return labels(req, res);
    case undefined:
      return collection(req, res);
    default:
      return errorResponse(res, 404, 'NOT_FOUND', 'Unknown messages route');
  }
}
