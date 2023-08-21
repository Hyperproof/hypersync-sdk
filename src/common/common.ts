import { ObjectType } from './enums';

import {
  debug,
  FusebitContext,
  getFunctionUrl,
  ListStorageResult,
  StorageItem
} from '@hyperproof/integration-sdk';
import Jwt from 'jsonwebtoken';

const pluralize = (value: ObjectType) => {
  return value.endsWith('s') ? value : `${value}s`;
};

/**
 * Generic method for comparing two values (strings, numbers, booleans, BigInts or Dates).
 */
export const compareValues = (
  s1?: string | number | boolean | BigInt | Date,
  s2?: string | number | boolean | BigInt | Date
) => {
  // Treat null and undefined values as undefined.
  s1 = s1 ?? undefined;
  s2 = s2 ?? undefined;

  if (s1 === undefined || s2 === undefined) {
    return compareBlanks(s1, s2);
  }
  if (
    (typeof s1 === 'number' && typeof s2 === 'number') ||
    (s1 instanceof BigInt && s2 instanceof BigInt)
  ) {
    return s1 < s2 ? -1 : s2 > s1 ? 1 : 0;
  }
  if (typeof s1 === 'boolean' && typeof s2 === 'boolean') {
    return s1 === s2 ? 0 : s1 ? -1 : 1;
  }
  if (s1 instanceof Date && s2 instanceof Date) {
    const t1 = s1.getTime();
    const t2 = s2.getTime();
    return t1 < t2 ? -1 : t2 > t1 ? 1 : 0;
  }
  return (s1 as string).localeCompare(s2 as string, undefined, {
    sensitivity: 'base'
  });
};

/**
 * Compares two values when one or more of the values is undefined.
 * Undefined values are always sorted ahead of defined values.
 */
const compareBlanks = (a?: any, b?: any) => {
  if (a === undefined && b === undefined) {
    return 0;
  }

  if (a !== undefined && b === undefined) {
    return -1;
  }

  if (a === undefined && b !== undefined) {
    return 1;
  }

  throw new Error('Neither a nor b are undefined');
};

/**
 * Builds a key of the form "/organizations/orgid/objectypeplural/objectid" that can
 * be used as a storage ID or in other places where a full object reference is needed.
 */
export const formatKey = (
  orgId: string,
  objectType: ObjectType,
  objectId: string,
  suffix?: string
) =>
  `organizations/${orgId}/${pluralize(objectType)}/${objectId}${
    suffix ? '/' + suffix : ''
  }`;

/**
 * Builds a key of the form "/organizations/orgid/users/userid" that can
 * be used as a storage ID or in other places where a full user reference is needed.
 */
export const formatUserKey = (orgId: string, userId: string, suffix?: string) =>
  formatKey(orgId, ObjectType.USER, userId, suffix);

/**
 * Extracts Hyperproof user information from a user key of the form:
 *
 *    organizations/orgid/users/userid
 *
 * @param {string} userKey The user key to inspect.
 */
export const getHpUserFromUserKey = (userKey: string) => {
  const parts = userKey.split('/');
  return {
    id: parts[3],
    orgId: parts[1]
  };
};

/**
 * Parses out the portion of the storage key that occurs after /root.
 *
 * @param {*} storageItem Storage item to inspect.
 */
export const parseStorageKeyFromStorageId = (storageItem: StorageItem) => {
  return storageItem.storageId.split('/root/')[1];
};

/**
 * Given the plural form of an object type (e.g. "controls", "labels", etc.) returns
 * the ObjectType value corresponding to that value.
 */
export const mapObjectTypesParamToType = (
  pluralObjectType: string
): ObjectType => {
  for (const type of Object.values(ObjectType)) {
    if (pluralObjectType === `${type}s`) {
      return type as ObjectType;
    }
  }
  throw new Error('Unrecognized plural object type: ' + pluralObjectType);
};

/**
 * Returns the Fusebit URL for a given integration.
 * @param fusebitContext Fusebit context to use.
 * @param boundaryId ID of the boundary in which the integration lives.
 * @param integrationId ID of the target integration.
 */
export const getFusebitUrl = async (
  fusebitContext: FusebitContext,
  boundaryId: string,
  integrationId: string
) => {
  const locationBody = getLocationBody(fusebitContext, boundaryId);
  const integrationLocation = await getFunctionUrl(
    { ...fusebitContext, body: locationBody },
    fusebitContext.fusebit.functionAccessToken,
    locationBody.boundaryId,
    integrationId
  );

  return integrationLocation;
};

const getLocationBody = (
  fusebitContext: FusebitContext,
  boundaryId: string
) => {
  const payload = Jwt.decode(fusebitContext.fusebit.functionAccessToken, {
    json: true
  });
  return {
    baseUrl: payload?.aud,
    accountId: fusebitContext.accountId,
    subscriptionId: fusebitContext.subscriptionId,
    boundaryId: boundaryId || fusebitContext.boundaryId
  };
};

export const listAllStorageKeys = async (
  fusebitContext: FusebitContext,
  storageKey: string
) => {
  const results: StorageItem[] = [];
  let storageKeys: ListStorageResult | null = await fusebitContext.storage.list(
    storageKey
  );
  while (storageKeys && storageKeys.items && storageKeys.items.length) {
    Array.prototype.push.apply(results, storageKeys.items);
    if (storageKeys.next) {
      storageKeys = await fusebitContext.storage.list(storageKey, {
        next: storageKeys.next
      });
    } else {
      storageKeys = null;
    }
  }
  return results;
};

type ApplyFunc = (sourceVal: any) => any;

type TransformOption = {
  sourceProp: string;
  applyFunc?: ApplyFunc;
  targetProp?: string;
};

/**
 *
 * @param obj any object
 * @returns whether the object is not an array and is object-like (not null and is of type 'object')
 */
const isObject = (obj: any) =>
  obj !== null && typeof obj === 'object' && !Array.isArray(obj);

/**
 *
 * @param obj an object with transformation details
 * @returns whether obj is of type TransformOption
 */
const isTransformOption = (obj: any): obj is TransformOption => {
  const isValidSourceProp =
    obj.sourceProp !== undefined && typeof obj.sourceProp === 'string';
  // allow a straight mapping of value from source to target without further transformation
  const isValidApplyFunc =
    obj.applyFunc === undefined || typeof obj.applyFunc === 'function';

  const isValidTargetProp =
    obj.targetProp === undefined || typeof obj.targetProp === 'string';

  return (
    isObject(obj) && isValidSourceProp && isValidApplyFunc && isValidTargetProp
  );
};

/**
 *
 * @param sourceProp property to retrieve from the source object
 * @param applyFunc function to apply on the value referenced by sourceProp
 * @param targetProp property to create/update on the target object
 * @returns an object of type TransformOption
 */
export const createTransformOption = (
  sourceProp: string,
  applyFunc?: ApplyFunc,
  targetProp?: string
): TransformOption => ({
  sourceProp,
  applyFunc,
  targetProp
});

/**
 * This function picks properties from an object and creates a new object with those properties
 *
 * @param {object} source object to pick props from
 * @param {TransformOption | string} props properties to pick or a TransformOption to pick and transform source val to add to target
 * @param {object} target object to receive props. Defaults to empty object.
 * @returns {object} target object with props picked from source
 *
 * Usage:
 *
 * example propsArray = ['prop1', 'prop2', 'prop3']
 *
 * pickProps(sourceObj, propsArray, targetObj)
 *
 * console.log(Object.keys(targetObj)) => ['prop1', 'prop2', 'prop3']
 *
 * You can also pass in a function to map the value of a property to another value (e.g: true -> Active)
 *
 * propsArray = ['prop1', {sourceProp: 'prop2', applyFunc: (valToMap: any) : any => 'mapped value'}] // val is the actual value from the source object
 *
 * You have the option of passing in a third value in the tuple to assign the transformed
 * value to a new prop name
 *
 * e.g. : propsArray = ['prop1', {sourceProp: 'prop2', applyFunc: (valToMap: any) : any => 'mapped value', targetProp: 'prop2Formatted'}]
 *
 * Use `createTransformOption` func to create the TransformOption
 */
export const pickProps = (
  source: { [key: string]: any },
  props: string | (string | TransformOption)[],
  target: { [key: string]: any } = {}
) => {
  if (!isObject(source) || !isObject(target)) {
    if (!isObject(source)) {
      throw new Error('source is not a plain object');
    }
    if (!isObject(target)) {
      throw new Error('target is not a plain object');
    }

    return target;
  }

  if (typeof props === 'string') {
    if (props in source) {
      target[source[props]] = source[props];
    } else {
      debug(`Invalid prop: ${props}`);
    }
  }

  if (Array.isArray(props)) {
    if (props.length < 1) {
      debug(`Empty props array`);
    }
    for (const prop of props) {
      switch (typeof prop) {
        case 'string':
          break;
        case 'object':
          if (Array.isArray(prop)) {
            break;
          }
          break;
        default:
          debug(`Invalid prop type supplied: ${prop}`);
      }

      if (typeof prop === 'string') {
        if (prop in source) {
          target[prop] = source[prop];
        } else {
          debug(`Prop not found on source object: ${prop}`);
        }
      } else if (isTransformOption(prop)) {
        const propName = prop.sourceProp;
        const func = prop.applyFunc;
        const newPropName = prop.targetProp;

        if (propName in source) {
          if (newPropName) {
            if (func !== undefined) {
              target[newPropName] = func(source[propName]);
            } else {
              target[newPropName] = source[propName];
            }
          } else {
            if (func !== undefined) {
              target[propName] = func(source[propName]);
            } else {
              target[propName] = source[propName];
            }
          }
        } else {
          debug(`Prop not found on source object: ${propName}`);
        }
      } else {
        debug(
          `Invalid individual prop: ${prop}. Expect string | TransformOption. Received ${typeof prop}.`
        );
      }
    }
  } else {
    debug(
      `Invalid 'props' argument. Expected Array or String but instead got ${typeof props}.`
    );
  }

  return target;
};
