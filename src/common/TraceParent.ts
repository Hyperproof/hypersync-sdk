import { HttpHeader } from './enums';

export class TraceParent {
  public static traceParent: string | undefined;

  public static getHeaders(): { traceparent: string } | {} {
    if (!TraceParent.traceParent) return {};
    return {
      [HttpHeader.TraceParent]: TraceParent.traceParent
    };
  }
}
