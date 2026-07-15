export type UserRole = 'super_admin' | 'admin' | 'finance_editor' | 'finance_viewer' | 'auditor' | 'blocked';
export type FinanceAccessRole = 'owner' | 'master_admin' | 'editor' | 'viewer' | 'auditor';
export type FinanceAccessStatus = 'pending_face' | 'active' | 'blocked' | 'revoked';
export type BiometricStatus = 'required' | 'capturing' | 'active' | 'recapture_required' | 'blocked' | 'revoked';
export type DeviceStatus = 'pending' | 'approved' | 'blocked';
export type PositionStatus = 'draft' | 'published' | 'archived';
export type FinanceGroup = 'bank_accounts' | 'investments' | 'credit_cards' | 'credit_lines' | 'companies';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  status: 'active' | 'inactive' | 'blocked';
}

export interface UserRoleRecord {
  user_id: string;
  role: UserRole;
}

export interface FinanceAccess {
  id: string;
  intranet_user_id: string | null;
  corporate_email: string;
  finance_user_id: string;
  full_name: string | null;
  role: FinanceAccessRole;
  status: FinanceAccessStatus;
  biometric_required: boolean;
  biometric_status: BiometricStatus;
  biometric_enrollment_id?: string | null;
  expires_at?: string | null;
  granted_at?: string;
  last_access_at?: string | null;
  can_manage_master: boolean;
  can_manage_users: boolean;
  can_edit_finance: boolean;
}

export interface BiometricEnrollmentStatus {
  id: string;
  status: BiometricStatus;
  consent_version: string | null;
  consented_at: string | null;
  model_provider: string | null;
  model_version: string | null;
  quality_score: number | null;
  enrolled_at: string | null;
  last_verified_at: string | null;
  failed_attempts: number;
  locked_until: string | null;
  sample_count: number;
}

export interface ApprovedDevice {
  id: string;
  user_id: string;
  fingerprint_hash: string;
  label: string | null;
  user_agent: string | null;
  platform: string | null;
  browser_language: string | null;
  timezone: string | null;
  screen_resolution: string | null;
  ip_address: string | null;
  status: DeviceStatus;
  approved_by: string | null;
  approved_at: string | null;
  last_seen_at: string | null;
  created_at: string;
}

export interface FinanceFieldTemplate {
  id: string;
  group_key: FinanceGroup;
  item_name: string;
  bank_name: string | null;
  account_type: string | null;
  account_number: string | null;
  company_name: string | null;
  is_active: boolean;
  order_index: number;
}

export interface FinancePosition {
  id: string;
  reference_date: string;
  status: PositionStatus;
  notes: string | null;
  created_by: string;
  published_by: string | null;
  published_at: string | null;
  created_at: string;
}

export interface FinancePositionItem {
  id: string;
  position_id: string;
  field_template_id: string;
  amount: number;
  notes: string | null;
}

export interface DashboardTotals {
  position_id: string;
  reference_date: string;
  total_banks: number;
  total_investments: number;
  total_credit_cards_available: number;
  total_credit_lines: number;
  total_companies: number;
  total_general: number;
}
