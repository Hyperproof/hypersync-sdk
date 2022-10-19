// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { SuperAgentRequest } from 'superagent';
declare module 'superagent' {
  interface SuperAgentRequest {
    // Guidance from Fusebit suggest that we should wait for requests to be
    // completely written in certain scenarios.  To do that we need access
    // to a private member on SuperAgentRequest.  See:
    // https://hyperproof.atlassian.net/browse/HYP-16748
    req: NodeJS.WriteStream;
  }
}
