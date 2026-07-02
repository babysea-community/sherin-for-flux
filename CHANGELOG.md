# Changelog

All notable changes will be documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add free-tier scheduled queue draining on both hosts through the `CRON_SECRET`-guarded `/api/generations/process` endpoint: a Netlify Scheduled Function (`netlify/functions/process-generations`, every 5 minutes) and a Vercel Cron Job (`vercel.json`, daily - the Hobby-plan maximum). Both advance queued or running generations when no owner browser is open; the client kicker and post-submit processing cover active sessions.
- Add optional Backblaze B2 storage support for generated media and reference assets.
- Cancel provider-side work when the owner cancels an active generation: Black Forest Labs tasks are canceled through the Black Forest Labs API and BabySea generations through the SDK (best-effort) before the generation is marked failed.

### Changed

- Standardize Black Forest Labs BYOK form rendering around Semantic Lady schema fields.
- Separate image and video input handling for FLUX models while keeping shared UI media/file wording generic.
- Render Black Forest Labs duration as a bounded select control and use local field descriptions for Studio form help text.
- Order Studio model dropdowns by image models first, then video models, with alphabetical sorting inside each group.
- Order storage providers alphabetically (`aws-s3`, `backblaze-b2`, `cloudflare-r2`, `supabase-storage`, `vercel-blob`) wherever they are enumerated across configuration, adapters, and dashboards.
- Expose a base64 input image field for Black Forest Labs Flux 1.x direct BYOK models.
- Treat Black Forest Labs Flux 1.x direct BYOK image prompts as base64-only by rejecting generic uploaded or linked input images before submission.

### Fixed

- Accept standard Backblaze `B2_KEY_ID`, `B2_APP_KEY`, and `B2_BUCKET_NAME` env aliases and refresh stale Backblaze Native API account tokens before falling back to Supabase Storage.
- Read the Backblaze B2 endpoints from the v3 `b2_authorize_account` response (`apiInfo.storageApi`) so bucket lookups and uploads no longer fail with an undefined URL and silently fall back to Supabase Storage.
- Display generated media and reference assets stored in a private Backblaze B2 bucket by adding the Backblaze download host to the image and media Content-Security-Policy allowlists.
- Time out Backblaze B2 authorize, upload, and control-plane API requests so a stalled B2 endpoint can no longer hang media uploads or signed-URL generation.
- Release failed asset-download response bodies between retries to avoid leaking connections when a provider asset URL returns an error.
- Give generated video players an accessible name for screen readers.
- Ignore stale form values that are outside the active FLUX model schema.
- Omit empty video input values from BYOK submissions so image-only FLUX model paths do not receive unsupported schema fields.
- Preserve durable input reference assets after terminal generation states so the References dashboard keeps displaying uploaded and URL-based inputs.
- Normalize optional `/v1` suffixes from `BFL_API_BASE_URL` and reject non-API BFL hosts for polling URLs.

## [0.1.0] - 2026-06-26 - INITIAL RELEASED

- Implement FLUX models.
