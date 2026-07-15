-- Defesa em profundidade para governança, biometria e auditoria.

alter table security.finance_governance enable row level security;
alter table security.finance_governance force row level security;
alter table security.finance_access_grants enable row level security;
alter table security.finance_access_grants force row level security;
alter table security.finance_biometric_enrollments enable row level security;
alter table security.finance_biometric_enrollments force row level security;
alter table security.finance_biometric_samples enable row level security;
alter table security.finance_biometric_samples force row level security;
alter table security.finance_biometric_sessions enable row level security;
alter table security.finance_biometric_sessions force row level security;
alter table security.finance_access_audit enable row level security;
alter table security.finance_access_audit force row level security;

revoke all on all tables in schema security from public, anon, authenticated;
revoke all on all sequences in schema security from public, anon, authenticated;
grant all on all tables in schema security to service_role;
grant all on all sequences in schema security to service_role;
