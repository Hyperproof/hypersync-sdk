/* eslint-disable @typescript-eslint/no-namespace */
import { IFusebitContext } from '@fusebit/add-on-sdk';

export {};

declare global {
  export namespace Express {
    interface Request {
      fusebit: IFusebitContext;
    }

    type ParsedQs = {
      [key: string]: undefined | string | string[] | ParsedQs | ParsedQs[];
    };
  }
}
