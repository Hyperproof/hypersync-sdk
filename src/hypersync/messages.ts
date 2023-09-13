export const MESSAGES = {
  App: 'App',
  FormatBooleanYesNo: 'Yes;No',
  FormatBooleanTrueFalse: 'True;False',
  ImportTimeLessThan1Hour: 'This import will take {minutes} minutes',
  ImportTimeGreaterThan1Hour:
    'This import will take {hours} hour and {minutes} minutes',
  ImportTimeGreaterThan2Hours:
    'This import will take {hours} hours and {minutes} minutes',
  ProofCategoryOther: 'Other',
  ProofType: 'Proof',
  NoAccountFound:
    "Hyperproof cannot connect to {app}, your credentials may have expired. Try Update Credentials in Hyperproof and if that doesn't fix the connection, contact your system admin."
};

const MESSAGE_KEYS = {
  [MESSAGES.ImportTimeLessThan1Hour]: { Minutes: 'minutes' },
  [MESSAGES.ImportTimeGreaterThan1Hour]: { Hours: 'hours', Minutes: 'minutes' },
  [MESSAGES.ImportTimeGreaterThan2Hours]: {
    Hours: 'hours',
    Minutes: 'minutes'
  },
  [MESSAGES.NoAccountFound]: { App: 'app' }
};

export const formatMessage = (
  messageKey: string,
  messageVals: { [key: string]: string },
  messageKeysOverride?: { [key: string]: string }
) => {
  let message = messageKey;

  Object.entries(
    (messageKeysOverride
      ? messageKeysOverride[messageKey]
      : MESSAGE_KEYS[messageKey]) ?? {}
  ).forEach(([key, messageVal]) => {
    message = message.replace(`{${messageVal}}`, messageVals[key]);
  });
  return message;
};
