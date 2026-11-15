import { APP, handle, send, sheetsPrice, stripe } from './_stripe.js';

// POST /api/checkout -> { url } of a Stripe Checkout page for the subscription.
export default handle(['POST'], async (req, res) => {
  const price = await sheetsPrice();
  const session = await stripe('/checkout/sessions', {
    method: 'POST',
    body: {
      mode: 'subscription',
      line_items: [{ price, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: `${APP}/unlocked?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP}/?sheets=cancelled`,
    },
  });
  send(res, 200, { url: session.url });
});
