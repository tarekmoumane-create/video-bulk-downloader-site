// Shared Stripe helpers. The secret key only ever lives in the server's
// environment (STRIPE_SECRET_KEY); the downloader app never sees it.
const API = 'https://api.stripe.com/v1';
export const LOOKUP = 'vbd_sheets_monthly';
// The downloader runs on the user's own Mac, so Checkout sends them back there.
export const APP = 'http://127.0.0.1:8765';

function form(value, prefix = '', out = new URLSearchParams()) {
  if (value === undefined || value === null) return out;
  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) form(v, prefix ? `${prefix}[${k}]` : k, out);
  } else {
    out.append(prefix, String(value));
  }
  return out;
}

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export async function stripe(path, { method = 'GET', body, query } = {}) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new HttpError(503, 'Payments are not set up yet.');
  const qs = query ? `?${form(query)}` : '';
  const response = await fetch(`${API}${path}${qs}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: body ? form(body) : undefined,
  });
  const json = await response.json();
  if (!response.ok) {
    const err = new HttpError(response.status === 404 ? 404 : 502, json.error?.message || 'Stripe error');
    err.stripeCode = json.error?.code;
    throw err;
  }
  return json;
}

/** The $4.99/month price. Created on first use, so switching keys needs no setup. */
export async function sheetsPrice() {
  const found = await stripe('/prices', { query: { lookup_keys: [LOOKUP], active: true, limit: 1 } });
  if (found.data[0]) return found.data[0].id;
  const product = await stripe('/products', {
    method: 'POST',
    body: { name: 'Video Downloader: Google Sheet import', description: 'Import video links straight from a Google Sheet.' },
  });
  const price = await stripe('/prices', {
    method: 'POST',
    body: {
      product: product.id, unit_amount: 499, currency: 'usd', nickname: 'Monthly',
      recurring: { interval: 'month' }, lookup_key: LOOKUP,
    },
  });
  return price.id;
}

/** True while the customer has a live Google Sheet subscription. */
export async function isActive(customer) {
  try {
    const subs = await stripe('/subscriptions', { query: { customer, status: 'all', limit: 20 } });
    return subs.data.some((s) => ['active', 'trialing', 'past_due'].includes(s.status)
      && s.items.data.some((item) => item.price.lookup_key === LOOKUP));
  } catch (err) {
    if (err.status === 404 || err.stripeCode === 'resource_missing') return false; // unknown customer
    throw err;
  }
}

export const isKey = (key) => typeof key === 'string' && /^cus_[A-Za-z0-9]{6,40}$/.test(key);

export async function readJson(req) {
  if (req.body !== undefined) return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body;
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

export function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}

export function handle(methods, fn) {
  return async (req, res) => {
    if (!methods.includes(req.method)) return send(res, 405, { error: 'Method not allowed' });
    try {
      await fn(req, res, new URL(req.url, 'http://x').searchParams);
    } catch (err) {
      send(res, err.status && err.status < 600 ? err.status : 500, { error: err.message || 'Something went wrong' });
    }
  };
}
