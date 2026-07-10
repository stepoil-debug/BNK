-- ================================================================================================
-- BNK / STEP Finance Control - Bootstrap do Super Administrador
-- Usuário: douglas.tabella@step-og.com
--
-- IMPORTANTE:
-- 1. Primeiro crie o usuário no Supabase:
--    Authentication > Users > Add user
--    E-mail: douglas.tabella@step-og.com
--    Senha: a senha definida por você
--
-- 2. Depois execute este SQL no SQL Editor do Supabase.
--
-- 3. A senha NÃO fica neste SQL e NÃO deve ir para o GitHub/Netlify.
-- ================================================================================================

SELECT security.bootstrap_super_admin('douglas.tabella@step-og.com');

-- Conferência:
SELECT
  p.id,
  p.email,
  p.status,
  p.is_active,
  ur.role,
  ur.is_active AS role_active
FROM security.profiles p
LEFT JOIN security.user_roles ur ON ur.user_id = p.id
WHERE p.email = 'douglas.tabella@step-og.com';
