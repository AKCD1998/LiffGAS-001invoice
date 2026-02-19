# SC Group LIFF + GAS Invoice Request (Skeleton)

This repository contains a LIFF frontend and Google Apps Script backend skeleton.

## Step 1 scope

- Basic frontend project structure
- LIFF landing page with Thai buttons:
  - `เป็นลูกค้า`
  - `เป็นผู้ดูแลระบบ`
- Hash routing for landing/customer/admin screens
- LINE Login + `lineUserId` retrieval stub

## Local run (frontend)

```powershell
cd frontend
python -m http.server 5173
```

Then open:

`http://localhost:5173`

## Configuration

Edit `frontend/src/config.js`:

- `LIFF_ID`: your LIFF ID
- `GAS_BASE_URL`: your GAS web app URL
- `DEV_LINE_USER_ID`: local fallback user ID for development only
