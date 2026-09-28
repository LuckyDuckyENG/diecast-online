/**
 * "This visit is me, not a visitor."
 *
 * WHY THIS EXISTS
 *
 * The dev-server guard in log-search and log-click keys off NODE_ENV, so it
 * only covers localhost. diecasts.app runs a production build, which means
 * every time the owner opens his own site to check something he adds a page
 * view to Vercel, and a row to search_queries or outbound_clicks if he
 * searches or taps through to a shop.
 *
 * With traffic this low that is not a rounding error. search_queries held ONE
 * row when this was written. A single session of checking the site would have
 * been the entire dataset, and the whole point of those tables is to answer
 * "what do people want" — an answer contaminated by the person asking is
 * worse than no answer, because it looks like data.
 *
 * Search Console is unaffected either way: it counts impressions and clicks
 * from Google's results page, so typing the URL or using a bookmark never
 * registered there in the first place.
 *
 * HOW IT IS SET
 *
 * Visit any page with ?notme=1 once. The flag persists in localStorage for
 * that browser until cleared with ?notme=0. It is deliberately per-browser
 * rather than per-account: there are no accounts, and a cookie would be sent
 * to the server on every request for a decision only the client needs to make.
 *
 * WHAT IT IS NOT
 *
 * Not a privacy feature and not a consent mechanism — it excludes exactly one
 * person who opts himself out, and anyone who finds the parameter can silence
 * their own analytics, which costs nothing worth protecting. Bot filtering and
 * the is_bot column are unrelated and still do their own job.
 */

const KEY = 'diecasts:notme';

/**
 * Reads the flag, and honours ?notme= if present so that a single visit to
 * `diecasts.app/?notme=1` arms it for good.
 *
 * Returns false during server rendering. That is correct rather than merely
 * safe: nothing is logged from the server for a page view, and the callers
 * are all browser-side effects.
 */
export function isOwnerVisit(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const param = new URLSearchParams(window.location.search).get('notme');
    if (param === '1') window.localStorage.setItem(KEY, '1');
    else if (param === '0') window.localStorage.removeItem(KEY);
    return window.localStorage.getItem(KEY) === '1';
  } catch {
    // Private browsing and blocked storage both throw here. Failing to false
    // means an unreadable flag counts the visit, which is the honest default:
    // better to over-count the owner than to silently under-count everyone.
    return false;
  }
}
