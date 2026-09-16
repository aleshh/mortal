# Mortal

A minimal, mobile-first task manager built with React, TypeScript, Vite, and Supabase. White background, persistent context pills, no sidebar. No notes, status categories, due dates, or priority scores.

## Run locally

```sh
pnpm install
pnpm dev
```

Open the URL Vite prints (normally http://localhost:5173). Without Supabase environment variables, the app opens a clearly labeled **local demo**, with sample tasks and changes saved to this browser's local storage. Demo data is separate from account data, and is not uploaded on sign-in. Export it from **Settings (⋯) → Export data**.

```sh
pnpm build       # Type-check and produce dist/
pnpm test        # GTD domain regression tests
pnpm preview     # Serve the production build locally
```

## Connect real accounts

1. Create a Supabase project and run `supabase/schema.sql` once in its SQL Editor.
2. Copy `.env.example` to `.env.local`. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from the project's API settings. A legacy anon key also works. Never use a service-role or secret key in the browser.
3. Enable the email/password provider and **Confirm email** in Supabase Auth. Set the minimum password length to at least 8.
4. Set Auth's Site URL to your deployed app URL. Add your local development URL and deployed URL to the redirect allowlist.
5. Configure your SMTP provider for real users, including sender verification. Supabase's default email service has delivery restrictions and is suitable only for initial testing.
6. Restart `pnpm dev` after changing environment variables. Create an account, follow the email verification link, and sign in. Account workspaces start empty.

Implemented auth flows: sign up, email verification, resend verification, login, persistent session, sign out, forgotten password, and password recovery. Supabase's verified-email checks and per-user row-level security protect account workspaces. The private verification helper only checks the current caller, and does not expose user records.

Reference: [Supabase password auth](https://supabase.com/docs/guides/auth/passwords), [redirect allowlist](https://supabase.com/docs/guides/auth/redirect-urls), [custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp).

## Navigation and tasks

- The sticky top navigation is **All → Projects → context pills**. Contexts wrap on narrow screens, so they stay visible without horizontal scrolling.
- All shows every incomplete actionable task. There are no Inbox, Next actions, Waiting for, or Someday categories.
- New tasks, projects, and subtasks appear at the top of their lists. Editing preserves their position.
- List rows show only the title and controls; contexts and parent project are in task details.
- Task details show creation and completion timestamps. Reopening clears the completion timestamp; completing again records the new time. Older completed tasks with no recorded completion timestamp show “Not recorded” instead of an invented date.
- Add tasks directly in the current list. On a context page they inherit that context; on a project page they become subtasks. In Projects the add field creates a project.
- Tap a task title or its ⋯ button to edit it. Projects open to their subtasks; use their ⋯ button or page settings icon to edit details.
- Tasks can have zero or more contexts. Contexts have automatically assigned, editable colors and optional emoji. Edit or reorder them from Settings (⋯); their saved order controls the persistent header pills.
- A task can be promoted to a project in its editor. Promoting a subtask makes it a top-level project. Projects are one level deep in the UI.
- Projects with incomplete subtasks appear only in Projects. Their subtasks appear in All and their own context pages.
- When all subtasks are complete, the project appears in All, its contexts, and Projects. Complete the parent explicitly.
- Reopening a subtask or adding one to a completed project reopens the parent.
- New subtasks initially inherit their project's contexts; they remain independently editable.
- Completed tasks disappear by default. **Show completed** reveals them for reopening.
- Completion and deletion can be undone until the next successful change. Deleting a project deletes its subtasks after confirmation. Deleting a context preserves its tasks.
- Search is behind the magnifying glass. Account controls, context editing, installation instructions, and JSON export are under the top-right ⋯ menu.
- Keyboard shortcuts: `N` to focus quick add, `/` to open search.

Existing demo and account workspaces are normalized on load. Their tasks, completions, projects, and contexts are preserved. Obsolete notes and status fields are discarded on the next save; tasks from every old category now appear in All according to the same project rules.

## iPhone home screen

The app includes a standalone web-app manifest, 180px Apple touch icon, 192px and 512px install icons, white status-bar/theme colors, and safe-area layout. It uses system fonts, wrapping navigation, and 16px form inputs to avoid iPhone input zoom.

1. Deploy `dist/` at the root of an HTTPS site (see Deploy below).
2. Open that URL in Safari on the iPhone.
3. Tap **Share → Add to Home Screen**. Keep **Open as Web App** enabled if shown, then tap **Add**.
4. Launch Mortal from the new icon. Account data requires signing in; do not assume Safari's local demo data is shared with the installed app.

No service worker or offline account support is included; installation does not imply offline availability. For development on the same Wi-Fi, use Vite's Network URL to inspect the UI on your phone. `localhost` on the phone refers to the phone, not your Mac. Use a deployed HTTPS URL for the installed app.

Reference: [Apple's home-screen instructions](https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios), [WebKit standalone manifests and icons](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).

## Persistence and scope

The local demo stores a workspace in localStorage. Accounts store one JSON workspace per user in Supabase. Saves are explicit and guarded by a revision check: a stale tab reloads the latest workspace and asks you to retry rather than overwriting another tab's changes. Network/save errors preserve the editor for retry. Other devices see saved changes when loading/reloading; this version does not have live subscriptions, offline account edits, or collaboration. This compact storage model is suitable for personal workspaces; normalize task rows before adding large-scale collaboration.

This repository includes the schema and auth integration, but no Supabase project has been provisioned or configured by this build. Auth delivery and database policies require live integration verification after setup.

## Manual verification

No browser testing was performed, per workspace instructions.

1. Start the app, add a task, assign multiple contexts, and reload to check persistence.
2. Open each context and verify the task appears. Remove all contexts and check it still appears in All.
3. Promote a task to a project, open it from Projects, and add two steps. Check the parent disappears from Home and context lists while its steps remain.
4. Complete both steps. Check the parent returns to Home and its contexts and remains in Projects.
5. Complete the parent, enable Show completed, and reopen one of its steps from its project page. Check the parent reopens and stays out of Home while the step is incomplete.
6. Edit a context's name, emoji, and color. Delete a context and confirm its tasks remain. Delete a project and use Undo to restore it and its steps.
7. At 320px and 390px widths, verify the navigation pills wrap and remain visible while scrolling. Check long task titles, search, editors with the keyboard open, and tap targets. Verify no notes or category selectors appear. Install via Safari and check the icon, standalone launch, and safe areas.
8. With Supabase configured: test signup, verification/resend, login/logout, password reset, and saved data after refresh. Use two accounts to confirm each sees only its own workspace. Attempt a direct API read/update of the other account's user_id with the first account's token and confirm it fails or returns no rows.
9. Open the same account in two tabs. Save in one, then try a stale change in the other; expect a conflict message and fresh data, never a silent overwrite.

## Deploy

Build with `pnpm build` and serve `dist/` on a static host. Set the two public environment variables at build time, configure HTTPS, and add the final URL to Supabase Auth settings. All views and auth callbacks use the root URL; no server-side app runtime is required.
