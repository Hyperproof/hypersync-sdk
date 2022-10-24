/* eslint-disable @typescript-eslint/no-namespace */
import { FusebitContext } from '@fusebit/add-on-sdk';

export {};

declare global {
  export namespace Express {
    interface Request {
      fusebit: FusebitContext;
    }

    type ParsedQs = {
      [key: string]: undefined | string | string[] | ParsedQs | ParsedQs[];
    };
  }
}
