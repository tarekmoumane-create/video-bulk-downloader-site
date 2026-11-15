import { handle, readJson, returnBase, send, sheetsPrice, stripe } from './_stripe.js';

// POST /api/checkout { from?: 'web' } -> { url } of a Stripe Checkout page for the subscription.
// The Mac app gets sent back to itself; the website gets sent back to the website.
export default handle(['POST'], async (req, res) => {
  const { from } = await readJson(req).catch(() => ({}));
  const base = returnBase(req, from);
  const back = from === 'web' ? `${base}/?session_id={CHECKOUT_SESSION_ID}` : `${base}/unlocked?session_id={CHECKOUT_SESSION_ID}`;
  const price = await sheetsPrice();
  const session = await stripe('/checkout/sessions', {
    method: 'POST',
    body: {
      mode: 'subscription',
      line_items: [{ price, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: back,
      cancel_url: `${base}/?sheets=cancelled`,
    },
  });
  send(res, 200, { url: session.url });
});
