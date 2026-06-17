import type { VercelRequest, VercelResponse } from '@vercel/node';
import { errorResponse } from '../../src/middleware/error';
import collection from '../../src/routes/drafts/collection';
import item from '../../src/routes/drafts/item';
import send from '../../src/routes/drafts/send';

/**
 * Single Serverless Function for the whole /api/v1/drafts tree. The per-route
 * handlers live under src/routes/drafts so they don't each count against the
 * deployment's function limit. Sub-paths are mapped here by `rewrites` in
 * vercel.json, which inject a `__route` discriminator (and `id` where needed):
 *
 *   /drafts            -> collection (POST create)        [no rewrite]
 *   /drafts/:id        -> item       (PATCH/DELETE)  __route=item id=:id
 *   /drafts/:id/send   -> send       (POST)          __route=send id=:id
 *
 * Each handler still validates its own HTTP method.
 */
export default function handler(
  req: VercelRequest,
  res: VercelResponse,
): void | Promise<void> {
  switch (req.query.__route) {
    case 'item':
      return item(req, res);
    case 'send':
      return send(req, res);
    case undefined:
      return collection(req, res);
    default:
      return errorResponse(res, 404, 'NOT_FOUND', 'Unknown drafts route');
  }
}
