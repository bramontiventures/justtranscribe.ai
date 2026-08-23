'use strict';

const nock = require('nock');
const zapier = require('zapier-platform-core');
const App = require('../index');

const appTester = zapier.createAppTester(App);
zapier.tools.env.inject();

const BASE = 'https://justtranscribe.ai';
const authData = { api_key: 'jt_live_' + 'a'.repeat(40) };
const apiTranscript = {
  id: 'abc-123',
  status: 'complete',
  title: 'Me at the zoo',
  platform: 'youtube',
  url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
  language: 'english',
  durationSec: 19,
  error: null,
  createdAt: '2026-08-22T00:53:00.000Z',
  text: 'Alright, so here we are in front of the elephants.\nThe cool thing about these guys is that they have really long trunks.',
  transcript: { segments: [{ start_s: 1, end_s: 3.5, text: 'Alright, so here we are in front of the elephants.' }, { start_s: 5.3, end_s: 12.4, text: 'The cool thing about these guys is that they have really long trunks.' }] },
  analysis: { main_idea: 'A man describes elephants at the zoo.' },
};

afterEach(() => nock.cleanAll());

describe('authentication', () => {
  test('test request returns the account and labels the connection', async () => {
    nock(BASE).get('/api/v1/me').matchHeader('authorization', `Bearer ${authData.api_key}`).reply(200, { userId: 'u1', name: 'Bramonti', plan: 'beta' });
    const result = await appTester(App.authentication.test, { authData });
    expect(result.name).toBe('Bramonti');
    expect(App.authentication.connectionLabel(null, { inputData: result })).toBe('Bramonti');
  });

  test('a revoked key raises an authentication error', async () => {
    nock(BASE).get('/api/v1/me').reply(401, { error: 'Invalid or revoked API key.' });
    await expect(appTester(App.authentication.test, { authData })).rejects.toThrow(/API key is invalid or was revoked/);
  });

  test('429 becomes a ThrottledError with the Retry-After delay', async () => {
    nock(BASE).get('/api/v1/me').reply(429, { error: 'Rate limit exceeded' }, { 'Retry-After': '42' });
    const err = await appTester(App.authentication.test, { authData }).catch((e) => e);
    expect(err.name).toBe('ThrottledError');
    // zapier-platform-core converts 429 + Retry-After into a ThrottledError itself; Zapier retries after the delay.
    expect(JSON.parse(err.message).delay).toBe(42);
  });
});

describe('trigger: transcript_completed', () => {
  test('maps the API list into flat items with lazy text and files', async () => {
    nock(BASE).get('/api/v1/transcripts').query({ status: 'complete', limit: '50' }).reply(200, { transcripts: [apiTranscript], limit: 50, offset: 0, hasMore: false });
    const results = await appTester(App.triggers.transcript_completed.operation.perform, { authData });
    expect(results).toHaveLength(1);
    const item = results[0];
    expect(item.id).toBe('abc-123');
    expect(item.duration_seconds).toBe(19);
    expect(item.view_url).toBe(`${BASE}/analysis/abc-123`);
    expect(item.text).toMatch(/^hydrate\|\|\|/);
    expect(item.srt_file).toMatch(/^hydrate\|\|\|/);
  });
});

describe('create: create_transcript_url', () => {
  test('with wait on (Zap running) it sends the callback URL as webhookUrl and returns the pending job', async () => {
    let sentBody;
    nock(BASE).post('/api/v1/transcripts', (body) => { sentBody = body; return true; }).reply(201, { id: 'abc-123', status: 'pending', queued: false });
    const result = await appTester(App.creates.create_transcript_url.operation.perform, {
      authData,
      inputData: { url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw', wait_for_completion: true },
      meta: { isLoadingSample: false },
    });
    expect(sentBody.url).toBe('https://www.youtube.com/watch?v=jNQXAC9IVRw');
    expect(sentBody.webhookUrl).toMatch(/^https:\/\//);
    expect(result).toEqual({ id: 'abc-123', status: 'pending', queued: false });
  });

  test('performResume shapes the webhook payload into the action output', async () => {
    const result = await appTester(App.creates.create_transcript_url.operation.performResume, {
      authData,
      cleanedRequest: { event: 'transcript.completed', ...apiTranscript },
    });
    expect(result.status).toBe('complete');
    expect(result.text).toMatch(/elephants/);
    expect(result.summary).toBe('A man describes elephants at the zoo.');
    expect(result.segment_count).toBe(2);
  });

  test('performResume surfaces a failed transcription as an error', async () => {
    await expect(
      appTester(App.creates.create_transcript_url.operation.performResume, { authData, cleanedRequest: { event: 'transcript.failed', status: 'failed', error: 'Video is private.' } }),
    ).rejects.toThrow(/Video is private/);
  });

  test('with wait off it returns the job immediately without a webhook', async () => {
    let sentBody;
    nock(BASE).post('/api/v1/transcripts', (body) => { sentBody = body; return true; }).reply(201, { id: 'abc-123', status: 'pending', queued: false });
    nock(BASE).get('/api/v1/transcripts/abc-123').reply(200, { ...apiTranscript, status: 'pending', text: null, transcript: null, analysis: null });
    const result = await appTester(App.creates.create_transcript_url.operation.perform, {
      authData,
      inputData: { url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw', wait_for_completion: false },
      meta: { isLoadingSample: false },
    });
    expect(sentBody.webhookUrl).toBeUndefined();
    expect(result.status).toBe('pending');
    expect(result.id).toBe('abc-123');
  });

  test('API validation errors are shown verbatim', async () => {
    nock(BASE).post('/api/v1/transcripts').reply(422, { error: "That doesn't look like a YouTube, TikTok, Instagram, Facebook, Pinterest, or Google Drive link." });
    await expect(
      appTester(App.creates.create_transcript_url.operation.perform, { authData, inputData: { url: 'https://example.com/x', wait_for_completion: false }, meta: { isLoadingSample: false } }),
    ).rejects.toThrow(/doesn't look like a YouTube/);
  });
});

describe('create: create_transcript_file', () => {
  test('downloads the Zapier-hosted file and uploads it as multipart with the callback', async () => {
    nock('https://zapier-files.example').get('/voice-note.opus').reply(200, Buffer.from('OggS fake bytes'), { 'content-type': 'audio/ogg', 'content-disposition': 'attachment; filename="voice-note.opus"' });
    let rawBody = '';
    nock(BASE).post('/api/v1/transcripts', (body) => { rawBody = typeof body === 'string' ? body : JSON.stringify(body); return true; }).reply(201, { id: 'f-1', status: 'pending', queued: false });
    const result = await appTester(App.creates.create_transcript_file.operation.perform, {
      authData,
      inputData: { file: 'https://zapier-files.example/voice-note.opus', wait_for_completion: true },
      meta: { isLoadingSample: false },
    });
    expect(rawBody).toMatch(/name="file"; filename="voice-note.opus"/);
    expect(rawBody).toMatch(/name="webhook_url"/);
    expect(rawBody).toMatch(/OggS fake bytes/);
    expect(result.id).toBe('f-1');
  });
});

describe('search: find_transcript', () => {
  test('returns the shaped transcript', async () => {
    nock(BASE).get('/api/v1/transcripts/abc-123').reply(200, apiTranscript);
    const results = await appTester(App.searches.find_transcript.operation.perform, { authData, inputData: { transcript_id: 'abc-123' } });
    expect(results).toHaveLength(1);
    expect(results[0].language).toBe('english');
  });
  test('returns an empty list when the ID is unknown', async () => {
    nock(BASE).get('/api/v1/transcripts/nope').reply(404, { error: 'Transcript not found.' });
    const results = await appTester(App.searches.find_transcript.operation.perform, { authData, inputData: { transcript_id: 'nope' } });
    expect(results).toEqual([]);
  });
});

describe('create: export_transcript', () => {
  test('text formats return the content and honor the option flags', async () => {
    nock(BASE).get('/api/v1/transcripts/abc-123/export/srt').query({ ts: '0', sp: '1' }).reply(200, '1\n00:00:01,000 --> 00:00:03,500\nSpeaker 1: Alright…\n', { 'content-type': 'application/x-subrip' });
    const result = await appTester(App.creates.export_transcript.operation.perform, {
      authData,
      inputData: { transcript_id: 'abc-123', format: 'srt', include_timestamps: false, include_speakers: true },
    });
    expect(result.content).toMatch(/Speaker 1/);
    expect(result.filename).toBe('transcript-abc-123.srt');
    expect(result.content_type).toBe('application/x-subrip');
  });
});
