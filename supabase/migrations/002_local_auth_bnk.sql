-- ================================================================================================
-- STEP BANK / BNK - AUTENTICAÇÃO LOCAL
-- Objetivo:
--   Remover a necessidade de criar usuários em Supabase Authentication > Users.
--   Criar login local controlado por tabela, senha com hash e sessão própria.
--
-- Usuário inicial:
--   douglas.tabella@step-og.com
--
-- IMPORTANTE:
--   1. Rode este SQL depois do schema principal.
--   2. Troque a senha abaixo antes de rodar, se desejar.
--   3. A senha ficará armazenada somente como hash bcrypt via pgcrypto/crypt.
-- ================================================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'local_user_status' AND typnamespace = 'security'::regnamespace) THEN
    CREATE TYPE security.local_user_status AS ENUM ('active', 'inactive', 'blocked');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'local_role' AND typnamespace = 'security'::regnamespace) THEN
    CREATE TYPE security.local_role AS ENUM (
      'super_admin',
      'admin',
      'finance_editor',
      'finance_viewer',
      'auditor',
      'blocked'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS security.local_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext NOT NULL UNIQUE,
  password_hash text NOT NULL,
  full_name text,
  role security.local_role NOT NULL DEFAULT 'finance_viewer',
  status security.local_user_status NOT NULL DEFAULT 'active',
  must_change_password boolean NOT NULL DEFAULT false,
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  created_by uuid REFERENCES security.local_users(id),
  updated_by uuid REFERENCES security.local_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS security.local_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES security.local_users(id) ON DELETE CASCADE,
  session_token_hash text NOT NULL UNIQUE,
  ip_address inet,
  user_agent text,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '8 hours'),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS security.local_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES security.local_users(id) ON DELETE CASCADE,
  fingerprint_hash text NOT NULL,
  user_agent text,
  platform text,
  browser_language text,
  timezone text,
  screen_resolution text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'blocked')),
  approved_by uuid REFERENCES security.local_users(id),
  approved_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, fingerprint_hash)
);

CREATE TABLE IF NOT EXISTS security.local_security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES security.local_users(id) ON DELETE SET NULL,
  actor_user_id uuid REFERENCES security.local_users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  level text NOT NULL DEFAULT 'info',
  message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_local_users_email ON security.local_users(email);
CREATE INDEX IF NOT EXISTS idx_local_sessions_hash ON security.local_sessions(session_token_hash);
CREATE INDEX IF NOT EXISTS idx_local_sessions_user ON security.local_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_local_devices_user ON security.local_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_local_devices_status ON security.local_devices(status);
CREATE INDEX IF NOT EXISTS idx_local_events_created ON security.local_security_events(created_at DESC);

CREATE OR REPLACE FUNCTION security.local_hash_token(p_token text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT encode(digest(p_token, 'sha256'), 'hex');
$$;

CREATE OR REPLACE FUNCTION security.local_require_admin(p_session_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = security, public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT u.id
  INTO v_user_id
  FROM security.local_sessions s
  JOIN security.local_users u ON u.id = s.user_id
  WHERE s.session_token_hash = security.local_hash_token(p_session_token)
    AND s.revoked_at IS NULL
    AND s.expires_at > now()
    AND u.status = 'active'
    AND u.role IN ('super_admin', 'admin')
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida ou sem permissão administrativa.';
  END IF;

  RETURN v_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION security.local_login(
  p_email citext,
  p_password text,
  p_device jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  session_token text,
  user_id uuid,
  email citext,
  full_name text,
  role text,
  status text,
  device_status text,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = security, public
AS $$
DECLARE
  v_user security.local_users%ROWTYPE;
  v_token text;
  v_token_hash text;
  v_device_status text;
  v_has_approved_devices boolean;
  v_fingerprint text;
BEGIN
  SELECT *
  INTO v_user
  FROM security.local_users
  WHERE lower(local_users.email::text) = lower(p_email::text)
  LIMIT 1;

  IF v_user.id IS NULL THEN
    RAISE EXCEPTION 'Credenciais inválidas.';
  END IF;

  IF v_user.status <> 'active' THEN
    RAISE EXCEPTION 'Usuário bloqueado ou inativo.';
  END IF;

  IF v_user.locked_until IS NOT NULL AND v_user.locked_until > now() THEN
    RAISE EXCEPTION 'Usuário temporariamente bloqueado por tentativas inválidas.';
  END IF;

  IF v_user.password_hash <> crypt(p_password, v_user.password_hash) THEN
    UPDATE security.local_users
    SET failed_attempts = failed_attempts + 1,
        locked_until = CASE WHEN failed_attempts + 1 >= 5 THEN now() + interval '30 minutes' ELSE locked_until END,
        updated_at = now()
    WHERE id = v_user.id;

    INSERT INTO security.local_security_events(user_id, event_type, level, message, metadata)
    VALUES (v_user.id, 'login.failed', 'warning', 'Tentativa de login inválida.', jsonb_build_object('email', p_email));

    RAISE EXCEPTION 'Credenciais inválidas.';
  END IF;

  v_fingerprint := COALESCE(p_device->>'fingerprint_hash', 'unknown');

  SELECT EXISTS (
    SELECT 1 FROM security.local_devices
    WHERE user_id = v_user.id
      AND status = 'approved'
  ) INTO v_has_approved_devices;

  INSERT INTO security.local_devices (
    user_id,
    fingerprint_hash,
    user_agent,
    platform,
    browser_language,
    timezone,
    screen_resolution,
    status,
    approved_by,
    approved_at,
    last_seen_at
  )
  VALUES (
    v_user.id,
    v_fingerprint,
    p_device->>'user_agent',
    p_device->>'platform',
    p_device->>'browser_language',
    p_device->>'timezone',
    p_device->>'screen_resolution',
    CASE
      WHEN v_user.role = 'super_admin' AND v_has_approved_devices = false THEN 'approved'
      ELSE 'pending'
    END,
    CASE
      WHEN v_user.role = 'super_admin' AND v_has_approved_devices = false THEN v_user.id
      ELSE NULL
    END,
    CASE
      WHEN v_user.role = 'super_admin' AND v_has_approved_devices = false THEN now()
      ELSE NULL
    END,
    now()
  )
  ON CONFLICT (user_id, fingerprint_hash) DO UPDATE
  SET
    user_agent = EXCLUDED.user_agent,
    platform = EXCLUDED.platform,
    browser_language = EXCLUDED.browser_language,
    timezone = EXCLUDED.timezone,
    screen_resolution = EXCLUDED.screen_resolution,
    last_seen_at = now()
  RETURNING local_devices.status INTO v_device_status;

  SELECT status
  INTO v_device_status
  FROM security.local_devices
  WHERE user_id = v_user.id
    AND fingerprint_hash = v_fingerprint
  LIMIT 1;

  v_token := encode(gen_random_bytes(32), 'hex');
  v_token_hash := security.local_hash_token(v_token);

  INSERT INTO security.local_sessions (
    user_id,
    session_token_hash,
    user_agent,
    expires_at
  )
  VALUES (
    v_user.id,
    v_token_hash,
    p_device->>'user_agent',
    now() + interval '8 hours'
  )
  RETURNING local_sessions.expires_at INTO expires_at;

  UPDATE security.local_users
  SET failed_attempts = 0,
      locked_until = NULL,
      last_login_at = now(),
      updated_at = now()
  WHERE id = v_user.id;

  INSERT INTO security.local_security_events(user_id, event_type, level, message, metadata)
  VALUES (
    v_user.id,
    'login.success',
    'success',
    'Login local realizado.',
    jsonb_build_object('device_status', v_device_status, 'fingerprint_hash', v_fingerprint)
  );

  session_token := v_token;
  user_id := v_user.id;
  email := v_user.email;
  full_name := v_user.full_name;
  role := v_user.role::text;
  status := v_user.status::text;
  device_status := v_device_status;

  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION security.local_current_user(p_session_token text)
RETURNS TABLE (
  user_id uuid,
  email citext,
  full_name text,
  role text,
  status text,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = security, public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    u.id,
    u.email,
    u.full_name,
    u.role::text,
    u.status::text,
    s.expires_at
  FROM security.local_sessions s
  JOIN security.local_users u ON u.id = s.user_id
  WHERE s.session_token_hash = security.local_hash_token(p_session_token)
    AND s.revoked_at IS NULL
    AND s.expires_at > now()
    AND u.status = 'active'
  LIMIT 1;

  UPDATE security.local_sessions
  SET last_seen_at = now()
  WHERE session_token_hash = security.local_hash_token(p_session_token)
    AND revoked_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION security.local_logout(p_session_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = security, public
AS $$
BEGIN
  UPDATE security.local_sessions
  SET revoked_at = now()
  WHERE session_token_hash = security.local_hash_token(p_session_token);
END;
$$;

CREATE OR REPLACE FUNCTION security.local_admin_create_user(
  p_session_token text,
  p_email citext,
  p_password text,
  p_full_name text,
  p_role text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = security, public
AS $$
DECLARE
  v_actor uuid;
  v_new_user_id uuid;
BEGIN
  v_actor := security.local_require_admin(p_session_token);

  IF length(p_password) < 8 THEN
    RAISE EXCEPTION 'A senha precisa ter pelo menos 8 caracteres.';
  END IF;

  INSERT INTO security.local_users (
    email,
    password_hash,
    full_name,
    role,
    status,
    must_change_password,
    created_by
  )
  VALUES (
    lower(p_email::text)::citext,
    crypt(p_password, gen_salt('bf', 12)),
    p_full_name,
    p_role::security.local_role,
    'active',
    true,
    v_actor
  )
  RETURNING id INTO v_new_user_id;

  INSERT INTO security.local_security_events(user_id, actor_user_id, event_type, level, message, metadata)
  VALUES (v_new_user_id, v_actor, 'user.created', 'critical', 'Usuário local criado pelo administrador.', jsonb_build_object('email', p_email, 'role', p_role));

  RETURN v_new_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION security.local_list_users(p_session_token text)
RETURNS TABLE (
  id uuid,
  email citext,
  full_name text,
  role text,
  status text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = security, public
AS $$
DECLARE
  v_actor uuid;
BEGIN
  v_actor := security.local_require_admin(p_session_token);

  RETURN QUERY
  SELECT u.id, u.email, u.full_name, u.role::text, u.status::text, u.created_at
  FROM security.local_users u
  ORDER BY u.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION security.local_list_devices(p_session_token text)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  fingerprint_hash text,
  user_agent text,
  platform text,
  browser_language text,
  timezone text,
  screen_resolution text,
  status text,
  approved_by uuid,
  approved_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = security, public
AS $$
DECLARE
  v_actor uuid;
BEGIN
  v_actor := security.local_require_admin(p_session_token);

  RETURN QUERY
  SELECT d.id, d.user_id, d.fingerprint_hash, d.user_agent, d.platform, d.browser_language,
         d.timezone, d.screen_resolution, d.status, d.approved_by, d.approved_at, d.last_seen_at, d.created_at
  FROM security.local_devices d
  ORDER BY d.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION security.local_update_device_status(
  p_session_token text,
  p_device_id uuid,
  p_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = security, public
AS $$
DECLARE
  v_actor uuid;
  v_user_id uuid;
BEGIN
  v_actor := security.local_require_admin(p_session_token);

  IF p_status NOT IN ('approved', 'blocked') THEN
    RAISE EXCEPTION 'Status inválido.';
  END IF;

  UPDATE security.local_devices
  SET status = p_status,
      approved_by = CASE WHEN p_status = 'approved' THEN v_actor ELSE approved_by END,
      approved_at = CASE WHEN p_status = 'approved' THEN now() ELSE approved_at END
  WHERE id = p_device_id
  RETURNING user_id INTO v_user_id;

  INSERT INTO security.local_security_events(user_id, actor_user_id, event_type, level, message, metadata)
  VALUES (v_user_id, v_actor, 'device.' || p_status, CASE WHEN p_status = 'approved' THEN 'success' ELSE 'critical' END, 'Status do dispositivo alterado.', jsonb_build_object('device_id', p_device_id));
END;
$$;

CREATE OR REPLACE FUNCTION security.local_get_my_device_status(
  p_session_token text,
  p_fingerprint_hash text
)
RETURNS TABLE (device_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = security, public
AS $$
BEGIN
  RETURN QUERY
  SELECT d.status
  FROM security.local_sessions s
  JOIN security.local_devices d ON d.user_id = s.user_id
  WHERE s.session_token_hash = security.local_hash_token(p_session_token)
    AND s.revoked_at IS NULL
    AND s.expires_at > now()
    AND d.fingerprint_hash = p_fingerprint_hash
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION security.local_list_security_events(p_session_token text)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  actor_user_id uuid,
  event_type text,
  level text,
  message text,
  metadata jsonb,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = security, public
AS $$
DECLARE
  v_actor uuid;
BEGIN
  v_actor := security.local_require_admin(p_session_token);

  RETURN QUERY
  SELECT e.id, e.user_id, e.actor_user_id, e.event_type, e.level, e.message, e.metadata, e.created_at
  FROM security.local_security_events e
  ORDER BY e.created_at DESC
  LIMIT 100;
END;
$$;

-- Grants para o frontend chamar RPCs com anon/public key.
GRANT EXECUTE ON FUNCTION security.local_login(citext, text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION security.local_current_user(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION security.local_logout(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION security.local_admin_create_user(text, citext, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION security.local_list_users(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION security.local_list_devices(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION security.local_update_device_status(text, uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION security.local_get_my_device_status(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION security.local_list_security_events(text) TO anon, authenticated;

-- Cria/atualiza o administrador inicial local.
INSERT INTO security.local_users (
  email,
  password_hash,
  full_name,
  role,
  status,
  must_change_password
)
VALUES (
  'douglas.tabella@step-og.com',
  crypt('T4bell@1991', gen_salt('bf', 12)),
  'Douglas Tabella',
  'super_admin',
  'active',
  false
)
ON CONFLICT (email) DO UPDATE
SET
  password_hash = EXCLUDED.password_hash,
  full_name = EXCLUDED.full_name,
  role = 'super_admin',
  status = 'active',
  must_change_password = false,
  updated_at = now();

SELECT id, email, full_name, role, status, created_at
FROM security.local_users
WHERE email = 'douglas.tabella@step-og.com';
