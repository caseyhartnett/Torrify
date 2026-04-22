# Web Analytics Handoff

This repo now emits first-party web analytics events to a Gatekeeper-compatible endpoint:

- `POST /api/analytics/events`

The frontend batches anonymous events and sends them to the same Railway-hosted gateway base URL already used for managed web traffic.

## Endpoint Contract

Request body:

```json
{
  "anonymousId": "uuid",
  "sessionId": "uuid",
  "sentAt": "2026-04-22T16:08:00.000Z",
  "events": [
    {
      "eventName": "project_download_initiated",
      "occurredAt": "2026-04-22T16:07:58.000Z",
      "page": "/",
      "runtime": "web",
      "appVersion": "0.9.3",
      "props": {
        "source": "save_project",
        "fileType": "torrify",
        "backend": "openscad",
        "hasLicenseKeyConfigured": false
      }
    }
  ]
}
```

Response:

- `202 Accepted` when the batch is accepted for persistence
- `400` for invalid schema / oversized payloads
- `429` for rate-limited callers

## Recommended Railway Env Vars

- `ANALYTICS_ENABLED=true`
- `ANALYTICS_ALLOWED_ORIGINS=https://app.torrify.org`
- `ANALYTICS_MAX_BATCH_SIZE=50`
- `ANALYTICS_MAX_BODY_BYTES=65536`
- `ANALYTICS_RETENTION_DAYS=180`
- `ANALYTICS_IP_HASH_SALT=<secret>`

## Postgres Schema

Starter SQL lives at:

- [railway_analytics_events.sql](/home/bigred/Torrify/docs/architecture/railway_analytics_events.sql)

It creates:

- `analytics_events` raw event table
- indexes for common reporting paths
- `analytics_daily_event_counts` rollup view
- `analytics_torrify_file_activity` rollup view

## Backend Responsibilities

- Validate batch size, body size, and event shape
- Enforce CORS allowlist
- Rate-limit by `anonymousId` and hashed client IP
- Persist `ip_hash`, not the raw IP address
- Keep request payloads free of code, chat contents, file contents, and license keys
- Run retention cleanup for old rows

## Current Frontend Event Set

- `app_session_started`
- `settings_opened`
- `new_file_clicked`
- `open_file_clicked`
- `save_file_clicked`
- `save_as_clicked`
- `recent_file_opened`
- `recent_files_cleared`
- `save_project_clicked`
- `load_project_clicked`
- `project_download_initiated`
- `project_upload_selected`
- `project_upload_parsed`
- `export_source_clicked`
- `source_export_initiated`
- `export_stl_clicked`
- `stl_export_initiated`
- `render_requested`
- `render_completed`
- `render_failed`
- `chat_message_sent`
- `image_attachment_added`
