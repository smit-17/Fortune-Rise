# Login, User Management, Permissions & Safe Data Reset

## What exists today

- No login at all: anyone with the link can open and edit everything.
- All business data (sales, purchases, expenses, bank, cash, plus the settings and the
  "users" list) is stored together as **one shared record** in the database.
- The "Users" list in Settings is decorative — those users have no passwords and cannot log in.
- "Reset to starting dataset" replaces that whole record, so it also wipes settings and the users list.

## What will be built

### 1. Real accounts and login
- A proper login screen (email + password). Only signed-in people reach the app.
- Accounts, roles and per-page permissions move into real database tables, separate from
  the accounting record — so resetting data can never touch them.
- Roles: Super Admin, Owner, Admin, Manager, Staff, Viewer.
- Super Admin seeded for **lepdogroup@gmail.com** with a password set securely on the server
  (never in the app code), forced to change on first login.
- Inactive accounts are refused at login and their live sessions are ended.
- Wrong email or wrong password both show the same message: "Invalid email or password."
- Logout clears the session and going "back" cannot re-open a page.

### 2. Settings → User Management (one place)
Creating a person and giving them access happens in a single form:
name, email, password + confirm, role, session timeout, active/inactive, page permissions.
Also: edit, activate/deactivate, change role, reset password, see last login.
Passwords are only ever stored hashed by the auth service; the app never sees or shows them.

### 3. Who can see Settings
- Super Admin: everything, including data reset.
- Owner: sees the Settings tab; inside it, only what their permissions allow.
- Everyone else: no Settings unless a permission is explicitly granted.
- Menu items hide by permission, and every protected action is re-checked in the database,
  so typing a URL or calling an endpoint directly does not bypass it.

### 4. Session timeout
Chosen per person (15 min, 30 min, 1 h, 2 h, 4 h, or system default) and actually enforced:
after that much inactivity the session ends in every open tab and the login page shows
"Your session has expired. Please log in again."

### 5. Reset to starting dataset (fixed)
- Clears only accounting/business records: invoices, bills, payments, expenses, bank and
  cash entries, uchhina, drawings, capital, stock, team, goals, ledger entries.
- Keeps: accounts, passwords, roles, permissions, session settings, business profile,
  branding, invoice settings, master data, accounting rules — everything in Settings.
- Requires typing `RESET` to confirm, runs as one atomic operation on the server, needs the
  "reset data" permission, is written to the audit log, then reloads the dashboards.

### 6. Audit log
Logins (success and failure), logout, session expiry, user created/updated/deactivated,
role or permission changes, password resets, settings changes and data resets — with who,
what, when and the result. Never any password.

## Technical notes

- Auth: Supabase Auth email/password, signed in from the browser with the publishable key,
  so it keeps working on your Vercel deployment.
- New tables: `profiles` (name, email, status, session timeout, must_change_password,
  last_login), `user_roles` (enum `app_role`), `role_permissions`, `user_permissions`
  (per-user overrides), `security_audit_log`. All with GRANTs, RLS and a
  security-definer `has_role()` / `has_permission()` helper used by every policy.
- The shared `workspace` row's RLS changes from anonymous to authenticated-only, gated by
  permissions; readers need Accounting→View, writers need add/edit.
- Privileged operations that need service-role rights (create user with password, reset a
  password, force sign-out, dataset reset) run in a Supabase edge function that verifies the
  caller's token and permissions server-side — this is the only way to keep them working
  from Vercel, where server secrets are not available to the frontend host.
- Dataset reset is a security-definer SQL function that rewrites the workspace record keeping
  the `settings` section untouched, in one transaction.
- Frontend: `_authenticated` route gate, permission-aware sidebar and action buttons, idle
  timer synchronised across tabs, `/unauthorized` page, login and change-password pages.
- Existing accounting data is preserved. The decorative Settings users list is migrated into
  real accounts where an email exists (they get an invite/temporary password), then removed.

## Order of work

1. Database: roles, profiles, permissions, audit log, RLS, reset function.
2. Edge function for privileged admin actions + Super Admin seed.
3. Login, logout, session timeout, route gates.
4. Settings → User Management UI, permission-aware navigation.
5. Wire the reset button to the new safe reset.
6. Test each role, inactive user, timeout, direct-URL and direct-API attempts, and verify
   after reset that users/roles/settings survive and login still works.
