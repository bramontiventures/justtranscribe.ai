'use strict';

const { BASE_URL, shapeTranscript, SAMPLE_TRANSCRIPT, TRANSCRIPT_OUTPUT_FIELDS } = require('../lib/api');

/** Look up a transcript by ID — status, text, language, AI summary. */
const perform = async (z, bundle) => {
  const response = await z.request({
    url: `${BASE_URL}/api/v1/transcripts/${bundle.inputData.transcript_id}`,
    skipThrowForStatus: true,
  });
  if (response.status === 404) return [];
  response.throwForStatus();
  return [shapeTranscript(response.data)];
};

module.exports = {
  key: 'find_transcript',
  noun: 'Transcript',
  display: {
    label: 'Find Transcript',
    description: 'Finds a transcript by its ID and returns its status, text and AI summary.',
  },
  operation: {
    perform,
    inputFields: [{ key: 'transcript_id', label: 'Transcript', type: 'string', required: true, dynamic: 'transcript_completed.id.title', helpText: 'Pick a recent transcript, or map an ID from a previous step.' }],
    sample: SAMPLE_TRANSCRIPT,
    outputFields: TRANSCRIPT_OUTPUT_FIELDS,
  },
};
