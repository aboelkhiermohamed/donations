# Production Deployment Guide - Donation Platform

This guide outlines the step-by-step process for deploying the Donation Platform with automatic SMS verification to production.

---

## 1. Supabase Setup

### Database Configuration
1. Go to the [Supabase Dashboard](https://supabase.com) and create a new project.
2. Navigate to the **SQL Editor** in your Supabase project.
3. Copy the contents of the database migration file: [init.sql](file:///e:/my%20test%20space/Donationsite/supabase/migrations/20260624000000_init.sql) and run it to create tables, triggers, indexes, and RLS policies.
4. Run the seed data from: [seed.sql](file:///e:/my%20test%20space/Donationsite/supabase/seed.sql) to add the default campaign and mock data.

### Storage Configuration
1. Navigate to **Storage** in the Supabase Sidebar.
2. Create a new Bucket named `receipts`.
3. Set the bucket privacy to **Public** (or create a Custom Storage policy allowing public reads but restricted writes).
4. Create an RLS policy for the `receipts` bucket:
   - **Insert policy**: Allow anyone (authenticated or anonymous) to insert.
   - **Select policy**: Allow anyone to read.

### Realtime Enablement
The migration script automatically registers the required tables in the `supabase_realtime` publication. Verify this by going to **Database** -> **Replication** -> **Publications** (`supabase_realtime`) and checking that `campaigns`, `donations`, and `incoming_transactions` are checked.

### Admin User Creation
1. Go to **Authentication** -> **Users** and click **Add User** -> **Create User** (using email/password).
2. Note down the generated User `UUID`.
3. Go to the **SQL Editor** and run the query to make this user an admin:
   ```sql
   INSERT INTO admins (id, name, email, role)
   VALUES ('<user-uuid>', 'Admin Name', 'admin@email.com', 'superadmin');
   ```

---

## 2. Environment Variables Checklist

Set these variables in your Vercel Dashboard (Settings -> Environment Variables) and local `.env.local` files:

| Variable Name | Description | Source |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL | Settings -> API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anonymous key | Settings -> API |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (Secret!) | Settings -> API (Decrypt) |
| `SMS_GATEWAY_API_KEY` | Random secret key for webhook authentication | Generate securely |

> [!CAUTION]
> Never commit `SUPABASE_SERVICE_ROLE_KEY` or `SMS_GATEWAY_API_KEY` to public Git repositories. Use Vercel's secure environment variable vault.

---

## 3. Vercel Deployment

1. Initialize a Git repository in your workspace and push it to GitHub, GitLab, or Bitbucket.
2. Log in to the [Vercel Dashboard](https://vercel.com) and click **Add New** -> **Project**.
3. Import your donation platform repository.
4. Configure the Build settings (Vercel automatically detects Next.js configurations).
5. Add the **Environment Variables** listed in Section 2.
6. Click **Deploy**. Vercel will build and launch your App Router serverless container.

---

## 4. Production Checklist

- [ ] **SMS Gateway Connection:** Verify that the Android Tasker/MacroDroid script points to the correct production domain `/api/sms` and has the matching `x-api-key`.
- [ ] **RTL Support:** Double-check that translations and RTL layout shifts work on mobile Chrome, Safari, and desktop browsers.
- [ ] **Supabase Storage:** Verify receipt screenshots upload and render correctly.
- [ ] **QR Code Verification:** Verify that the dynamic InstaPay QR code generator accurately handles amounts and account addresses.
- [ ] **Realtime Metrics:** Check that submitting a donation instantly increases the "pending" counters in the admin dashboard without reloading.

---

## 5. Security Checklist

- [ ] **Disable Public Signups:** Go to Supabase **Authentication** -> **Providers** -> **Email** and turn off "Confirm email" and "Allow signup" to prevent arbitrary users from registering accounts. All admin credentials should be created manually via the dashboard or SQL Editor.
- [ ] **SSL Configuration:** Ensure Vercel forces HTTP-to-HTTPS redirects.
- [ ] **CORS Configuration:** Restrict Supabase API requests to your domain under Settings -> API -> Allowed Origins.
- [ ] **Rate Limiting:** Set up Cloudflare or Vercel firewall rules to rate-limit the `/api/sms` endpoint to prevent brute-force API requests.

---

## 6. Backup Strategy

1. **Supabase Database Backups:**
   - Free tier projects have manual backups, while Pro tier project databases are backed up automatically daily with Point-in-Time Recovery (PITR).
   - Recommended: Schedule a weekly database export using `pg_dump` via a GitHub action or a custom CRON worker pointing to your Supabase connection string.
2. **Storage Receipts Backups:**
   - Supabase storage files are saved in AWS S3 (or similar cloud infrastructure).
   - Ensure you keep local copies of transaction receipts or set up a script that pulls new files daily from the `receipts` bucket to backup storage.

---

## 7. Monitoring Recommendations

- **Sentry Integration:** Add Sentry to your Next.js application to track runtime client-side or serverless webhook parsing errors.
- **Logtail or Vercel Logs:** Inspect serverless function execution times and HTTP codes for `/api/sms` to verify Android gateway response latencies.
- **Supabase Performance Advisor:** Use the built-in database advisor under Database -> Advisors to verify index utilization and optimize queries.
