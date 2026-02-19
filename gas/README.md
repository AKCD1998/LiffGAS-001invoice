# GAS Backend (Step 2)

This folder contains a Google Apps Script backend skeleton for:

- Sheet initialization (`Requests`, `Admins`, `AuditLog`, `LineUsers`)
- `GET /health`
- `GET /me?lineUserId=Uxxxx`
- `GET /getDraft?lineUserId=Uxxxx`
- `GET /adminMe?lineUserId=Uxxxx`
- Basic `POST` placeholder route
- `POST /saveSection` (Step 3)
- `POST /adminLogin` (Google + allowlist verification)
- `POST /adminListRequests` (admin dashboard list)
- `POST /adminGetRequest` (admin request detail)

## File map

- `src/Code.js`: GAS entry points (`doGet`, `doPost`, `doOptions`)
- `src/http.js`: routing + JSON responses
- `src/utils.js`: audit, validation, rate-limit, cache, CORS policy helpers
- `src/sheets.js`: Spreadsheet + sheet initialization helpers
- `src/auth.js`: admin role lookup from `Admins` sheet
- `src/admin.js`: Google token verification + admin login endpoints
- `src/adminRequests.js`: admin dashboard request list query
- `src/adminRequestDetail.js`: admin request detail query
- `src/line.js`: LINE Messaging API push (progress notifications)
- `appsscript.json`: GAS manifest

## Required Script Properties

- `SHEET_ID`: target spreadsheet ID
- `LINE_CHANNEL_ACCESS_TOKEN`: LINE Messaging API channel access token
- `LINE_PUSH_ENABLED`: `"true"` or `"false"` (default behavior should be treated as `"false"`)
- `LINE_PUSH_DRY_RUN`: `"true"` or `"false"` (default behavior should be treated as `"true"`)
- `LIFF_APP_BASE_URL`: optional LIFF deep link (example: `https://liff.line.me/<liffId>`)
- `GOOGLE_ALLOWED_DOMAIN`: workspace domain (example: `scgroup1989.com`)
- `GOOGLE_ALLOWED_EMAILS`: optional CSV allowed emails override
- `GOOGLE_IDTOKEN_VERIFY_MODE`: set `"tokeninfo"` (default)
- `ALLOWED_ORIGINS`: optional CSV allowlist for CORS origin policy (for stricter mode)
- `MAINTENANCE_MODE`: `"true"` blocks customer `saveSection` writes temporarily

No secrets are stored in code.

## Route usage

Use query param `path` for route selection:

- `?path=health`
- `?path=me&lineUserId=Uxxxx`
- `?path=getDraft&lineUserId=Uxxxx`
- `?path=adminMe&lineUserId=Uxxxx`

POST placeholder:

- `POST ?path=placeholder` with JSON body returns `ok: true`
- `POST ?path=saveSection` autosaves section and may trigger LINE progress push
- `POST ?path=adminLogin` validates Google ID token and Admins allowlist
- `POST ?path=adminListRequests` requires `lineUserId` + `googleIdToken`
- `POST ?path=adminGetRequest` requires `lineUserId` + `googleIdToken` + `requestId`

## Hardening notes (Step 12)

- JSON body parsing is strict; malformed payload returns `BAD_JSON`.
- Customer `saveSection` has lightweight rate limit and `MAINTENANCE_MODE` gate.
- Text inputs are normalized and capped; truncation is logged as `inputTruncated`.
- Admin auth checks are enforced on every admin data endpoint (`token + allowlist`).
- Google token verification uses short cache (5 minutes) by token hash (never logs raw token).
- AuditLog metadata is standardized and size-capped.

## CORS note

The backend includes CORS policy metadata in every JSON response and an `OPTIONS`
handler function. In GAS web apps, custom response headers are platform-limited,
so keep frontend requests simple (`GET`/`POST`, standard JSON body).
