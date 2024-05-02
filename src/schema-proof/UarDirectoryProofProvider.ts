import { validateDataSchema } from './common';

import {
  HypersyncCriteria,
  HypersyncDataFormat,
  HypersyncFieldType,
  SchemaCategory
} from '@hyperproof/hypersync-models';
import { IHyperproofUser } from '@hyperproof/integration-sdk';
import { date, InferType, object, string } from 'yup';

import { DataSourceBase } from '../hypersync/DataSourceBase';
import { HypersyncTemplate } from '../hypersync/enums';
import {
  ICriteriaMetadata,
  ICriteriaPage,
  ICriteriaProvider
} from '../hypersync/ICriteriaProvider';
import { MESSAGES } from '../hypersync/messages';
import { IHypersync } from '../hypersync/models';
import { IProofFile, ProofProviderBase } from '../hypersync/ProofProviderBase';
import { IGetProofDataResponse } from '../hypersync/Sync';
import { dateToLocalizedString } from '../hypersync/time';

export const uarDirectorySchema = object({
  email: string().required(),
  name: string().required(),
  department: string().nullable(),
  jobTitle: string().nullable(),
  startDate: date().nullable(),
  managerName: string().nullable(),
  managerEmail: string().nullable()
});

export type IUarDirectory = InferType<typeof uarDirectorySchema>;

export abstract class UarDirectoryProofProvider extends ProofProviderBase {
  static override schemaCategory = SchemaCategory.UarDirectory;
  private connectorName;

  constructor(
    dataSource: DataSourceBase,
    criteriaProvider: ICriteriaProvider,
    connectorName: string
  ) {
    super(dataSource, criteriaProvider);
    this.connectorName = connectorName;
  }

  // the concrete class must implement this function and provide the criteria fields
  abstract override generateCriteriaMetadata(
    criteriaValues: HypersyncCriteria,
    pages: ICriteriaPage[]
  ): Promise<ICriteriaMetadata>;

  abstract getData(): Promise<IUarDirectory[]>;

  public async getProofData(
    hypersync: IHypersync,
    hyperproofUser: IHyperproofUser,
    authorizedUser: string,
    syncStartDate: Date
  ): Promise<IGetProofDataResponse | IProofFile[]> {
    // data available for syncing
    const data = await this.getData();

    // validate
    if (hypersync.schemaCategory) {
      validateDataSchema(hypersync, data);
    }

    const layout = this.getLayout();

    // return data in the regular proof format
    return [
      {
        filename: `${MESSAGES.UarDirectory.LabelAccessReview} - ${hypersync.settings.name}`,
        contents: {
          type: process.env.integration_type!,
          title: MESSAGES.LabelAccessReview,
          subtitle: MESSAGES.LabelAccessReview,
          userTimeZone: hyperproofUser.timeZone,
          criteria: [],
          proofFormat: hypersync.settings.proofFormat,
          template: HypersyncTemplate.UNIVERSAL,
          layout,
          proof: data,
          authorizedUser,
          collector: this.connectorName,
          collectedOn: dateToLocalizedString(
            syncStartDate,
            hyperproofUser.timeZone,
            hyperproofUser.language,
            hyperproofUser.locale
          )!
        }
      }
    ];
  }

  protected getLayout() {
    return {
      label: MESSAGES.UarDirectory.LabelAccessReview,
      format: HypersyncDataFormat.Tabular,
      fields: [
        {
          property: 'email',
          label: MESSAGES.LabelEmail,
          type: HypersyncFieldType.Text
        },
        {
          property: 'name',
          label: MESSAGES.UarDirectory.LabelName,
          type: HypersyncFieldType.Text
        },
        {
          property: 'department',
          label: MESSAGES.UarDirectory.LabelDepartment,
          type: HypersyncFieldType.Text
        },
        {
          property: 'jobTitle',
          label: MESSAGES.UarDirectory.LabelJobTitle,
          type: HypersyncFieldType.Text
        },
        {
          property: 'startDate',
          label: MESSAGES.UarDirectory.LabelStartDate,
          type: HypersyncFieldType.Date
        },
        {
          property: 'managerName',
          label: MESSAGES.UarDirectory.LabelManagerName,
          type: HypersyncFieldType.Text
        },
        {
          property: 'managerEmail',
          label: MESSAGES.UarDirectory.LabelManagerEmail,
          type: HypersyncFieldType.Text
        }
      ]
    };
  }
}
