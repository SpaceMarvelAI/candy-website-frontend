import type { AuthUser, TokenResponse } from '../../src/api/auth';

export const mockTokenResponse: TokenResponse = {
  access_token: 'test-jwt-abc123',
  token_type:   'bearer',
  user_id:      'user_001',
  company_id:   'company_001',
  company_name: 'Acme Corp',
  role:         'admin',
  email:        'admin@acme.com',
};

export const mockUser: AuthUser = {
  user_id:      'user_001',
  email:        'admin@acme.com',
  full_name:    'Acme Admin',
  role:         'admin',
  company_id:   'company_001',
  company_name: 'Acme Corp',
};

export const mockAgent = {
  id:                       'agent_001',
  company_id:               'company_001',
  name:                     'Test Agent',
  use_case_slug:            'ecommerce',
  call_direction:           'inbound',
  agent_flow_status:        'configured',
  active_prompt_version_id: null,
  multilingual:             false,
  supported_language_ids:   [],
  created_at:               '2025-01-01T00:00:00Z',
};

export const mockLanguages = [
  { code: 'en-US', label: 'English (US)' },
  { code: 'es-ES', label: 'Spanish (Spain)' },
];

export const API_BASE = 'http://localhost:8002';
