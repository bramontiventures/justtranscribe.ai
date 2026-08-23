'use strict';

const { BASE_URL } = require('./lib/api');

/**
 * API-key authentication. Keys are created at justtranscribe.ai → Profile →
 * API keys (free account). The test request hits /api/v1/me, which also
 * provides the account name for the connection label.
 */
const test = async (z) => {
  const response = await z.request({ url: `${BASE_URL}/api/v1/me` });
  return response.data;
};

module.exports = {
  type: 'custom',
  fields: [
    {
      key: 'api_key',
      label: 'API key',
      required: true,
      type: 'password',
      helpText:
        'Create a free key at [justtranscribe.ai → Profile → API keys](https://justtranscribe.ai/profile). It starts with `jt_live_` and is shown only once.',
    },
  ],
  test,
  connectionLabel: (z, bundle) => bundle.inputData.name || 'JustTranscribe account',
};
