import type { IOplRuntimeCommandResult } from '@/common/adapter/ipcBridge';

export type FirstRunChecklistItem = {
  item_id: string;
  label: string;
  status: string;
  required: boolean;
  blocking: boolean;
  readiness_layer?: 'core_launch' | 'full_readiness' | 'optional';
  severity?: 'blocking' | 'maintenance' | 'info';
  user_action_required?: boolean;
  auto_action_available?: boolean;
  action_command_ref?: string | null;
  last_attempt?: Record<string, unknown> | null;
  next_visible_step?: string;
  detail_summary?: string;
};

export type FirstRunInitialize = {
  surface_id?: string;
  overall_state?: string;
  setup_flow?: {
    is_first_run?: boolean;
    phase?: string;
    ready_to_launch?: boolean;
    progress?: {
      ready_required_count?: number;
      total_required_count?: number;
      required_completed_count?: number;
      required_total_count?: number;
      ready_full_readiness_count?: number;
      total_full_readiness_count?: number;
      ready_optional_count?: number;
      total_optional_count?: number;
    };
    blocking_items?: string[];
    maintenance_items?: string[];
  };
  checklist?: FirstRunChecklistItem[];
  readiness?: {
    core_ready?: boolean;
    domain_ready?: boolean;
    online_management_ready?: boolean;
    launch_ready?: boolean;
    family_runtime_provider_ready?: boolean;
    full_ready?: boolean;
  };
  codex_default_profile?: {
    model_provider?: string;
    model?: string;
    model_reasoning_effort?: string;
    base_url?: string;
  };
  recommended_skills?: {
    summary?: {
      total?: number;
      ready?: number;
      missing?: number;
    };
  };
};

export type FirstRunCommandResult = IOplRuntimeCommandResult | null;
