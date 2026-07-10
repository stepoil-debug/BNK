export type UserRole = 'super_admin' | 'admin' | 'finance_editor' | 'finance_viewer' | 'auditor' | 'blocked';
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
