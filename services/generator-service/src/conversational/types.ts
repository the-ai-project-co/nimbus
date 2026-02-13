export interface ConversationalIntent {
  type: 'generate' | 'modify' | 'explain' | 'help' | 'unknown';
  confidence: number;
  entities: IntentEntity[];
  context?: Record<string, unknown>;
}

export interface IntentEntity {
  type: string; // 'provider', 'component', 'environment', 'region', 'generation_type', etc.
  value: string;
  confidence: number;
  position?: { start: number; end: number };
}

export interface ConversationalContext {
  user_id?: string;
  session_id: string;
  previous_intent?: ConversationalIntent;
  infrastructure_stack?: {
    provider?: string;
    components?: string[];
    environment?: string;
    region?: string;
    generation_type?: 'terraform' | 'kubernetes' | 'helm';
  };
  conversation_history: ConversationalTurn[];
  created_at: Date;
  updated_at: Date;
}

export interface ConversationalTurn {
  role: 'user' | 'assistant';
  message: string;
  intent?: ConversationalIntent;
  timestamp: Date;
}

export interface InfrastructureRequirements {
  provider: 'aws' | 'gcp' | 'azure';
  components: string[];
  environment?: string;
  region?: string;
  vpc_config?: {
    cidr?: string;
    subnet_count?: number;
  };
  eks_config?: {
    version?: string;
    node_count?: number;
    instance_type?: string;
  };
  rds_config?: {
    engine?: string;
    instance_class?: string;
    storage?: number;
  };
  s3_config?: {
    versioning?: boolean;
    encryption?: boolean;
  };
  k8s_config?: {
    workloadType?: string;
    image?: string;
    replicas?: number;
    serviceType?: string;
    containerPort?: number;
    namespace?: string;
  };
  helm_config?: {
    chartName?: string;
    image?: string;
    replicas?: number;
    namespace?: string;
    version?: string;
  };
  tags?: Record<string, string>;
}

export interface ConversationalResponse {
  message: string;
  intent: ConversationalIntent;
  suggested_actions?: SuggestedAction[];
  extracted_requirements?: Partial<InfrastructureRequirements>;
  needs_clarification?: string[];
  context: ConversationalContext;
}

export interface SuggestedAction {
  type: 'start_questionnaire' | 'generate' | 'modify' | 'view_best_practices' | 'help';
  label: string;
  description: string;
  payload?: Record<string, unknown>;
}

export interface NLUPattern {
  pattern: RegExp;
  intent: string;
  entities?: Array<{
    type: string;
    extractor: (match: RegExpMatchArray) => string;
  }>;
}
