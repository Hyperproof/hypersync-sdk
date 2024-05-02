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

export const uarApplicationSchema = object({
  email: string(),
  username: string(),
  owner: string().required(),
  role: string(),
  groups: string(),
  lastLogin: date().nullable()
});

export type IUarApplication = InferType<typeof uarApplicationSchema>;

export abstract class UarApplicationProofProvider extends ProofProviderBase {
  static override schemaCategory = SchemaCategory.UarApplication;
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

  abstract getData(): Promise<IUarApplication[]>;

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
        filename: `${MESSAGES.UarApplication.LabelAccessReview} - ${hypersync.settings.name}`,
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
      label: MESSAGES.UarApplication.LabelAccessReview,
      format: HypersyncDataFormat.Tabular,
      fields: [
        {
          property: 'email',
          label: MESSAGES.LabelEmail,
          type: HypersyncFieldType.Text
        },
        {
          property: 'groups',
          label: MESSAGES.UarApplication.LabelGroups,
          type: HypersyncFieldType.Text
        },
        {
          property: 'lastLogin',
          label: MESSAGES.UarApplication.LabelLastLogin,
          type: HypersyncFieldType.Date
        },
        {
          property: 'owner',
          label: MESSAGES.UarApplication.LabelOwner,
          type: HypersyncFieldType.Text
        },
        {
          property: 'role',
          label: MESSAGES.UarApplication.LabelRole,
          type: HypersyncFieldType.Text
        },
        {
          property: 'username',
          label: MESSAGES.UarApplication.LabelUserName,
          type: HypersyncFieldType.Text
        }
      ]
    };
  }
}
