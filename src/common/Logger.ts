import { HttpHeader, MimeType } from './enums';
import { TraceParent } from './TraceParent';

import { debug } from '@hyperproof/integration-sdk';
import fetch from 'node-fetch';

export enum LoggerContextKey {
  IntegrationType = 'integrationType',
  OrgId = 'orgId',
  UserId = 'userId'
}

export type LoggerContext = { [key in LoggerContextKey]?: string };

enum EventType {
  Debug = 'debug',
  Information = 'info',
  Warning = 'warning',
  Error = 'error'
}

enum Originator {
  Client = 'client',
  Integrations = 'integrations'
}

interface ILogEvent {
  eventType: EventType;
  originator?: string;
  message: string;
  url?: string;
  status?: number;
  detail?: string;
  stack?: string;
  orgId?: string;
  userId?: string;
  integrationType?: string;
}

export class Logger {
  private static context: LoggerContext;
  private static subscriptionKey: string;

  public static init(context: LoggerContext, subscriptionKey: string) {
    Logger.context = context;
    Logger.subscriptionKey = subscriptionKey;
  }

  /**
   * Posts a DEBUG message to Hyperproof iff the debug environment variable is set to 1.
   *
   * @param {string} message Message to log.
   * @param {string} detail Additional detail to add to the log entry.
   */
  public static async debug(message: any, detail?: string) {
    debug(detail ? `${message}: ${detail}` : message);
    if (process.env.debug === '1') {
      return Logger.postLogEvent(EventType.Debug, message, detail);
    }
  }

  /**
   * Post an INFO message to Hyperproof.
   *
   * @param {string} message Message to log.
   * @param {string} detail Additional detail to add to the log entry.
   */
  public static async info(message: any, detail?: string) {
    console.log(detail ? `${message}: ${detail}` : message);
    return Logger.postLogEvent(EventType.Information, message, detail);
  }

  /**
   * Post a WARNING message to Hyperproof.
   *
   * @param {string} message Message to log.
   * @param {string} detail Additional detail to add to the log entry.
   */
  public static async warn(message: any, detail?: string) {
    console.warn(detail ? `${message}: ${detail}` : message);
    return this.postLogEvent(EventType.Warning, message, detail);
  }

  /**
   * Post an ERROR log message to Hyperproof.
   *
   * @param {string} message Message to log.
   * @param {string} error Additional detail about the error or an Error object.
   */
  public static async error(message: any, errorInfo?: string | Error) {
    if (!errorInfo || typeof errorInfo === 'string') {
      console.error(errorInfo ? `${message}: ${errorInfo}` : message);
      return this.postLogEvent(EventType.Error, message, errorInfo);
    } else {
      console.error(message, '\n', errorInfo);
      return this.postLogEvent(
        EventType.Error,
        message,
        errorInfo.message,
        errorInfo.stack
      );
    }
  }

  /**
   * Adds a context value to the logger.  Context values will be associated
   * with all log entries created by the logger.
   *
   * @param key Key for the context value.
   * @param value Value to add.
   */
  public static async addToContext(key: LoggerContextKey, value: string) {
    Logger.context[key] = value;
  }

  /**
   * Log an event in the Hyperproof backend.
   *
   * @param {EventType} eventType Type (level) this log message,
   * @param {string} message Message to log.
   * @param {string} detail Additional detail to add to the log entry.
   * @param {string} stack Optional stack to associate with the entry.
   */
  private static async postLogEvent(
    eventType: EventType,
    message: any,
    detail?: string,
    stack?: string
  ) {
    if (!process.env.hyperproof_api_url || !Logger.subscriptionKey) {
      console.error(
        'Unable to post log event.  hyperproof_api_url and/or hyperproof_api_subscription_key not set in environment.'
      );
      return;
    }

    // HYP-26951: Skip this for LocalDev due to microk8s issues.
    // See https://github.com/kubernetes/kubectl/issues/1169
    if (Logger.subscriptionKey.includes('local_dev')) {
      return;
    }

    try {
      const url = `${process.env.hyperproof_api_url}/beta/logs/events`;

      const logEvent: ILogEvent = {
        eventType,
        originator: Originator.Integrations,
        message:
          typeof message === 'string' ? message : JSON.stringify(message),
        detail,
        orgId: this.context[LoggerContextKey.OrgId],
        userId: this.context[LoggerContextKey.UserId],
        integrationType: this.context[LoggerContextKey.IntegrationType],
        stack
      };

      const response = await fetch(url, {
        method: 'POST',
        body: JSON.stringify(logEvent),
        headers: {
          ...TraceParent.getHeaders(),
          [HttpHeader.SubscriptionKey]: Logger.subscriptionKey,
          [HttpHeader.ContentType]: MimeType.APPLICATION_JSON
        }
      });
      if (!response.ok) {
        // Swallow error. Failure to log should not take down the operation
        const text = await response.text();
        console.error(
          `Received ${response.status} status posting log message`,
          text
        );
      }
    } catch (e) {
      // Swallow error. Failure to log should not take down the operation
      console.error('Unexpected exception caught while posting log message', e);
    }
  }
}
