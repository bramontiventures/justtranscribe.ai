'use strict';

const { BASE_URL } = require('./lib/api');

/** Add the API key to every request that goes to JustTranscribe (never to file downloads elsewhere). */
const addApiKey = (request, z, bundle) => {
  if (bundle.authData && bundle.authData.api_key && request.url.startsWith(BASE_URL)) {
    request.headers = request.headers || {};
    request.headers.Authorization = `Bearer ${bundle.authData.api_key}`;
  }
  return request;
};

/**
 * Zapier's publishing rules forbid naming specific third-party sites in any
 * user-facing text (Partner review, 2026-08-31). Our API's URL-validation
 * error lists the supported platforms by name — correct in our own app,
 * not allowed once Zapier surfaces it — so relayed messages are rewritten
 * here. Only the wording changes; the failure is identical.
 */
const PLATFORM_NAMES = /(youtube|tiktok|instagram|facebook|pinterest|google drive)/i;
const genericise = (message) =>
  PLATFORM_NAMES.test(message)
    ? 'That URL is not a supported public audio or video link. Use a publicly accessible link, or "Create Transcript from File" for anything behind a sign-in.'
    : message;

/** Turn JustTranscribe's JSON errors into the right Zapier error types. */
const handleErrors = (response, z) => {
  if (!response.request.url.startsWith(BASE_URL)) return response;
  if (response.status === 401) {
    throw new z.errors.Error(
      'Your JustTranscribe API key is invalid or was revoked. Reconnect with a new key from justtranscribe.ai → Profile → API keys.',
      'AuthenticationError',
      401,
    );
  }
  // (zapier-platform-core already turns 429 + Retry-After into a ThrottledError; this is a fallback.)
  if (response.status === 429) {
    const retryAfter = Number(response.getHeader('retry-after')) || 600;
    let message = 'JustTranscribe rate limit reached — Zapier will retry automatically.';
    try {
      message = response.data.error || message;
    } catch (e) {
      // body not JSON
    }
    throw new z.errors.ThrottledError(genericise(message), retryAfter);
  }
  // Callers that opted out of throwing (skipThrowForStatus) handle the rest themselves.
  if (response.status >= 400 && !response.skipThrowForStatus) {
    let message = `JustTranscribe returned HTTP ${response.status}.`;
    try {
      message = (response.data && response.data.error) || message;
    } catch (e) {
      // body not JSON
    }
    throw new z.errors.Error(genericise(message), 'JustTranscribeError', response.status);
  }
  return response;
};

module.exports = { addApiKey, handleErrors };
