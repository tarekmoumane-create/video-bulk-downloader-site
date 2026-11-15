import { HttpError, handle, isActive, isKey, readJson, send } from './_stripe.js';

const VIDEO_RE = /https?:\/\/(?:(?:www|m)\.)?tiktok\.com\/(?:@[\w.-]+\/(?:video|photo)\/\d+|t\/\w+|v\/\d+)|https?:\/\/(?:vm|vt)\.tiktok\.com\/\w+|https?:\/\/(?:www\.)?instagram\.com\/(?:p|reel|tv|stories|igtv)\/[\w-]+|https?:\/\/(?:www\.)?youtube\.com\/watch\?v=[\w-]+|https?:\/\/(?:www\.)?youtube\.com\/shorts\/[\w-]+|https?:\/\/youtu\.be\/[\w-]+/gi;

export function findLinks(text) {
  const seen = new Set();
  return (String(text).match(VIDEO_RE) || []).filter((u) => {
    const k = u.toLowerCase().replace(/\/$/, '');
    return seen.has(k) ? false : seen.add(k);
  });
}

// POST /api/sheet { url, key } -> { links } from a Google Sheet shared as "Anyone with the link".
// Paid: the key must belong to an active Google Sheet subscription.
export default handle(['POST'], async (req, res) => {
  const { url, key } = await readJson(req);
  if (!isKey(key) || !(await isActive(key))) {
    throw new HttpError(402, 'Google Sheet import needs a subscription ($4.99/month).');
  }
  const id = String(url || '').match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1];
  if (!id) throw new HttpError(400, "That doesn't look like a Google Sheet link.");
  const gid = String(url).match(/[#&?]gid=(\d+)/)?.[1];
  const exportUrl = `https://docs.google.com/spreadsheets/d/${id}/export?format=csv${gid ? `&gid=${gid}` : ''}`;
  const r = await fetch(exportUrl, { redirect: 'follow' });
  if (!r.ok || (r.headers.get('content-type') || '').includes('text/html')) {
    throw new HttpError(400, 'Couldn\'t open that sheet. Set sharing to "Anyone with the link" and try again.');
  }
  send(res, 200, { links: findLinks(await r.text()) });
});
