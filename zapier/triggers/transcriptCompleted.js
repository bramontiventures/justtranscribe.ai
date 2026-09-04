'use strict';

const { BASE_URL, shapeTranscript, SAMPLE_TRANSCRIPT, TRANSCRIPT_OUTPUT_FIELDS } = require('../lib/api');
const hydrators = require('../hydrators');

/**
 * Polling trigger: fires for each transcript that reached "complete" —
 * whether it was created by this Zap, another Zap, the n8n node, or a
 * person in the app. Newest first; Zapier dedupes on `id`.
 */
const perform = async (z, bundle) => {
  const response = await z.request({
    url: `${BASE_URL}/api/v1/transcripts`,
    params: { status: 'complete', limit: 50 },
  });
  return response.data.transcripts.map((t) => ({
    ...shapeTranscript(t),
    text: z.dehydrate(hydrators.transcriptText, { id: t.id }),
    srt_file: z.dehydrateFile(hydrators.transcriptFile, { id: t.id, format: 'srt' }),
    txt_file: z.dehydrateFile(hydrators.transcriptFile, { id: t.id, format: 'txt' }),
  }));
};

module.exports = {
  key: 'transcript_completed',
  noun: 'Transcript',
  display: {
    label: 'Transcript Completed',
    description: 'Triggers when a transcript finishes processing.',
  },
  operation: {
    type: 'polling',
    perform,
    sample: {
      ...SAMPLE_TRANSCRIPT,
      srt_file: 'https://justtranscribe.ai/samples/apollo13.srt',
      txt_file: 'https://justtranscribe.ai/samples/apollo13.txt',
    },
    outputFields: [
      ...TRANSCRIPT_OUTPUT_FIELDS,
      { key: 'srt_file', label: 'SRT subtitle file', type: 'file' },
      { key: 'txt_file', label: 'Plain text file', type: 'file' },
    ],
  },
};
