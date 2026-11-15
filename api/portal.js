import { HttpError, handle, isKey, readJson, returnBase, send, stripe } from './_stripe.js';

async function portalConfig() {
  const found = await stripe('/billing_portal/configurations', { query: { active: true, limit: 1 } });
  if (found.data[0]) return found.data[0].id;
  const made = await stripe('/billing_portal/configurations', {
    method: 'POST',
    body: {
      features: {
        subscription_cancel: { enabled: true, mode: 'at_period_end' },
        payment_method_update: { enabled: true },
        invoice_history: { enabled: true },
      },
    },
  });
  return made.id;
}

// POST /api/portal { key } -> { url } where the subscriber can cancel or change their card.
export default handle(['POST'], async (req, res) => {
  const { key, from } = await readJson(req);
  if (!isKey(key)) throw new HttpError(400, 'Bad key');
  const session = await stripe('/billing_portal/sessions', {
    method: 'POST',
    body: { customer: key, return_url: `${returnBase(req, from)}/`, configuration: await portalConfig() },
  });
  send(res, 200, { url: session.url });
});
