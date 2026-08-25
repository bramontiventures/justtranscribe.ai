# JustTranscribe for Make

The official [Make](https://www.make.com) app for
[JustTranscribe](https://justtranscribe.ai) — transcribe audio files, voice
notes, meetings and public video links, and pull the text, subtitles or AI
analysis into any scenario.

Built on the public API: <https://justtranscribe.ai/developers>

## Modules

| Module | Type | What it does |
| --- | --- | --- |
| Watch Completed Transcripts | trigger (polling) | Fires for each transcript that finishes (or fails), newest first, with the full text in the bundle. |
| Watch Transcript Events | trigger (instant) | Gives you a webhook URL; JustTranscribe posts the finished transcript to it the moment it is ready. |
| Transcribe a Media URL | action | Starts a transcription from a YouTube / TikTok / Instagram / Facebook / Pinterest / Drive link. |
| Transcribe a File | action | Uploads an audio or video file (up to 500 MB / 150 min) and starts its transcription. |
| Get a Transcript | action | Text, segments, detected language and AI analysis for one transcript. |
| Download a Transcript | action | The transcript as a file: SRT, VTT, TXT, MD, CSV, PDF or DOCX. |
| Delete a Transcript | action | Removes a transcript and its stored media. |
| List Transcripts | search | The transcripts on the account, newest first, with pagination. |
| Make an API Call | universal | Any other endpoint, authorized with the same connection. |

### Getting the finished text

Transcription is asynchronous — a minute of audio takes roughly a minute, an
hour-long recording takes several. Make stops **any** module after 40
seconds, so a module cannot sit and wait for a long recording. Three ways to
get the result, in order of preference:

1. **Watch Transcript Events** (instant). Copy the webhook URL it generates
   into the *Webhook URL* field of a Transcribe module. No polling, no delay.
2. **Watch Completed Transcripts** (polling) in a second scenario. It keeps a
   cursor on when each transcript *finished*, so nothing is missed or
   repeated.
3. **Wait for the transcript** — the toggle on the Transcribe modules and on
   *Get a Transcript*. It polls inside the module for about 30 seconds, which
   is enough for a voice note or a short clip. If time runs out the module
   still returns the ID and the current status rather than failing.

## Connection

API key. Create one free at [justtranscribe.ai](https://justtranscribe.ai/api-keys)
under **API** (or Profile → API keys); it starts with `jt_live_` and is shown
once. The key is sent as `Authorization: Bearer …` and is sanitized out of
Make's logs.

An API key is not a way around the app's limits: the same per-account brakes
apply (three new transcripts an hour, one at a time, the daily spend cap).
When the account is over the daily cap a transcript is accepted with status
`queued` and starts by itself when the window reopens.

## Repository layout

```
app.json                  app metadata + the module/RPC/webhook manifest
src/base.imljson          base URL, auth header, error handling, log sanitization
src/connections/…         the API-key connection (test call = GET /api/v1/me)
src/webhooks/…            the dedicated webhook behind the instant trigger
src/modules/<name>/       api · expect · parameters · interface · samples · epoch
src/rpcs/…                dynamic dropdown of recent transcripts
scripts/check.mjs         offline lint: JSON, module sections, rpc:// refs, IML, review rules
scripts/deploy.mjs        create/update the app in Make through the SDK Apps API
```

### To verify on the first real deploy

Three things this repo cannot check offline, because only Make can evaluate
them. Check them in the Make DevTool the first time the app runs:

- **Pagination offset.** The list and trigger modules send
  `offset = (pagination.page - 1) * 100` on pagination requests only.
  Confirm the second request asks for `offset=100`, not `offset=0` —
  Make's `pagination.page` counter starting point is documented ambiguously.
- **The downloaded file name**, parsed out of `content-disposition` with a
  fallback of `transcript.<format>` if the expression does not resolve.
- **`response.type` per status** on the download module — `binary` for the
  file, `json` for a 4xx so the error message still reads properly.

`.imljson` files are Make's IML JSON — the same content the Make web editor
and the VS Code *Make Apps Editor* extension show for each section.

## Working on it

```bash
node scripts/check.mjs                 # offline; run before every deploy
node scripts/deploy.mjs --dry-run      # shows every API call, sends none
MAKE_API_TOKEN=… MAKE_ZONE=eu2 node scripts/deploy.mjs
```

The token needs the `sdk-apps:read` and `sdk-apps:write` scopes. The names
Make generates (app suffix, connection, webhook) land in `.make-state.json`,
which is git-ignored because it belongs to one Make organization — delete it
only if you intend to create a second app.

© Bramonti Ventures. MIT.
