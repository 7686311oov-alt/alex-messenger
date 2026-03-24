# Edge Functions for Alex Admin

Functions:

- `admin_create_user`
- `admin_set_role`
- `admin_update_username`
- `admin_reset_password`
- `admin_delete_user`

## Required Supabase secrets

Set in project secrets:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`
- `AUTH_EMAIL_DOMAIN` (optional, default: `alex.local`)

## Deploy

```bash
supabase db push
supabase functions deploy admin_create_user
supabase functions deploy admin_set_role
supabase functions deploy admin_update_username
supabase functions deploy admin_reset_password
supabase functions deploy admin_delete_user
```

## Notes

- Functions require a valid JWT in `Authorization: Bearer <token>`.
- Caller must have `profiles.is_admin = true`.
- Optional audit log writes to `audit_logs` if table exists.

## Migration included

Apply migration before deploy:

- `supabase/migrations/20260323_auth_profiles_audit.sql`
