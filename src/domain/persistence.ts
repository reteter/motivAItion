export type HydrationStatus = 'loading' | 'ready' | 'read_error';

export function shouldPersistState(status: HydrationStatus, dirty: boolean) {
  return status === 'ready' && dirty;
}
