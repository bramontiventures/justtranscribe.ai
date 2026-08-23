# JustTranscribe for Zapier

Zapier integration (Platform CLI) for [JustTranscribe](https://justtranscribe.ai):
transcribe audio/video files and public video links into timestamped text,
then export SRT/TXT/DOCX — inside Zaps.

| Type | Key | What it does |
| --- | --- | --- |
| Trigger (polling) | `transcript_completed` | New finished transcript on the account (text + SRT/TXT files lazily loaded) |
| Action | `create_transcript_url` | Transcribe a public YouTube/TikTok/Instagram/Facebook/Pinterest/Drive link; **waits until finished** via Zapier callbacks |
| Action | `create_transcript_file` | Transcribe a file from a previous step (WhatsApp `.opus` included); same wait |
| Action | `export_transcript` | SRT, VTT, TXT, CSV, Markdown, PDF, DOCX as a Zapier file (+ text) |
| Search | `find_transcript` | Look up a transcript by ID |

Auth: API key (`jt_live_…`) from justtranscribe.ai → Profile → API keys.
Waiting uses the API's completion webhook (`webhookUrl` = Zapier callback
URL) — see https://justtranscribe.ai/developers.

## Develop

```bash
npm install
npm test                 # unit tests (nock-mocked API)
npm run validate      # schema + integration checks
./node_modules/.bin/zapier-platform login         # once, with the brand's Zapier account
./node_modules/.bin/zapier-platform register      # once, creates .zapierapprc (do not commit)
npm run push          # deploy this version to Zapier
```

`zapier-platform-core` 19 runs on Node 22 at Zapier. Keep this directory
dependency-free beyond `form-data` (multipart uploads).
