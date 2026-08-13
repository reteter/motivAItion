export interface DurableObjectStub {
  fetch(request: Request): Promise<Response>;
}

export interface DurableObjectNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): DurableObjectStub;
}

export interface BackendEnv {
  COACH_COORDINATOR: DurableObjectNamespace;
  OPENAI_API_KEY: string;
  ACCESS_CODE_HASH: string;
  COACH_MODEL: string;
  PROMPT_VERSION: string;
  MAX_REQUESTS_PER_DAY?: string;
  MAX_TOKENS_PER_DAY?: string;
}

export interface UsageRecord {
  requests: number;
  tokens: number;
}

export interface DurableObjectStorage {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  transaction<T>(closure: (transaction: DurableObjectStorage) => Promise<T>): Promise<T>;
}

export interface DurableObjectState {
  storage: DurableObjectStorage;
}
