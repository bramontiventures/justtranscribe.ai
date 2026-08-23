'use strict';

const { BASE_URL, EXPORT_CONTENT_TYPES } = require('./lib/api');

/**
 * Lazy loaders: the polling trigger returns pointers to these, so Zapier
 * only downloads a transcript's text/file when a Zap actually maps it.
 */
const transcriptText = async (z, bundle) => {
  const response = await z.request({
    url: `${BASE_URL}/api/v1/transcripts/${bundle.inputData.id}/export/txt`,
    params: { ts: '0' },
    raw: true,
  });
  return response.text();
};

const transcriptFile = async (z, bundle) => {
  const { id, format } = bundle.inputData;
  const response = await z.request({
    url: `${BASE_URL}/api/v1/transcripts/${id}/export/${format}`,
    raw: true,
  });
  const buffer = await response.buffer();
  return z.stashFile(buffer, buffer.length, `transcript-${id}.${format}`, EXPORT_CONTENT_TYPES[format] || 'application/octet-stream');
};

module.exports = { transcriptText, transcriptFile };
