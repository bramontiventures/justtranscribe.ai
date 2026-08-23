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
    throw new z.errors.ThrottledError(message, retryAfter);
  }
  // Callers that opted out of throwing (skipThrowForStatus) handle the rest themselves.
  if (response.status >= 400 && !response.skipThrowForStatus) {
    let message = `JustTranscribe returned HTTP ${response.status}.`;
    try {
      message = (response.data && response.data.error) || message;
    } catch (e) {
      // body not JSON
    }
    throw new z.errors.Error(message, 'JustTranscribeError', response.status);
  }
  return response;
};

module.exports = { addApiKey, handleErrors };
