-- ===============================================================
-- DATABASE REBUILD SCRIPT (UUID-Ready for Supabase)
-- - Tables (UUID PKs)
-- - RLS + helper role functions
-- - Triggers to sync auth.users -> public."Users"
-- - Activity logging
-- - Dashboard views (SECURITY INVOKER)
-- ===============================================================

-- 0) Extensions (needed for gen_random_uuid)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1) DROP existing objects if present (CAREFUL: destructive)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS after_user_created_assign_role ON public."Users";

DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.user_has_role(text, text, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.is_admin() CASCADE;
DROP FUNCTION IF EXISTS public.assign_default_role() CASCADE;

-- Drop tables (order not important here because of CASCADE)
DROP TABLE IF EXISTS public."AnnouncementScopes" CASCADE;
DROP TABLE IF EXISTS public."AnnouncementScopes" CASCADE;
DROP TABLE IF EXISTS public."Announcements" CASCADE;
DROP TABLE IF EXISTS public."VisitorPasses" CASCADE;
DROP TABLE IF EXISTS public."MoveOutRequests" CASCADE;
DROP TABLE IF EXISTS public."MaintenanceRequests" CASCADE;
DROP TABLE IF EXISTS public."TenantVerification" CASCADE;
DROP TABLE IF EXISTS public."LandlordVerification" CASCADE;
DROP TABLE IF EXISTS public."Messages" CASCADE;
DROP TABLE IF EXISTS public."Notifications" CASCADE;
DROP TABLE IF EXISTS public."Receipts" CASCADE;
DROP TABLE IF EXISTS public."Payments" CASCADE;
DROP TABLE IF EXISTS public."Units" CASCADE;
DROP TABLE IF EXISTS public."Properties" CASCADE;
DROP TABLE IF EXISTS public."UserPropertyRoles" CASCADE;
DROP TABLE IF EXISTS public."UserRoles" CASCADE;
DROP TABLE IF EXISTS public."ActivityLogs" CASCADE;
DROP TABLE IF EXISTS public."Users" CASCADE;

-- ===============================================================
-- 2) CREATE CORE TABLES (ordered so FK targets exist beforehand)
-- ===============================================================

-- Users table (profiles synced from auth.users)
CREATE TABLE public."Users" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name varchar,
  phone varchar,
  email varchar UNIQUE,
  created_at timestamp without time zone DEFAULT now()
);

-- Activity logs (referencing Users)
CREATE TABLE public."ActivityLogs" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public."Users"(id),
  action varchar,
  entity varchar,
  details text,
  created_at timestamp without time zone DEFAULT now()
);

-- Properties & Units (Properties references Users.owner_id)
CREATE TABLE public."Properties" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid REFERENCES public."Users"(id) ON DELETE SET NULL,
  property_code varchar,
  name varchar,
  address varchar,
  type varchar,
  receipt_serial_counter integer DEFAULT 0,
  logo_url varchar
);

CREATE TABLE public."Units" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid REFERENCES public."Properties"(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES public."Users"(id) ON DELETE SET NULL,
  unit_name varchar,
  type varchar,
  invite_link varchar,
  status varchar
);

-- Roles tables
CREATE TABLE public."UserRoles" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public."Users"(id) ON DELETE CASCADE,
  role varchar NOT NULL,           -- e.g. admin, landlord, tenant, maintenance, accountant
  scope varchar,                   -- optional: 'property' or 'unit'
  scope_id uuid,                   -- optional scope id
  status varchar DEFAULT 'active',
  created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE public."UserPropertyRoles" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public."Users"(id) ON DELETE CASCADE,
  property_id uuid REFERENCES public."Properties"(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES public."Units"(id) ON DELETE CASCADE,
  role varchar,
  status varchar
);

-- Payments & Receipts
CREATE TABLE public."Payments" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public."Users"(id),
  property_id uuid REFERENCES public."Properties"(id),
  amount numeric,
  reference varchar,
  payment_method varchar,
  status varchar,
  paid_at timestamp without time zone DEFAULT now()
);

CREATE TABLE public."Receipts" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public."Users"(id),
  property_id uuid REFERENCES public."Properties"(id),
  amount numeric,
  period varchar,
  receipt_no varchar,
  approved_by uuid REFERENCES public."Users"(id),
  approved_at timestamp without time zone,
  receipt_pdf_url varchar,
  status varchar
);

-- Announcements & scopes
CREATE TABLE public."Announcements" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid REFERENCES public."Properties"(id),
  created_by uuid REFERENCES public."Users"(id),
  body text,
  created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE public."AnnouncementScopes" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid REFERENCES public."Announcements"(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES public."Units"(id) ON DELETE CASCADE
);

-- Verifications
CREATE TABLE public."LandlordVerification" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public."Users"(id),
  id_type varchar,
  id_number varchar,
  id_document_url varchar,
  ownership_proof_url varchar,
  stamp_url varchar,
  signature_url varchar,
  status varchar,
  verified_at timestamp without time zone
);

CREATE TABLE public."TenantVerification" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public."Users"(id),
  property_id uuid REFERENCES public."Properties"(id),
  id_type varchar,
  id_number varchar,
  id_document_url varchar,
  passport_photo_url varchar,
  emergency_contact_name varchar,
  emergency_contact_relationship varchar,
  emergency_contact_phone varchar,
  occupation varchar,
  status varchar,
  verified_at timestamp without time zone
);

-- Maintenance, MoveOut, Messages, Notifications, VisitorPasses
CREATE TABLE public."MaintenanceRequests" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public."Users"(id),
  property_id uuid REFERENCES public."Properties"(id),
  title varchar,
  description text,
  urgency varchar,
  status varchar,
  created_at timestamp without time zone DEFAULT now(),
  resolved_at timestamp without time zone
);

CREATE TABLE public."MoveOutRequests" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public."Users"(id),
  unit_id uuid REFERENCES public."Units"(id),
  property_id uuid REFERENCES public."Properties"(id),
  requested_by varchar,
  reason text,
  proposed_date date,
  status varchar,
  tenant_response varchar,
  created_at timestamp without time zone DEFAULT now(),
  resolved_at timestamp without time zone
);

CREATE TABLE public."Messages" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid REFERENCES public."Users"(id),
  receiver_id uuid REFERENCES public."Users"(id),
  message_body text,
  status varchar DEFAULT 'sent',
  created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE public."Notifications" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public."Users"(id),
  title varchar,
  body text,
  is_read boolean DEFAULT false,
  created_at timestamp without time zone DEFAULT now(),
  event_type varchar,
  reference_id uuid
);

CREATE TABLE public."VisitorPasses" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public."Users"(id),
  property_id uuid REFERENCES public."Properties"(id),
  visitor_name varchar,
  valid_on date,
  status varchar,
  qr_sig varchar,
  created_at timestamp without time zone DEFAULT now(),
  expires_at timestamp without time zone
);

-- ===============================================================
-- 3) SECURITY HELPERS (role-check functions)
-- ===============================================================
-- user_has_role(role, scope, scope_id) -> boolean
CREATE OR REPLACE FUNCTION public.user_has_role(
  _role text,
  _scope text DEFAULT NULL,
  _scope_id uuid DEFAULT NULL
) RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public."UserRoles" ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = _role
      AND ur.status = 'active'
      AND (_scope IS NULL OR ur.scope = _scope)
      AND (_scope_id IS NULL OR ur.scope_id = _scope_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_has_role('admin', NULL, NULL);
$$;

-- ===============================================================
-- 4) TRIGGERS: Sync auth.users -> public."Users", dynamic role assign
-- ===============================================================
-- handle_new_user: creates profile, assigns role from signup metadata (role) with default 'tenant'
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_full_name TEXT;
  v_phone TEXT;
  v_role TEXT;
BEGIN
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', '');
  v_phone := COALESCE(NEW.raw_user_meta_data->>'phone', '');
  v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'tenant');

  -- insert profile (if not exists)
  INSERT INTO public."Users"(id, email, full_name, phone, created_at)
  VALUES (NEW.id, NEW.email, v_full_name, v_phone, now())
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email
    -- keep existing full_name if it's non-empty; else update
    , full_name = COALESCE(NULLIF(EXCLUDED.full_name, ''), public."Users".full_name)
    -- keep existing phone if it's non-empty; else update
    , phone = COALESCE(NULLIF(EXCLUDED.phone, ''), public."Users".phone);

  -- create role entry if none exists
  INSERT INTO public."UserRoles"(user_id, role, status, created_at)
  VALUES (NEW.id, v_role, 'active', now())
  ON CONFLICT DO NOTHING;

  -- log signup
  INSERT INTO public."ActivityLogs"(user_id, action, entity, details, created_at)
  VALUES (NEW.id, 'SIGNUP', 'Users', concat('signup role=', v_role, ', phone=', v_phone), now());

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- log error details (avoid throwing)
  INSERT INTO public."ActivityLogs"(action, entity, details, created_at)
  VALUES ('SIGNUP_TRIGGER_ERROR', 'Users', SQLERRM, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- attach trigger to auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();

-- ===============================================================
-- 5) RLS: Enable and sensible base policies
-- Note: adjust/extend each policy as you need per business rules.
-- ===============================================================

-- Enable RLS on tables where row-level safety matters
ALTER TABLE public."Users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."UserRoles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."UserPropertyRoles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Receipts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."MaintenanceRequests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Announcements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."AnnouncementScopes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."TenantVerification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."LandlordVerification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Units" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Properties" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."VisitorPasses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."MoveOutRequests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ActivityLogs" ENABLE ROW LEVEL SECURITY;

-- USERS policies
DROP POLICY IF EXISTS users_select_self ON public."Users";
CREATE POLICY users_select_self
  ON public."Users" FOR SELECT
  USING ( auth.uid() = id OR public.is_admin() );

DROP POLICY IF EXISTS users_update_self ON public."Users";
CREATE POLICY users_update_self
  ON public."Users" FOR UPDATE
  USING ( auth.uid() = id OR public.is_admin() )
  WITH CHECK ( auth.uid() = id OR public.is_admin() );

-- USERROLES: admins can view, users can view their own roles
DROP POLICY IF EXISTS userroles_select ON public."UserRoles";
CREATE POLICY userroles_select
  ON public."UserRoles" FOR SELECT
  USING ( auth.uid() = user_id OR public.is_admin() );

DROP POLICY IF EXISTS userroles_insert ON public."UserRoles";
CREATE POLICY userroles_insert
  ON public."UserRoles" FOR INSERT
  WITH CHECK ( auth.uid() = user_id OR public.is_admin() );

-- USERPROPERTYROLES
DROP POLICY IF EXISTS upr_select ON public."UserPropertyRoles";
CREATE POLICY upr_select
  ON public."UserPropertyRoles" FOR SELECT
  USING (
    public.is_admin()
    OR user_id = auth.uid()
    OR public.user_has_role('landlord','property',property_id)
  );

-- RECEIPTS: tenants can see their receipts, landlords can view receipts for their properties, admins all
DROP POLICY IF EXISTS receipts_select ON public."Receipts";
CREATE POLICY receipts_select
  ON public."Receipts" FOR SELECT
  USING (
    public.is_admin()
    OR tenant_id = auth.uid()
    OR public.user_has_role('landlord','property',property_id)
  );

DROP POLICY IF EXISTS receipts_insert ON public."Receipts";
CREATE POLICY receipts_insert
  ON public."Receipts" FOR INSERT
  WITH CHECK (
    tenant_id = auth.uid() OR public.is_admin()
  );

-- PAYMENTS
DROP POLICY IF EXISTS payments_select ON public."Payments";
CREATE POLICY payments_select
  ON public."Payments" FOR SELECT
  USING (
    public.is_admin()
    OR tenant_id = auth.uid()
    OR public.user_has_role('landlord','property',property_id)
  );

DROP POLICY IF EXISTS payments_insert ON public."Payments";
CREATE POLICY payments_insert
  ON public."Payments" FOR INSERT
  WITH CHECK ( tenant_id = auth.uid() OR public.is_admin() );

-- MAINTENANCE REQUESTS
DROP POLICY IF EXISTS maintenance_select ON public."MaintenanceRequests";
CREATE POLICY maintenance_select
  ON public."MaintenanceRequests" FOR SELECT
  USING (
    public.is_admin()
    OR tenant_id = auth.uid()
    OR public.user_has_role('landlord','property',property_id)
    OR public.user_has_role('maintenance',NULL,NULL)
  );

DROP POLICY IF EXISTS maintenance_insert ON public."MaintenanceRequests";
CREATE POLICY maintenance_insert
  ON public."MaintenanceRequests" FOR INSERT
  WITH CHECK ( tenant_id = auth.uid() OR public.user_has_role('maintenance',NULL,NULL) OR public.is_admin() );

DROP POLICY IF EXISTS maintenance_update ON public."MaintenanceRequests";
CREATE POLICY maintenance_update
  ON public."MaintenanceRequests" FOR UPDATE
  USING ( public.is_admin() OR public.user_has_role('maintenance',NULL,NULL) )
  WITH CHECK ( public.is_admin() OR public.user_has_role('maintenance',NULL,NULL) );

-- MESSAGES
DROP POLICY IF EXISTS messages_select ON public."Messages";
CREATE POLICY messages_select
  ON public."Messages" FOR SELECT
  USING (
    public.is_admin()
    OR sender_id = auth.uid()
    OR receiver_id = auth.uid()
  );

DROP POLICY IF EXISTS messages_insert ON public."Messages";
CREATE POLICY messages_insert
  ON public."Messages" FOR INSERT
  WITH CHECK ( sender_id = auth.uid() OR public.is_admin() );

-- ANNOUNCEMENTS
DROP POLICY IF EXISTS announcements_select ON public."Announcements";
CREATE POLICY announcements_select
  ON public."Announcements" FOR SELECT
  USING (
    public.is_admin()
    OR property_id IN (SELECT property_id FROM public."Units" WHERE tenant_id = auth.uid())
    OR public.user_has_role('landlord','property',property_id)
  );

DROP POLICY IF EXISTS announcements_insert ON public."Announcements";
CREATE POLICY announcements_insert
  ON public."Announcements" FOR INSERT
  WITH CHECK (
    public.is_admin()
    OR public.user_has_role('landlord','property',property_id)
  );

-- ANNOUNCEMENTSCOPES
DROP POLICY IF EXISTS announcementscopes_select ON public."AnnouncementScopes";
CREATE POLICY announcementscopes_select
  ON public."AnnouncementScopes" FOR SELECT
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public."Announcements" a
      WHERE a.id = announcement_id
        AND (a.property_id IN (SELECT property_id FROM public."Units" WHERE tenant_id = auth.uid())
             OR public.user_has_role('landlord','property',a.property_id))
    )
  );

-- VERIFICATIONS: tenant/landlord can view their own
DROP POLICY IF EXISTS tenantverification_select ON public."TenantVerification";
CREATE POLICY tenantverification_select
  ON public."TenantVerification" FOR SELECT
  USING ( auth.uid() = tenant_id OR public.is_admin() OR public.user_has_role('landlord','property',property_id) );

DROP POLICY IF EXISTS landlordverification_select ON public."LandlordVerification";
CREATE POLICY landlordverification_select
  ON public."LandlordVerification" FOR SELECT
  USING ( auth.uid() = user_id OR public.is_admin() );

-- UNITS & PROPERTIES: owner/landlord visibility
DROP POLICY IF EXISTS units_select ON public."Units";
CREATE POLICY units_select
  ON public."Units" FOR SELECT
  USING (
    public.is_admin()
    OR tenant_id = auth.uid()
    OR public.user_has_role('landlord','property',property_id)
  );

DROP POLICY IF EXISTS properties_select ON public."Properties";
CREATE POLICY properties_select
  ON public."Properties" FOR SELECT
  USING (
    public.is_admin()
    OR owner_id = auth.uid()
    OR public.user_has_role('landlord','property',id)
  );

DROP POLICY IF EXISTS properties_insert ON public."Properties";
CREATE POLICY properties_insert
  ON public."Properties" FOR INSERT
  WITH CHECK (
    public.is_admin() OR owner_id = auth.uid()
  );

DROP POLICY IF EXISTS properties_update ON public."Properties";
CREATE POLICY properties_update
  ON public."Properties" FOR UPDATE
  USING (
    public.is_admin() OR owner_id = auth.uid()
  )
  WITH CHECK (
    public.is_admin() OR owner_id = auth.uid()
  );

-- VISITOR PASSES
DROP POLICY IF EXISTS visitorpasses_select ON public."VisitorPasses";
CREATE POLICY visitorpasses_select
  ON public."VisitorPasses" FOR SELECT
  USING (
    public.is_admin()
    OR tenant_id = auth.uid()
    OR public.user_has_role('landlord','property',property_id)
  );

-- NOTIFICATIONS
DROP POLICY IF EXISTS notifications_select ON public."Notifications";
CREATE POLICY notifications_select
  ON public."Notifications" FOR SELECT
  USING ( user_id = auth.uid() OR public.is_admin() );

-- MOVE OUT REQUESTS
DROP POLICY IF EXISTS moveout_select ON public."MoveOutRequests";
CREATE POLICY moveout_select
  ON public."MoveOutRequests" FOR SELECT
  USING ( auth.uid() = tenant_id OR public.is_admin() OR public.user_has_role('landlord','property',property_id) );

-- ACTIVITY LOGS
DROP POLICY IF EXISTS activitylogs_select ON public."ActivityLogs";
CREATE POLICY activitylogs_select
  ON public."ActivityLogs" FOR SELECT
  USING (
    public.is_admin()
  );

DROP POLICY IF EXISTS activitylogs_insert ON public."ActivityLogs";
CREATE POLICY activitylogs_insert
  ON public."ActivityLogs" FOR INSERT
  WITH CHECK (
    auth.role() = 'service_role' OR public.is_admin()
  );


-- ===============================================================
-- 6) DASHBOARD VIEWS (SECURITY INVOKER)
-- Create views, then force SECURITY INVOKER via ALTER VIEW
-- ===============================================================

-- Payment / receipt summary (uses Receipts)
CREATE VIEW public.vw_payment_summary AS
SELECT
  r.id AS receipt_id,
  r.tenant_id,
  u.full_name AS tenant_name,
  r.property_id,
  p.name AS property_name,
  r.amount,
  r.status,
  r.period,
  r.receipt_no,
  r.approved_at,
  r.receipt_pdf_url
FROM public."Receipts" r
LEFT JOIN public."Users" u ON u.id = r.tenant_id
LEFT JOIN public."Properties" p ON p.id = r.property_id;

ALTER VIEW public.vw_payment_summary SET (security_invoker = true);

-- Tenant dashboard: counts for a tenant (maintenance requests, receipts)
CREATE VIEW public.vw_tenant_dashboard AS
SELECT
  t.tenant_id,
  u.full_name AS tenant_name,
  COUNT(DISTINCT m.id) AS maintenance_requests_count,
  COUNT(DISTINCT r.id) AS receipts_count
FROM public."TenantVerification" t
LEFT JOIN public."Users" u ON u.id = t.tenant_id
LEFT JOIN public."MaintenanceRequests" m ON m.tenant_id = t.tenant_id
LEFT JOIN public."Receipts" r ON r.tenant_id = t.tenant_id
GROUP BY t.tenant_id, u.full_name;

ALTER VIEW public.vw_tenant_dashboard SET (security_invoker = true);

-- Landlord dashboard: counts for a landlord across properties
CREATE VIEW public.vw_landlord_dashboard AS
SELECT
  pr.owner_id AS landlord_id,
  u.full_name AS landlord_name,
  COUNT(DISTINCT pr.id) FILTER (WHERE pr.owner_id IS NOT NULL) AS properties_count,
  COUNT(DISTINCT tv.tenant_id) AS total_tenants
FROM public."Properties" pr
LEFT JOIN public."Users" u ON u.id = pr.owner_id
LEFT JOIN public."TenantVerification" tv ON tv.property_id = pr.id
GROUP BY pr.owner_id, u.full_name;

ALTER VIEW public.vw_landlord_dashboard SET (security_invoker = true);

-- Messages overview
CREATE VIEW public.vw_message_overview AS
SELECT
  m.id AS message_id,
  m.sender_id,
  s.full_name AS sender_name,
  m.receiver_id,
  r.full_name AS receiver_name,
  m.message_body,
  m.status,
  m.created_at
FROM public."Messages" m
LEFT JOIN public."Users" s ON s.id = m.sender_id
LEFT JOIN public."Users" r ON r.id = m.receiver_id;

ALTER VIEW public.vw_message_overview SET (security_invoker = true);

-- ===============================================================
-- 7) Grants & Defaults (allow schema usage)
-- ===============================================================
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated, service_role;

-- Clear local plan cache to force reload of function definitions
DISCARD ALL;

-- ===============================================================
-- 8) NOTES
-- - This script builds a secure RLS-centred schema and creates dashboard views.
