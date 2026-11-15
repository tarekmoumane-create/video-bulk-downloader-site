import { HttpError, handle, isActive, isKey, send, stripe } from './_stripe.js';

// GET /api/license?session_id=cs_...  -> { key, active }   (right after checkout)
// GET /api/license?key=cus_...        -> { active }        (periodic check)
export default handle(['GET'], async (req, res, q) => {
  const sessionId = q.get('session_id');
  if (sessionId) {
    if (!/^cs_[A-Za-z0-9_]{10,200}$/.test(sessionId)) throw new HttpError(400, 'Bad session');
    const session = await stripe(`/checkout/sessions/${sessionId}`);
    if (session.status !== 'complete' || !session.customer) return send(res, 200, { active: false });
    return send(res, 200, { key: session.customer, active: await isActive(session.customer) });
  }
  const key = q.get('key');
  if (!isKey(key)) throw new HttpError(400, 'Bad key');
  send(res, 200, { active: await isActive(key) });
});
