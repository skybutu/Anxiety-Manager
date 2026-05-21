# AnxietyFlow — Supabase Dashboard Manual Review Checklist

Use this checklist after deployments, privacy changes, or on a periodic basis.
All items must be verified manually in the Supabase Dashboard.
Mark each item **Pass**, **Fail**, or **N/A** during review.

---

## Local Code State (confirmed clean as of 2026-05-21)

| Item | Status |
|------|--------|
| `userName`/identity in Gemini context | ✅ Removed |
| Console logs in edge function | ✅ None |
| AI key exposure | ✅ `Deno.env.get("AI_API_KEY")` only — never logged or echoed |
| Error responses echo request body | ✅ No — generic messages only |
| JWT verification | ✅ `verify_jwt = true` in config.toml |
| Supabase anon key type | ✅ `sb_publishable_` — public/safe |
| Service role key in frontend | ✅ Not present |
| Supabase Storage usage | ✅ Not used |
| Direct table reads/writes | ✅ None — data from workbook.json only |
| Auth tokens in localStorage | ✅ Not stored manually |
| Console logs leaking user data | ✅ None |

---

## 1. Edge Function Logs

**Path:** Supabase Dashboard → Edge Functions → `anxiety-copilot` → Logs

> **Context:** The local `index.ts` has zero console calls and generic error messages.
> Supabase retains platform-level invocation logs automatically — verify content here.

| # | Check | Pass / Fail / N/A |
|---|-------|-------------------|
| 1.1 | Full chat message text does **not** appear in logs | |
| 1.2 | Request bodies are **not** stored or displayed | |
| 1.3 | User emails or profile names do **not** appear in logs | |
| 1.4 | API keys or Bearer tokens do **not** appear in logs | |
| 1.5 | Gemini AI responses are **not** stored in logs | |
| 1.6 | Error entries show only status codes and generic messages | |
| 1.7 | Log retention period is acceptable (default: ~1 hour — verify in dashboard) | |
| 1.8 | If sensitive content appears in logs: disable verbose logging in Supabase project settings | |

---

## 2. Edge Function Secrets

**Path:** Supabase Dashboard → Project Settings → Secrets

> **Context:** The Gemini/AI key must exist only as a Supabase Secret and never in frontend code or Git.

| # | Check | Pass / Fail / N/A |
|---|-------|-------------------|
| 2.1 | `AI_API_KEY` is listed in Supabase Secrets | |
| 2.2 | The key value is **not** visible in any frontend file (`app.js`, `chat.js`, `index.html`) | |
| 2.3 | Key value is **not** in Git history — run: `git log --all -S "AI_API_KEY"` locally | |
| 2.4 | Supabase `service_role` key is **not** present in any frontend file | |
| 2.5 | No `.env` file with real secret values is committed to Git | |
| 2.6 | Anon key in `app.js` starts with `sb_publishable_` (public/safe — this is correct) | |

---

## 3. RLS Policies

**Path:** Supabase Dashboard → Database → Tables → Policies

> **Context:** AnxietyFlow has no `supabase.from()` calls — all app data is from `workbook.json`.
> The only tables are Supabase-managed auth tables. Still, verify RLS state on every table present.

| # | Check | Pass / Fail / N/A |
|---|-------|-------------------|
| 3.1 | List all tables present in the project | |
| 3.2 | Each table is identified as public educational data OR private user data | |
| 3.3 | Every table holding private user data has RLS enabled (toggle = "RLS enabled") | |
| 3.4 | No policy allows `anon` role to SELECT private user rows | |
| 3.5 | If `profiles` or custom user table exists: auth user can only SELECT their own row (`auth.uid() = user_id`) | |
| 3.6 | If `profiles` or custom user table exists: auth user can only INSERT/UPDATE/DELETE their own row | |
| 3.7 | No broad `public INSERT/UPDATE/DELETE` without row-scoped `WHERE auth.uid() = ...` condition | |
| 3.8 | `service_role` is **not** used in any frontend code (it bypasses RLS) | |
| 3.9 | Public/educational tables (if any) are read-only for all roles | |

---

## 4. Auth / OAuth Settings

**Path A:** Supabase Dashboard → Authentication → URL Configuration

> **Context:** Redirect URLs must be tightly scoped to prevent open redirect attacks.

| # | Check | Pass / Fail / N/A |
|---|-------|-------------------|
| 4.1 | Site URL is set correctly (production URL or current host) | |
| 4.2 | Redirect URLs allowlist contains only your own domains | |
| 4.3 | No wildcard redirect (`https://*` or `http://*`) in the allowlist | |
| 4.4 | `http://localhost:3000` or local IP is present only for dev (acceptable) | |
| 4.5 | No unexpected third-party domains in the redirect allowlist | |

**Path B:** Supabase Dashboard → Authentication → Providers

| # | Check | Pass / Fail / N/A |
|---|-------|-------------------|
| 4.6 | Only Email and Google providers are enabled | |
| 4.7 | No unexpected providers are enabled (GitHub, Discord, Twitter, etc.) | |
| 4.8 | Google OAuth Additional Scopes requests only `email` and `profile` (standard) | |
| 4.9 | Google OAuth Client ID and Secret are present and not expired | |

---

## 5. Supabase Storage

**Path:** Supabase Dashboard → Storage

> **Context:** Storage is not used in the current implementation.

| # | Check | Pass / Fail / N/A |
|---|-------|-------------------|
| 5.1 | No storage buckets exist, OR all buckets are intentional | |
| 5.2 | No bucket is set to **public** unless it holds only intended public assets | |
| 5.3 | If any bucket exists: policies restrict access to the row owner (`auth.uid()`) | |

---

## 6. Privacy Policy Consistency

**Path:** Live site → Settings → Privacy Policy

> **Context:** Verify the deployed site reflects all privacy changes from the 2026 hardening passes.

| # | Check | Pass / Fail / N/A |
|---|-------|-------------------|
| 6.1 | Privacy Policy states chat messages may be sent to an external AI provider (Google Gemini) | |
| 6.2 | Privacy Policy warns users not to enter sensitive personal or medical information in chat | |
| 6.3 | Privacy Policy states personal identity data (name and email) is **not** included in content sent to the AI provider | |
| 6.4 | Privacy Policy is marked "Draft — not attorney-reviewed. Subject to change." | |
| 6.5 | Site does **not** claim HIPAA compliance | |
| 6.6 | Site does **not** claim GDPR compliance | |
| 6.7 | Site does **not** claim Israeli privacy law compliance | |
| 6.8 | Contact email (`skybutuguy@gmail.com`) is visible in Privacy Policy section 8 | |

---

## Review Log

| Date | Reviewer | Areas Checked | Findings | Action Taken |
|------|----------|---------------|----------|--------------|
| | | | | |
| | | | | |

---

*Last generated: 2026-05-21. Re-run this checklist after any Supabase config change, edge function deployment, or auth/OAuth modification.*
