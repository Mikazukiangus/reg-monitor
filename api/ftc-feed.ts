import type { IncomingMessage, ServerResponse } from 'node:http';
import { relayFeed } from '../server/relay.js';
import { FTC } from '../server/sources/us-feeds.js';

// Vercel function in a US region (vercel.json) that reads the FTC's press
// release feed for the app's functions, which run in Hong Kong. It reads only
// that one feed.
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  const reply = await relayFeed(FTC.url);
  res.writeHead(reply.status, reply.headers);
  res.end(req.method === 'HEAD' ? undefined : reply.body);
}
