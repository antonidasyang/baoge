import { Agent } from '@mariozechner/pi-agent-core';

export interface SubagentEvent {
  type: string;
  source?: string; // e.g. 'main', 'email-agent'
  agentId?: string;
  payload?: any;
  [key: string]: any;
}

export interface AgentInstance {
  agent: Agent;
  name: string;
}

export interface DelegationResult {
  success: boolean;
  message: string;
  data?: any;
}
