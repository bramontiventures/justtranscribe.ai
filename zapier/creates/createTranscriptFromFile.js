'use strict';

const FormData = require('form-data');
const { BASE_URL, shapeTranscript, SAMPLE_TRANSCRIPT, TRANSCRIPT_OUTPUT_FIELDS, pollBriefly } = require('../lib/api');

/**
 * Create a transcript from a file. Zapier hands a file input to us as a
 * temporary URL; we download it and stream it to the API as multipart.
 * Waiting works exactly like the URL action (callback → performResume).
 */
const perform = async (z, bundle) => {
  const wait = bundle.inputData.wait_for_completion !== false;
  const useCallback = wait && !bundle.meta.isLoadingSample;

  const fileResponse = await z.request({ url: bundle.inputData.file, raw: true, skipThrowForStatus: true });
  if (fileResponse.status >= 400) {
    throw new z.errors.Error('Could not download the file Zapier provided for this step.', 'FileDownloadError', 400);
  }
  const buffer = await fileResponse.buffer();
  const disposition = fileResponse.headers.get('content-disposition') || '';
  const nameMatch = disposition.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  const filename = (bundle.inputData.filename || (nameMatch ? decodeURIComponent(nameMatch[1]) : '') || 'upload').slice(0, 120);

  const form = new FormData();
  form.append('file', buffer, { filename, contentType: fileResponse.headers.get('content-type') || 'application/octet-stream' });
  if (useCallback) form.append('webhook_url', z.generateCallbackUrl());

  const response = await z.request({ method: 'POST', url: `${BASE_URL}/api/v1/transcripts`, body: form });
  const created = response.data;

  if (useCallback) {
    // Returned now, completed by performResume when the webhook arrives.
    return { id: created.id, status: created.status, queued: created.queued === true };
  }
  // Editor "Test step" runs have a hard 30-second budget that also covers
  // everything above — poll only briefly and return whatever status we have
  // (the published Zap waits properly via the callback).
  return shapeTranscript(await pollBriefly(z, created.id, wait ? 8000 : 0));
};

const performResume = async (z, bundle) => {
  const payload = bundle.cleanedRequest;
  if (payload.event === 'transcript.failed' || payload.status === 'failed') {
    throw new z.errors.Error(`Transcription failed: ${payload.error || 'unknown error'}`, 'TranscriptionFailed', 422);
  }
  return shapeTranscript(payload);
};

module.exports = {
  key: 'create_transcript_file',
  noun: 'Transcript',
  display: {
    label: 'Create Transcript From File',
    description: 'Transcribes an audio or video file (MP3, WAV, M4A, OGG/OPUS — WhatsApp voice notes — FLAC, MP4, MOV, WEBM, MKV; up to 500 MB / 150 minutes).',
  },
  operation: {
    perform,
    performResume,
    inputFields: [
      {
        key: 'file',
        label: 'Audio or video file',
        type: 'file',
        required: true,
        helpText: 'Map a file from a previous step — for example a new file from a cloud storage app, or an email attachment.',
      },
      {
        key: 'filename',
        label: 'File name',
        type: 'string',
        required: false,
        helpText: 'Optional — used as the transcript title. Include the extension (e.g. `meeting.m4a`) when the source step does not provide one.',
      },
      {
        key: 'wait_for_completion',
        label: 'Wait until finished',
        type: 'boolean',
        default: 'true',
        helpText:
          'Pauses the Zap until the transcript is ready and returns the full text. Turn off to get just the transcript ID immediately.',
      },
    ],
    sample: SAMPLE_TRANSCRIPT,
    outputFields: TRANSCRIPT_OUTPUT_FIELDS,
  },
};
