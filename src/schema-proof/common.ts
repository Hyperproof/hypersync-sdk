import { uarApplicationSchema } from './UarApplicationProofProvider';
import { uarDirectorySchema } from './UarDirectoryProofProvider';

import { DataObject, SchemaCategory } from '@hyperproof/hypersync-models';

import { IHypersync } from '../hypersync';

const UarSchemas = {
  [SchemaCategory.UarDirectory]: uarDirectorySchema,
  [SchemaCategory.UarApplication]: uarApplicationSchema
};

export function validateDataSchema(
  hypersync: IHypersync,
  data: DataObject | DataObject[]
) {
  if (!hypersync) {
    throw new Error('hypersync is undefined.');
  }

  if (!hypersync.schemaCategory) {
    throw new Error('not of UAR type.');
  }
  // validate data object shape
  if (Array.isArray(data)) {
    for (const dataObj of data) {
      UarSchemas[hypersync.schemaCategory].validateSync(dataObj);
    }
  } else {
    UarSchemas[hypersync.schemaCategory].validateSync(data);
  }
}
