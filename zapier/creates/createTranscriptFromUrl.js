'use strict';

const { BASE_URL, shapeTranscript, SAMPLE_TRANSCRIPT, TRANSCRIPT_OUTPUT_FIELDS, pollBriefly } = require('../lib/api');

/**
 * Create a transcript from a public video link.
 *
 * "Wait until finished" uses Zapier's callback pattern: we hand the API a
 * z.generateCallbackUrl() as the completion webhook, Zapier pauses the Zap,
 * and JustTranscribe POSTs the finished transcript to that URL (minutes
 * later) — performResume then returns it to the next step. While the Zap
 * editor loads a sample (bundle.meta.isLoadingSample) callbacks are not
 * available, so we poll briefly instead.
 */
const perform = async (z, bundle) => {
  const wait = bundle.inputData.wait_for_completion !== false;
  const body = { url: bundle.inputData.url };
  const useCallback = wait && !bundle.meta.isLoadingSample;
  if (useCallback) body.webhookUrl = z.generateCallbackUrl();

  const response = await z.request({ method: 'POST', url: `${BASE_URL}/api/v1/transcripts`, body });
  const created = response.data;

  if (useCallback) {
    // Returned now, completed by performResume when the webhook arrives.
    return { id: created.id, status: created.status, queued: created.queued === true };
  }
  if (wait) {
    return shapeTranscript(await pollBriefly(z, created.id, 25000));
  }
  return shapeTranscript(await pollBriefly(z, created.id, 0));
};

const performResume = async (z, bundle) => {
  const payload = bundle.cleanedRequest;
  if (payload.event === 'transcript.failed' || payload.status === 'failed') {
    throw new z.errors.Error(`Transcription failed: ${payload.error || 'unknown error'}`, 'TranscriptionFailed', 422);
  }
  return shapeTranscript(payload);
};

module.exports = {
  key: 'create_transcript_url',
  noun: 'Transcript',
  display: {
    label: 'Create Transcript from URL',
    description: 'Transcribes a public YouTube, TikTok, Instagram, Facebook, Pinterest or Google Drive video.',
  },
  operation: {
    perform,
    performResume,
    inputFields: [
      {
        key: 'url',
        label: 'Video URL',
        type: 'string',
        required: true,
        helpText: 'A public link. Private or login-only videos cannot be fetched — use "Create Transcript from File" for those.',
        placeholder: 'https://www.youtube.com/watch?v=…',
      },
      {
        key: 'wait_for_completion',
        label: 'Wait until finished',
        type: 'boolean',
        default: 'true',
        helpText:
          'Pauses the Zap until the transcript is ready (a short recording takes about a minute; long ones take several) and returns the full text. Turn off to get just the transcript ID immediately.',
      },
    ],
    sample: SAMPLE_TRANSCRIPT,
    outputFields: TRANSCRIPT_OUTPUT_FIELDS,
  },
};
