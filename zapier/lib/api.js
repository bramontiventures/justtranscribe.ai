'use strict';

/**
 * Shared helpers for the JustTranscribe Zapier integration.
 * API reference: https://justtranscribe.ai/developers
 */

const BASE_URL = 'https://justtranscribe.ai';

const EXPORT_CONTENT_TYPES = {
  txt: 'text/plain',
  srt: 'application/x-subrip',
  vtt: 'text/vtt',
  csv: 'text/csv',
  md: 'text/markdown',
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};
const TEXT_FORMATS = new Set(['txt', 'srt', 'vtt', 'csv', 'md']);

/** Flatten the API's transcript JSON into Zapier-friendly top-level fields. */
const shapeTranscript = (t) => ({
  id: t.id,
  status: t.status,
  title: t.title || null,
  language: t.language || null,
  duration_seconds: t.durationSec == null ? null : t.durationSec,
  platform: t.platform || null,
  source_url: t.url || null,
  created_at: t.createdAt || null,
  error: t.error || null,
  text:
    t.text ||
    (t.transcript && Array.isArray(t.transcript.segments)
      ? t.transcript.segments.map((s) => s.text).join('\n')
      : null),
  segment_count: t.transcript && Array.isArray(t.transcript.segments) ? t.transcript.segments.length : null,
  segments: t.transcript ? t.transcript.segments : null,
  summary: t.analysis && t.analysis.main_idea ? t.analysis.main_idea : null,
  analysis: t.analysis || null,
  view_url: t.id ? `${BASE_URL}/analysis/${t.id}` : null,
});

const SAMPLE_TRANSCRIPT = shapeTranscript({
  id: '3f1c2b7e-9a1d-4c55-8e21-7b0f6a9d2e10',
  status: 'complete',
  title: 'Team sync — 22 Aug',
  language: 'spanish',
  durationSec: 42,
  platform: 'upload',
  url: null,
  createdAt: '2026-08-22T10:15:00.000Z',
  error: null,
  text: 'Buenos días a todos. Hoy revisamos el presupuesto del tercer trimestre.\nEl gasto en publicidad subió un doce por ciento.',
  transcript: {
    segments: [
      { start_s: 0, end_s: 4.2, text: 'Buenos días a todos. Hoy revisamos el presupuesto del tercer trimestre.' },
      { start_s: 4.6, end_s: 8.1, text: 'El gasto en publicidad subió un doce por ciento.' },
    ],
  },
  analysis: { main_idea: 'A short budget review: ad spend rose 12% in Q3.' },
});

const TRANSCRIPT_OUTPUT_FIELDS = [
  { key: 'id', label: 'Transcript ID', type: 'string' },
  { key: 'status', label: 'Status', type: 'string' },
  { key: 'title', label: 'Title', type: 'string' },
  { key: 'language', label: 'Detected language', type: 'string' },
  { key: 'duration_seconds', label: 'Duration (seconds)', type: 'integer' },
  { key: 'platform', label: 'Source platform', type: 'string' },
  { key: 'source_url', label: 'Source URL', type: 'string' },
  { key: 'created_at', label: 'Created at', type: 'datetime' },
  { key: 'text', label: 'Transcript text', type: 'string' },
  { key: 'segment_count', label: 'Number of segments', type: 'integer' },
  { key: 'summary', label: 'AI summary', type: 'string' },
  { key: 'view_url', label: 'Open in JustTranscribe', type: 'string' },
  { key: 'error', label: 'Error (if failed)', type: 'string' },
];

/** Wait briefly for a transcript while the Zap editor loads a sample. */
const pollBriefly = async (z, id, maxMs) => {
  const deadline = Date.now() + maxMs;
  // Always fetch at least once, then keep polling until the budget is spent.
  for (;;) {
    const res = await z.request({ url: `${BASE_URL}/api/v1/transcripts/${id}` });
    const last = res.data;
    if (last.status === 'complete' || last.status === 'failed' || Date.now() >= deadline) return last;
    await new Promise((r) => setTimeout(r, 4000));
  }
};

module.exports = {
  BASE_URL,
  EXPORT_CONTENT_TYPES,
  TEXT_FORMATS,
  shapeTranscript,
  SAMPLE_TRANSCRIPT,
  TRANSCRIPT_OUTPUT_FIELDS,
  pollBriefly,
};
