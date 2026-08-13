import { handleRequest } from './handler';
import { CoachCoordinator } from './coordinator';
import { BackendEnv } from './types';

export default {
  fetch(request: Request, env: BackendEnv) {
    return handleRequest(request, env);
  },
};

export { CoachCoordinator };
