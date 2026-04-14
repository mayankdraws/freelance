# freelance

Lightweight workflow MVP for project-based file review and approval.

## What is implemented

- Project-based workspaces
- File-first review surface (image upload + centered canvas)
- Contextual comments (click image to pin and add comment)
- Structured feedback flow:
  - Draft → Review → Approved
  - Request changes with required prompt: "What should change?"
- Approval lock (approved projects become read-only)
- Timeline/history of activity events
- Proof of approval (timestamp + approved version)
- Public no-login share links (`?share=<token>`) in view-only mode
- Feedback reminders for stale reviews

## Run locally

Because this is a static app, run any simple web server from repository root:

```bash
cd path/to/freelance
python3 -m http.server 8080
```

Then open:

- `http://localhost:8080/` for editor mode
- generated share links for view-only mode

## Notes

- Data is persisted in browser `localStorage`.
- This MVP is intentionally minimal and frontend-only.
