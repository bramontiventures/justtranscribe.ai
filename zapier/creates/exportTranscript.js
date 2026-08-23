'use strict';

const { BASE_URL, EXPORT_CONTENT_TYPES, TEXT_FORMATS } = require('../lib/api');

/** Download a finished transcript as a file (and as text for text formats). */
const perform = async (z, bundle) => {
  const { transcript_id: id, format } = bundle.inputData;
  const params = {};
  if (bundle.inputData.include_timestamps === false) params.ts = '0';
  if (bundle.inputData.include_speakers === true) params.sp = '1';

  const response = await z.request({ url: `${BASE_URL}/api/v1/transcripts/${id}/export/${format}`, params, raw: true });
  const buffer = await response.buffer();
  const filename = `transcript-${id}.${format}`;
  const contentType = EXPORT_CONTENT_TYPES[format] || 'application/octet-stream';

  let file = null;
  try {
    file = await z.stashFile(buffer, buffer.length, filename, contentType);
  } catch (e) {
    // Stashing needs Zapier's runtime (unavailable in local unit tests); the content is still returned.
    file = null;
  }
  return {
    id,
    format,
    filename,
    content_type: contentType,
    content: TEXT_FORMATS.has(format) ? buffer.toString('utf8') : null,
    file,
  };
};

module.exports = {
  key: 'export_transcript',
  noun: 'Export',
  display: {
    label: 'Export Transcript',
    description: 'Downloads a finished transcript as SRT, VTT, TXT, CSV, Markdown, PDF or DOCX.',
  },
  operation: {
    perform,
    inputFields: [
      { key: 'transcript_id', label: 'Transcript ID', type: 'string', required: true, helpText: 'From "Create Transcript" or the "Transcript Completed" trigger.' },
      {
        key: 'format',
        label: 'Format',
        type: 'string',
        required: true,
        default: 'srt',
        choices: { srt: 'SRT subtitles', vtt: 'WebVTT subtitles', txt: 'Plain text', csv: 'CSV (segments)', md: 'Markdown', pdf: 'PDF', docx: 'Word (DOCX)' },
      },
      { key: 'include_timestamps', label: 'Include timestamps', type: 'boolean', default: 'true', helpText: 'SRT/VTT keep their cue timings regardless.' },
      { key: 'include_speakers', label: 'Include speaker labels', type: 'boolean', default: 'false', helpText: 'Uses speaker detection already run on the transcript in JustTranscribe; never triggers a paid detection.' },
    ],
    sample: {
      id: '3f1c2b7e-9a1d-4c55-8e21-7b0f6a9d2e10',
      format: 'srt',
      filename: 'transcript-3f1c2b7e-9a1d-4c55-8e21-7b0f6a9d2e10.srt',
      content_type: 'application/x-subrip',
      content: '1\n00:00:00,000 --> 00:00:04,200\nBuenos días a todos. Hoy revisamos el presupuesto del tercer trimestre.\n',
      file: 'https://justtranscribe.ai/samples/apollo13.srt',
    },
    outputFields: [
      { key: 'id', label: 'Transcript ID', type: 'string' },
      { key: 'format', label: 'Format', type: 'string' },
      { key: 'filename', label: 'File name', type: 'string' },
      { key: 'content_type', label: 'Content type', type: 'string' },
      { key: 'content', label: 'Content (text formats)', type: 'string' },
      { key: 'file', label: 'File', type: 'file' },
    ],
  },
};
