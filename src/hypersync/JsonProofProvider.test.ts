import { ID_ALL, ID_ANY, ID_NONE, ID_UNDEFINED } from './common';
import { ICriteriaProvider } from './ICriteriaProvider';
import { DataSetResultStatus, IDataSource } from './IDataSource';
import { JsonProofProvider } from './JsonProofProvider';
import { MESSAGES } from './messages';
import { dateToLocalizedString } from './time';

import {
  HypersyncCriteriaFieldType,
  HypersyncDataFormat,
  HypersyncFieldFormat,
  HypersyncFieldType,
  HypersyncPageOrientation,
  HypersyncPeriod,
  IProofSpec
} from '@hyperproof/hypersync-models';
import {
  HypersyncProofFormat,
  HypersyncTemplate,
  IHypersync
} from '@hyperproof/hypersync-sdk/lib';
import {
  ILocalizable,
  IntegrationSettingsClass,
  ObjectType
} from '@hyperproof/integration-sdk';

const CONNECTOR_NAME = 'testConnector';
const PROOF_TYPE = 'testProofType';
const JSON_MESSAGES = {};
const DESCRIPTION = 'test description';
const PERIOD = HypersyncPeriod.Daily;
const TEST_NAME = 'testName';
const TEST_FORMAT = HypersyncDataFormat.Tabular;
const TEST_TITLE = 'testTitle';
const TEST_SUBTITLE = 'testSubtitle';
const TEST_DATASET = 'testDataSet';
const NO_RESULTS_MESSAGE = 'No results message';
const FIELD_PROPERTY = 'propertyValue';
const FIELD_LABEL = 'labelValue';
const FIELD_TYPE = HypersyncFieldType.Number;

const FIELDS = [
  {
    property: FIELD_PROPERTY,
    label: FIELD_LABEL,
    type: FIELD_TYPE
  }
];

const PROOF_SPEC = {
  period: PERIOD,
  useVersioning: false,
  suggestedName: TEST_NAME,
  format: TEST_FORMAT,
  title: TEST_TITLE,
  subtitle: TEST_SUBTITLE,
  dataSet: TEST_DATASET,
  noResultsMessage: NO_RESULTS_MESSAGE,
  fields: FIELDS
};

const CRITERIA = [
  {
    name: 'testCriterion',
    page: 0
  }
];

const DEFINITION = {
  description: DESCRIPTION,
  criteria: CRITERIA,
  proofSpec: PROOF_SPEC,
  overrides: []
};

const GET_DATA = {
  dataProperty: 'dataProperty',
  dataLabel: 'dataLabel'
};

const PROOF_CRITERIA = [
  {
    label: 'Criterion Label',
    name: 'Criterion Name',
    value: 'Criterion Value'
  }
];

const GET_DEFINITION = jest.fn().mockResolvedValue(DEFINITION);

const getHyperproofOrganization = (): ILocalizable => {
  return {
    language: 'en',
    locale: 'US',
    timeZone: 'America/Los_Angeles'
  };
};

describe('JsonProofProvider', () => {
  let criteriaProvider: ICriteriaProvider;
  let dataSource: IDataSource;

  beforeEach(() => {
    dataSource = {
      getData: jest.fn().mockResolvedValue({
        status: DataSetResultStatus.Complete,
        data: [GET_DATA]
      })
    };

    criteriaProvider = {
      generateProofCategoryField: jest.fn().mockResolvedValue({}),
      generateCriteriaFields: jest.fn().mockResolvedValue(undefined),
      generateProofCriteria: jest.fn().mockResolvedValue(PROOF_CRITERIA)
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('initializes correctly', () => {
    // Arrange
    // Act
    const provider = new JsonProofProvider(
      CONNECTOR_NAME,
      PROOF_TYPE,
      dataSource,
      criteriaProvider,
      JSON_MESSAGES,
      GET_DEFINITION
    );

    // Assert
    expect(provider).toBeDefined();
    expect(provider['connectorName']).toEqual(CONNECTOR_NAME);
    expect(provider['proofType']).toEqual(PROOF_TYPE);
    expect(provider['dataSource']).toEqual(dataSource);
    expect(provider['criteriaProvider']).toEqual(criteriaProvider);
    expect(provider['messages']).toEqual(JSON_MESSAGES);
    expect(provider['getDefinition']).toEqual(GET_DEFINITION);
  });

  describe('is initialized and', () => {
    const FORMATTED = 'Formatted';
    let provider: JsonProofProvider;

    beforeEach(() => {
      provider = new JsonProofProvider(
        CONNECTOR_NAME,
        PROOF_TYPE,
        dataSource,
        criteriaProvider,
        JSON_MESSAGES,
        GET_DEFINITION
      );
    });

    describe('generateCriteriaMetadata', () => {
      beforeEach(() => {
        provider['initTokenContext'] = jest.fn().mockReturnValue({});
        provider['buildProofSpec'] = jest.fn().mockReturnValue(PROOF_SPEC);
        provider['findCriteriaLabels'] = jest.fn().mockReturnValue({});
      });

      it('returns pages with default values when last page is not valid', async () => {
        // Arrange
        const criteriaValues = {};
        const pages = [
          {
            fields: [],
            isValid: true
          },
          {
            fields: [],
            isValid: false
          }
        ];

        const expectedMetadata = {
          pages: pages,
          period: HypersyncPeriod.Monthly,
          useVersioning: false,
          suggestedName: '',
          description: DESCRIPTION,
          enableExcelOutput: true
        };

        // Act
        const criteriaMetadata = await provider.generateCriteriaMetadata(
          criteriaValues,
          pages
        );

        // Assert
        expect(criteriaMetadata).toBeDefined();
        expect(criteriaMetadata).toEqual(expectedMetadata);
      });

      it('returns page with specified values when last page is valid', async () => {
        // Arrange
        const criteriaValues = {};
        const pages = [
          {
            fields: [],
            isValid: false
          },
          {
            fields: [],
            isValid: true
          }
        ];

        const expectedMetadata = {
          pages: pages,
          period: PERIOD,
          useVersioning: false,
          suggestedName: TEST_NAME,
          description: DESCRIPTION,
          enableExcelOutput: true
        };

        // Act
        const criteriaMetadata = await provider.generateCriteriaMetadata(
          criteriaValues,
          pages
        );

        // Assert
        expect(criteriaMetadata).toBeDefined();
        expect(criteriaMetadata).toEqual(expectedMetadata);
      });
    });

    describe('generateSchema', () => {
      const criteriaValues = {};

      beforeEach(() => {
        provider['initTokenContext'] = jest.fn().mockReturnValue({});
      });

      it('returns appropriate values from proof spec', async () => {
        // Arrange
        provider['buildProofSpec'] = jest.fn().mockReturnValue(PROOF_SPEC);

        const expectedSchema = {
          format: PROOF_SPEC.format,
          isHierarchical: false,
          fields: [
            {
              property: FIELD_PROPERTY,
              label: FIELD_LABEL,
              type: FIELD_TYPE
            }
          ]
        };

        // Act
        const schema = await provider.generateSchema(criteriaValues);

        // Assert
        expect(schema).toBeDefined();
        expect(schema).toEqual(expectedSchema);
      });

      it('returns appropriate values from proof spec but no field type', async () => {
        // Arrange
        const proofSpec = {
          ...PROOF_SPEC,
          fields: [
            {
              property: FIELD_PROPERTY,
              label: FIELD_LABEL
            }
          ]
        };

        provider['buildProofSpec'] = jest.fn().mockReturnValue(proofSpec);

        const expectedSchema = {
          format: PROOF_SPEC.format,
          isHierarchical: false,
          fields: [
            {
              property: FIELD_PROPERTY,
              label: FIELD_LABEL,
              type: HypersyncFieldType.Text
            }
          ]
        };

        // Act
        const schema = await provider.generateSchema(criteriaValues);

        // Assert
        expect(schema).toBeDefined();
        expect(schema).toEqual(expectedSchema);
      });
    });

    describe('getProofData', () => {
      const field = {
        property: FIELD_PROPERTY,
        label: FIELD_LABEL,
        type: HypersyncFieldType.Number,
        width: '100px'
      };
      const proofSpec = {
        ...PROOF_SPEC,
        orientation: HypersyncPageOrientation.Landscape,
        fields: [field]
      };

      const hypersync = buildHypersync();
      const organization = getHyperproofOrganization();
      const authorizedUser = 'authorizedUser';
      const syncStartDate = new Date();

      beforeEach(() => {
        provider['getDefinition'] = jest.fn().mockResolvedValue(DEFINITION);
        provider['initTokenContext'] = jest.fn().mockReturnValue({});
        provider['buildProofSpec'] = jest.fn().mockReturnValue(proofSpec);
        provider['fetchLookups'] = jest.fn();
        provider['addFormattedDates'] = jest.fn();
        provider['addFormattedNumbers'] = jest.fn();
      });

      it('returns empty array and getData status if getData does not complete', async () => {
        // Arrange
        dataSource = {
          getData: jest.fn().mockResolvedValue({
            status: DataSetResultStatus.Pending
          })
        };
        const provider = new JsonProofProvider(
          CONNECTOR_NAME,
          PROOF_TYPE,
          dataSource,
          criteriaProvider,
          JSON_MESSAGES,
          GET_DEFINITION
        );
        provider['getDefinition'] = jest.fn().mockResolvedValue({});
        provider['initTokenContext'] = jest.fn().mockReturnValue({});
        provider['buildProofSpec'] = jest.fn().mockReturnValue({});
        provider['fetchLookups'] = jest.fn();

        const expectedProofData = {
          status: DataSetResultStatus.Pending,
          data: []
        };

        // Act
        const proofData = await provider.getProofData(
          hypersync,
          organization,
          authorizedUser,
          syncStartDate
        );

        // Assert
        expect(proofData).toBeDefined();
        expect(proofData).toEqual(expectedProofData);
        expect(provider['getDefinition']).toHaveBeenCalled();
        expect(provider['initTokenContext']).toHaveBeenCalled();
        expect(provider['buildProofSpec']).toHaveBeenCalled();
        expect(provider['fetchLookups']).toHaveBeenCalled();
      });

      it('calls addFormattedNumbers if field includes numbers', async () => {
        // Arrange
        const expectedProofData = buildExpectedProofData(
          proofSpec,
          hypersync,
          organization,
          syncStartDate,
          authorizedUser
        );

        // Act
        const proofData = await provider.getProofData(
          hypersync,
          organization,
          authorizedUser,
          syncStartDate
        );

        // Assert
        expect(proofData).toBeDefined();
        expect(proofData).toEqual(expectedProofData);

        expect(provider['getDefinition']).toHaveBeenCalled();
        expect(provider['initTokenContext']).toHaveBeenCalled();
        expect(provider['buildProofSpec']).toHaveBeenCalled();
        expect(provider['fetchLookups']).toHaveBeenCalled();
        expect(provider['addFormattedDates']).not.toHaveBeenCalled();
        expect(provider['addFormattedNumbers']).toHaveBeenCalled();
      });

      it('calls addFormattedDates if field includes dates', async () => {
        // Arrange
        const field = {
          property: FIELD_PROPERTY,
          label: FIELD_LABEL,
          type: HypersyncFieldType.Date,
          width: '100px'
        };
        const proofSpec = {
          ...PROOF_SPEC,
          orientation: HypersyncPageOrientation.Landscape,
          fields: [field]
        };
        provider['buildProofSpec'] = jest.fn().mockReturnValue(proofSpec);

        const expectedProofData = buildExpectedProofData(
          proofSpec,
          hypersync,
          organization,
          syncStartDate,
          authorizedUser
        );

        // Act
        const proofData = await provider.getProofData(
          hypersync,
          organization,
          authorizedUser,
          syncStartDate
        );

        // Assert
        expect(proofData).toBeDefined();
        expect(proofData).toEqual(expectedProofData);

        expect(provider['getDefinition']).toHaveBeenCalled();
        expect(provider['initTokenContext']).toHaveBeenCalled();
        expect(provider['buildProofSpec']).toHaveBeenCalled();
        expect(provider['fetchLookups']).toHaveBeenCalled();
        expect(provider['addFormattedDates']).toHaveBeenCalled();
        expect(provider['addFormattedNumbers']).not.toHaveBeenCalled();
      });

      it('calls both addFormattedNumbers and addFormattedDates if field includes both', async () => {
        // Arrange
        const field = [
          {
            property: FIELD_PROPERTY,
            label: FIELD_LABEL,
            type: HypersyncFieldType.Number,
            width: '100px'
          },
          {
            property: FIELD_PROPERTY,
            label: FIELD_LABEL,
            type: HypersyncFieldType.Date,
            width: '100px'
          }
        ];
        const proofSpec = {
          ...PROOF_SPEC,
          orientation: HypersyncPageOrientation.Landscape,
          fields: field
        };
        provider['buildProofSpec'] = jest.fn().mockReturnValue(proofSpec);

        const expectedProofData = buildExpectedProofData(
          proofSpec,
          hypersync,
          organization,
          syncStartDate,
          authorizedUser
        );

        // Act
        const proofData = await provider.getProofData(
          hypersync,
          organization,
          authorizedUser,
          syncStartDate
        );

        // Assert
        expect(proofData).toBeDefined();
        expect(proofData).toEqual(expectedProofData);

        expect(provider['getDefinition']).toHaveBeenCalled();
        expect(provider['initTokenContext']).toHaveBeenCalled();
        expect(provider['buildProofSpec']).toHaveBeenCalled();
        expect(provider['fetchLookups']).toHaveBeenCalled();
        expect(provider['addFormattedDates']).toHaveBeenCalled();
        expect(provider['addFormattedNumbers']).toHaveBeenCalled();
      });

      it('calls neither addFormatedNumbers and addFormattedDates if field includes neither', async () => {
        // Arrange
        const field = {
          property: FIELD_PROPERTY,
          label: FIELD_LABEL,
          type: HypersyncFieldType.Boolean,
          width: '100px'
        };
        const proofSpec = {
          ...PROOF_SPEC,
          orientation: HypersyncPageOrientation.Landscape,
          fields: [field]
        };
        provider['buildProofSpec'] = jest.fn().mockReturnValue(proofSpec);

        const expectedProofData = buildExpectedProofData(
          proofSpec,
          hypersync,
          organization,
          syncStartDate,
          authorizedUser
        );

        // Act
        const proofData = await provider.getProofData(
          hypersync,
          organization,
          authorizedUser,
          syncStartDate
        );

        // Assert
        expect(proofData).toBeDefined();
        expect(proofData).toEqual(expectedProofData);

        expect(provider['getDefinition']).toHaveBeenCalled();
        expect(provider['initTokenContext']).toHaveBeenCalled();
        expect(provider['buildProofSpec']).toHaveBeenCalled();
        expect(provider['fetchLookups']).toHaveBeenCalled();
        expect(provider['addFormattedDates']).not.toHaveBeenCalled();
        expect(provider['addFormattedNumbers']).not.toHaveBeenCalled();
      });

      it('returns empty array for criteria if page is included', async () => {
        // Arrange
        const page = 'page';

        const builtProofData = buildExpectedProofData(
          proofSpec,
          hypersync,
          organization,
          syncStartDate,
          authorizedUser
        );
        const expectedProofData = {
          ...builtProofData,
          data: [
            {
              ...builtProofData.data[0],
              contents: {
                ...builtProofData.data[0].contents,
                criteria: []
              }
            }
          ]
        };

        // Act
        const proofData = await provider.getProofData(
          hypersync,
          organization,
          authorizedUser,
          syncStartDate,
          page
        );

        // Assert
        expect(proofData).toBeDefined();
        expect(proofData).toEqual(expectedProofData);

        expect(provider['getDefinition']).toHaveBeenCalled();
        expect(provider['initTokenContext']).toHaveBeenCalled();
        expect(provider['buildProofSpec']).toHaveBeenCalled();
        expect(provider['fetchLookups']).toHaveBeenCalled();
      });

      it('returns proof as array even when getData is not an array', async () => {
        // Arrange
        const getDataData = {
          dataProperty: 'dataProperty',
          dataLabel: 'dataLabel'
        };
        dataSource = {
          getData: jest.fn().mockResolvedValue({
            status: DataSetResultStatus.Complete,
            data: getDataData
          })
        };
        const provider = new JsonProofProvider(
          CONNECTOR_NAME,
          PROOF_TYPE,
          dataSource,
          criteriaProvider,
          JSON_MESSAGES,
          GET_DEFINITION
        );
        provider['getDefinition'] = jest.fn().mockResolvedValue(DEFINITION);
        provider['initTokenContext'] = jest.fn().mockReturnValue({});
        provider['buildProofSpec'] = jest.fn().mockReturnValue(proofSpec);
        provider['fetchLookups'] = jest.fn();

        const expectedProofData = buildExpectedProofData(
          proofSpec,
          hypersync,
          organization,
          syncStartDate,
          authorizedUser
        );

        // Act
        const proofData = await provider.getProofData(
          hypersync,
          organization,
          authorizedUser,
          syncStartDate
        );

        // Assert
        expect(proofData).toBeDefined();
        expect(proofData).toEqual(expectedProofData);

        expect(provider['getDefinition']).toHaveBeenCalled();
        expect(provider['initTokenContext']).toHaveBeenCalled();
        expect(provider['buildProofSpec']).toHaveBeenCalled();
        expect(provider['fetchLookups']).toHaveBeenCalled();
      });

      it('returns an empty proof and no result message if data is empty array', async () => {
        // Arrange
        dataSource = {
          getData: jest.fn().mockResolvedValue({
            status: DataSetResultStatus.Complete,
            data: []
          })
        };
        const provider = new JsonProofProvider(
          CONNECTOR_NAME,
          PROOF_TYPE,
          dataSource,
          criteriaProvider,
          JSON_MESSAGES,
          GET_DEFINITION
        );
        provider['getDefinition'] = jest.fn().mockResolvedValue(DEFINITION);
        provider['initTokenContext'] = jest.fn().mockReturnValue({});
        provider['buildProofSpec'] = jest.fn().mockReturnValue(proofSpec);
        provider['fetchLookups'] = jest.fn();

        const builtProofData = buildExpectedProofData(
          proofSpec,
          hypersync,
          organization,
          syncStartDate,
          authorizedUser
        );
        const expectedProofData = {
          ...builtProofData,
          data: [
            {
              ...builtProofData.data[0],
              contents: {
                ...builtProofData.data[0].contents,
                layout: {
                  ...builtProofData.data[0].contents.layout,
                  noResultsMessage: NO_RESULTS_MESSAGE
                },
                proof: []
              }
            }
          ]
        };

        // Act
        const proofData = await provider.getProofData(
          hypersync,
          organization,
          authorizedUser,
          syncStartDate
        );

        // Assert
        expect(proofData).toBeDefined();
        expect(proofData).toEqual(expectedProofData);

        expect(provider['getDefinition']).toHaveBeenCalled();
        expect(provider['initTokenContext']).toHaveBeenCalled();
        expect(provider['buildProofSpec']).toHaveBeenCalled();
        expect(provider['fetchLookups']).toHaveBeenCalled();
      });

      function buildHypersync(): IHypersync {
        const hypersyncSettingsClass: IntegrationSettingsClass.Hypersync =
          IntegrationSettingsClass.Hypersync;
        return {
          id: 'hypersyncId',
          appId: 'appId',
          objectId: 'objectId',
          objectType: ObjectType.LABEL,
          orgId: 'orgId',
          createdBy: 'hypersyncAuthor',
          createdOn: '2020-01-01T00:00:00Z',
          updatedBy: 'otherAuthor',
          updatedOn: '2021-01-01T00:00:00Z',
          settings: {
            class: hypersyncSettingsClass,
            vendorUserId: 'vendorUserId',
            name: 'hypersyncName',
            criteria: {},
            isAutomatic: false,
            period: HypersyncPeriod.Monthly,
            useVersioning: false,
            proofFormat: HypersyncProofFormat.PDF,
            isEnabled: true
          }
        };
      }

      function buildExpectedProofData(
        proofSpec: IProofSpec,
        hypersync: IHypersync,
        organization: ILocalizable,
        syncStartDate: Date,
        authorizedUser: string
      ) {
        return {
          nextPage: undefined,
          data: [
            {
              filename: hypersync.settings.name,
              contents: {
                type: process.env.integration_type!,
                title: proofSpec.title,
                subtitle: proofSpec.subtitle,
                source: undefined,
                orientation: proofSpec.orientation,
                userTimeZone: organization.timeZone,
                criteria: PROOF_CRITERIA,
                proofFormat: hypersync.settings.proofFormat,
                template: HypersyncTemplate.UNIVERSAL,
                layout: {
                  format: proofSpec.format,
                  noResultsMessage: '',
                  fields: proofSpec.fields
                },
                proof: [GET_DATA],
                authorizedUser,
                collector: CONNECTOR_NAME,
                collectedOn: dateToLocalizedString(
                  syncStartDate,
                  organization.timeZone,
                  organization.language,
                  organization.locale
                )!,
                errorInfo: undefined,
                zoom: 1
              }
            }
          ]
        };
      }
    });

    describe('initTokenContext', () => {
      // There is no logic in this function, so just testing that we get the correct data back
      it('returns appropriate values', () => {
        // Arrange
        const criteriaValues = {
          proofType: PROOF_TYPE,
          name: 'criterionValue'
        };

        const expectedContext = {
          messages: JSON_MESSAGES,
          constants: {
            ID_ALL: ID_ALL,
            ID_ANY: ID_ANY,
            ID_NONE: ID_NONE,
            ID_UNDEFINED: ID_UNDEFINED
          },
          criteria: criteriaValues,
          lookups: {}
        };

        // Act
        const tokenContext = provider['initTokenContext'](criteriaValues);

        // Assert
        expect(tokenContext).toBeDefined();
        expect(tokenContext).toEqual(expectedContext);
      });
    });

    describe('buildProofSpec', () => {
      const tokenContext = {};

      it('returns proof spec when no override', () => {
        // Arrange
        const expectedProofSpec = {
          ...PROOF_SPEC
        };

        // Act
        const proofSpec = provider['buildProofSpec'](DEFINITION, tokenContext);

        // Assert
        expect(proofSpec).toBeDefined();
        expect(proofSpec).toEqual(expectedProofSpec);
      });

      it('returns proof spec with appropriate overridden values', () => {
        // Arrange
        const overrideString = 'override';
        const overrides = [
          {
            condition: {
              value: overrideString,
              criteria: overrideString
            },
            proofSpec: {
              useVersioning: !PROOF_SPEC.useVersioning
            }
          }
        ];
        const definition = {
          ...DEFINITION,
          overrides: overrides
        };

        const expectedProofSpec = {
          ...PROOF_SPEC,
          useVersioning: !PROOF_SPEC.useVersioning
        };

        // Act
        const proofSpec = provider['buildProofSpec'](definition, tokenContext);

        // Assert
        expect(proofSpec).toBeDefined();
        expect(proofSpec).toEqual(expectedProofSpec);
      });

      it('returns appropriate message when no noResultsMessage given', () => {
        // Arrange
        const definitionProofSpec = {
          ...PROOF_SPEC,
          noResultsMessage: undefined
        };
        const definition = {
          ...DEFINITION,
          proofSpec: definitionProofSpec
        };

        const expectedProofSpec = {
          ...PROOF_SPEC,
          noResultsMessage: MESSAGES.Default.NoResultsMessage
        };

        // Act
        const proofSpec = provider['buildProofSpec'](definition, tokenContext);

        // Assert
        expect(proofSpec).toBeDefined();
        expect(proofSpec).toEqual(expectedProofSpec);
      });

      it('returns proof spec with appropriate overridden dataSetParams', () => {
        // Arrange
        const overrideString = 'override';
        const overrides = [
          {
            condition: {
              value: overrideString,
              criteria: overrideString
            },
            proofSpec: {
              dataSetParams: {
                param1: 'value1'
              }
            }
          }
        ];
        const definition = {
          ...DEFINITION,
          proofSpec: {
            ...DEFINITION.proofSpec,
            dataSetParams: {
              param1: 'oldValue',
              param2: 'value2'
            }
          },
          overrides: overrides
        };

        const expectedProofSpec = {
          ...PROOF_SPEC,
          dataSetParams: {
            param1: 'value1',
            param2: 'value2'
          }
        };

        // Act
        const proofSpec = provider['buildProofSpec'](definition, tokenContext);

        // Assert
        expect(proofSpec).toBeDefined();
        expect(proofSpec).toEqual(expectedProofSpec);
      });
    });

    describe('fetchLookups', () => {
      const tokenContext = {};

      it('does not change the tokenContext if there are no lookups', async () => {
        // Arrange
        const expectedTokenContext = {};

        // Act
        await provider['fetchLookups'](PROOF_SPEC, tokenContext);

        // Assert
        expect(tokenContext).toEqual(expectedTokenContext);
      });

      it('does not change the tokenContext if lookups is an empty array', async () => {
        // Arrange
        const proofSpec = {
          ...PROOF_SPEC,
          lookups: []
        };

        const expectedTokenContext = {};

        // Act
        await provider['fetchLookups'](proofSpec, tokenContext);

        // Assert
        expect(tokenContext).toEqual(expectedTokenContext);
      });

      it('throws an error if getData does not complete', async () => {
        // Arrange
        const proofSpec = {
          ...PROOF_SPEC,
          lookups: [
            {
              name: 'lookupName',
              dataSet: 'dataSetName'
            }
          ]
        };

        dataSource = {
          getData: jest.fn().mockResolvedValue({
            status: DataSetResultStatus.Pending,
            data: []
          })
        };
        provider = new JsonProofProvider(
          CONNECTOR_NAME,
          PROOF_TYPE,
          dataSource,
          criteriaProvider,
          JSON_MESSAGES,
          GET_DEFINITION
        );

        const expectedTokenContext = {};

        // Act
        try {
          await provider['fetchLookups'](proofSpec, tokenContext);
          expect(false).toBeTruthy();
        } catch (error) {
          expect(error.message).toEqual(
            `Pending response received for proof specification lookup data set: ${proofSpec.lookups[0].dataSet}`
          );
        }

        // Assert
        expect(tokenContext).toEqual(expectedTokenContext);
      });

      it('adds values from getData lookups to tokenContext lookups', async () => {
        // Arrange
        const lookupFromGetData = {
          name: 'dataName',
          dataSet: 'dataDataSet'
        };
        const lookupFromSpec = {
          name: 'specName',
          dataSet: 'specDataSet'
        };
        const lookupExisting = {
          name: 'existingName',
          dataSet: 'existingDataSet'
        };
        dataSource = {
          getData: jest.fn().mockResolvedValue({
            status: DataSetResultStatus.Complete,
            data: [lookupFromGetData]
          })
        };
        provider = new JsonProofProvider(
          CONNECTOR_NAME,
          PROOF_TYPE,
          dataSource,
          criteriaProvider,
          JSON_MESSAGES,
          GET_DEFINITION
        );

        const tokenContext = {
          lookups: {
            existing: [lookupExisting]
          }
        };
        const proofSpec = {
          ...PROOF_SPEC,
          lookups: [lookupFromSpec]
        };

        const expectedTokenContext = {
          lookups: {
            existing: [lookupExisting],
            [lookupFromSpec.name]: [lookupFromGetData]
          }
        };

        // Act
        await provider['fetchLookups'](proofSpec, tokenContext);

        // Assert
        expect(tokenContext).toEqual(expectedTokenContext);
      });
    });

    describe('findCriteriaLabels', () => {
      const page = {
        fields: [
          {
            name: 'page',
            type: HypersyncCriteriaFieldType.Text,
            label: 'pageLabel',
            options: [
              {
                value: 'optionValue',
                label: 'optionLabel'
              }
            ]
          }
        ],
        isValid: true
      };
      const pages = [page];

      it('returns an empty object if no criteria are passed in', () => {
        // Arrange
        const expectedCriteriaLabels = {};

        // Act
        const criteriaLabels = provider['findCriteriaLabels'](pages);

        // Assert
        expect(criteriaLabels).toBeDefined();
        expect(criteriaLabels).toEqual(expectedCriteriaLabels);
      });

      it('returns an empty object if an empty criteria are passed in', () => {
        // Arrange
        const criteria = {};

        const expectedCriteriaLabels = {};

        // Act
        const criteriaLabels = provider['findCriteriaLabels'](pages, criteria);

        // Assert
        expect(criteriaLabels).toBeDefined();
        expect(criteriaLabels).toEqual(expectedCriteriaLabels);
      });

      it('returns an empty object if no field matches the criteria', () => {
        // Arrange
        const criteria = {
          mismatchedPage: 'optionValue'
        };

        const expectedCriteriaLabels = {};

        // Act
        const criteriaLabels = provider['findCriteriaLabels'](pages, criteria);

        // Assert
        expect(criteriaLabels).toBeDefined();
        expect(criteriaLabels).toEqual(expectedCriteriaLabels);
      });

      it('returns an empty object if matching page has no options', () => {
        // Arrange
        const expectedCriteriaName = 'page';

        const page = {
          fields: [
            {
              name: expectedCriteriaName,
              type: HypersyncCriteriaFieldType.Text,
              label: 'pageLabel'
            }
          ],
          isValid: true
        };
        const pages = [page];

        const criteria = {
          [expectedCriteriaName]: 'pageOptionValue'
        };

        const expectedCriteriaLabels = {};

        // Act
        const criteriaLabels = provider['findCriteriaLabels'](pages, criteria);

        // Assert
        expect(criteriaLabels).toBeDefined();
        expect(criteriaLabels).toEqual(expectedCriteriaLabels);
      });

      it('returns appropriate values if good criteria are passed in', () => {
        // Arrange
        const expectedCriteriaName = 'page';
        const criteriaLookupName = 'pageOptionValue';
        const expectedCriteriaValue = 'pageOptionLabel';

        const page = {
          fields: [
            {
              name: expectedCriteriaName,
              type: HypersyncCriteriaFieldType.Text,
              label: 'pageLabel',
              options: [
                {
                  value: criteriaLookupName,
                  label: expectedCriteriaValue
                }
              ]
            }
          ],
          isValid: true
        };
        const pages = [page];

        const criteria = {
          [expectedCriteriaName]: criteriaLookupName
        };

        const expectedCriteriaLabels = {
          [expectedCriteriaName]: expectedCriteriaValue
        };

        // Act
        const criteriaLabels = provider['findCriteriaLabels'](pages, criteria);

        // Assert
        expect(criteriaLabels).toBeDefined();
        expect(criteriaLabels).toEqual(expectedCriteriaLabels);
      });
    });

    describe('addFormattedValues', () => {
      const organization = getHyperproofOrganization();
      const proofRow = {
        row: 'value'
      };
      const dateFields = [];
      const numberFields = [];
      const addFormattedDates = jest.fn();
      const addFormattedNumbers = jest.fn();

      beforeEach(() => {
        provider['addFormattedDates'] = addFormattedDates;
        provider['addFormattedNumbers'] = addFormattedNumbers;
      });

      it('does nothing if no dates or numbers are passed in', () => {
        // Arrange
        // Act
        provider['addFormattedValues'](
          proofRow,
          dateFields,
          numberFields,
          organization
        );

        // Assert
        expect(addFormattedDates).not.toHaveBeenCalled();
        expect(addFormattedNumbers).not.toHaveBeenCalled();
      });

      it('calls addFormattedDates if dates are passed in', () => {
        // Arrange
        const dateFields = [
          {
            property: 'dateField',
            label: 'Date Field'
          }
        ];

        // Act
        provider['addFormattedValues'](
          proofRow,
          dateFields,
          numberFields,
          organization
        );

        // Assert
        expect(addFormattedDates).toHaveBeenCalledWith(
          proofRow,
          dateFields,
          organization
        );
        expect(addFormattedNumbers).not.toHaveBeenCalled();
      });

      it('calls addFormattedNumbers if numbers are passed in', () => {
        // Arrange
        const numberFields = [
          {
            property: 'numberField',
            label: 'Number Field'
          }
        ];

        // Act
        provider['addFormattedValues'](
          proofRow,
          dateFields,
          numberFields,
          organization
        );

        // Assert
        expect(addFormattedDates).not.toHaveBeenCalled();
        expect(addFormattedNumbers).toHaveBeenCalledWith(
          proofRow,
          numberFields
        );
      });

      it('calls both if dates and numbers are passed in', () => {
        // Arrange
        const dateFields = [
          {
            property: 'dateField',
            label: 'Date Field'
          }
        ];
        const numberFields = [
          {
            property: 'numberField',
            label: 'Number Field'
          }
        ];

        // Act
        provider['addFormattedValues'](
          proofRow,
          dateFields,
          numberFields,
          organization
        );

        // Assert
        expect(addFormattedDates).toHaveBeenCalledWith(
          proofRow,
          dateFields,
          organization
        );
        expect(addFormattedNumbers).toHaveBeenCalledWith(
          proofRow,
          numberFields
        );
      });
    });

    describe('addFormattedDates', () => {
      const organization = getHyperproofOrganization();
      const rowName = 'rowName';
      const dateFields = [
        {
          property: rowName,
          label: 'Date Field'
        }
      ];

      it('does nothing if proof row is already formatted', () => {
        // Arrange
        const rowValue = '2020-01-01T00:00:00Z';
        const proofRow = {
          [rowName + FORMATTED]: rowValue
        };

        const expectedProofRow = {
          [rowName + FORMATTED]: rowValue
        };

        // Act
        provider['addFormattedDates'](proofRow, dateFields, organization);

        // Assert
        expect(proofRow).toEqual(expectedProofRow);
      });

      it('does nothing if proof row value is not a date or string', () => {
        // Arrange
        const rowValue = 123;
        const proofRow = {
          [rowName]: rowValue
        };

        const expectedProofRow = {
          [rowName]: rowValue
        };

        // Act
        provider['addFormattedDates'](proofRow, dateFields, organization);

        // Assert
        expect(proofRow).toEqual(expectedProofRow);
      });

      it('formats date if it is a string', () => {
        // Arrange
        const rowValue = '2020-01-01T00:00:00Z';
        const proofRow = {
          [rowName]: rowValue
        };

        const expectedDate = dateToLocalizedString(
          new Date(rowValue),
          organization.timeZone,
          organization.language,
          organization.locale
        );
        const expectedProofRow = {
          [rowName]: rowValue,
          [rowName + FORMATTED]: expectedDate
        };

        // Act
        provider['addFormattedDates'](proofRow, dateFields, organization);

        // Assert
        expect(proofRow).toEqual(expectedProofRow);
      });

      it('formats date if it is Date object', () => {
        // Arrange
        const rowValue = new Date('2020-01-01T00:00:00Z');
        const proofRow = {
          [rowName]: rowValue
        };

        const expectedDate = dateToLocalizedString(
          new Date(rowValue),
          organization.timeZone,
          organization.language,
          organization.locale
        );
        const expectedProofRow = {
          [rowName]: rowValue,
          [rowName + FORMATTED]: expectedDate
        };

        // Act
        provider['addFormattedDates'](proofRow, dateFields, organization);

        // Assert
        expect(proofRow).toEqual(expectedProofRow);
      });
    });

    describe('addFormattedNumbers', () => {
      const rowName = 'rowName';
      const numberFields = [
        {
          property: rowName,
          label: 'Number Field'
        }
      ];

      it('does nothing if proof row is already formatted', () => {
        // Arrange
        const rowValue = 123;
        const proofRow = {
          [rowName + FORMATTED]: rowValue
        };

        const formatNumber = jest.fn();
        provider['formatNumber'] = formatNumber;

        const expectedProofRow = {
          [rowName + FORMATTED]: rowValue
        };

        // Act
        provider['addFormattedNumbers'](proofRow, numberFields);

        // Assert
        expect(proofRow).toEqual(expectedProofRow);
        expect(formatNumber).not.toHaveBeenCalled();
      });

      it('does nothing if proof row value is not a number', () => {
        // Arrange
        const rowValue = '123';
        const proofRow = {
          [rowName]: rowValue
        };

        const formatNumber = jest.fn().mockReturnValue(rowValue);
        provider['formatNumber'] = formatNumber;

        const expectedProofRow = {
          [rowName]: rowValue
        };

        // Act
        provider['addFormattedNumbers'](proofRow, numberFields);

        // Assert
        expect(proofRow).toEqual(expectedProofRow);
        expect(formatNumber).not.toHaveBeenCalled();
      });

      it('formats number to a string if it is a number', () => {
        // Arrange
        const rowValue = 123;
        const proofRow = {
          [rowName]: rowValue
        };

        const formatNumber = jest.fn().mockReturnValue(rowValue.toString());
        provider['formatNumber'] = formatNumber;

        const expectedProofRow = {
          [rowName]: rowValue,
          [rowName + FORMATTED]: rowValue.toString()
        };

        // Act
        provider['addFormattedNumbers'](proofRow, numberFields);

        // Assert
        expect(formatNumber).toHaveBeenCalledWith(rowValue, numberFields[0]);
        expect(proofRow).toEqual(expectedProofRow);
      });
    });

    describe('formatNumber', () => {
      it('returns number as a string', () => {
        // Arrange
        const value = 123;
        const numberField = {
          property: 'numberField',
          label: 'Number Field'
        };

        const expectedValue = value.toString();

        // Act
        const returnedValue = provider['formatNumber'](value, numberField);

        // Assert
        expect(returnedValue).toBeDefined();
        expect(returnedValue).toEqual(expectedValue);
      });

      it('returns number as a two-digit percent if format is percent', () => {
        // Arrange
        const value = 12;
        const numberField = {
          property: 'numberField',
          label: 'Number Field',
          format: HypersyncFieldFormat.Percent
        };

        const expectedValue = '12.00%';

        // Act
        const returnedValue = provider['formatNumber'](value, numberField);

        // Assert
        expect(returnedValue).toBeDefined();
        expect(returnedValue).toEqual(expectedValue);
      });

      it('returns number as a two-digit percent if format is percent', () => {
        // Arrange
        const value = 12.34;
        const numberField = {
          property: 'numberField',
          label: 'Number Field',
          format: HypersyncFieldFormat.Percent
        };

        const expectedValue = '12.34%';

        // Act
        const returnedValue = provider['formatNumber'](value, numberField);

        // Assert
        expect(returnedValue).toBeDefined();
        expect(returnedValue).toEqual(expectedValue);
      });

      it('returns number as rounded two-digit percent if format is percent', () => {
        // Arrange
        const value = 12.349;
        const numberField = {
          property: 'numberField',
          label: 'Number Field',
          format: HypersyncFieldFormat.Percent
        };

        const expectedValue = '12.35%';

        // Act
        const returnedValue = provider['formatNumber'](value, numberField);

        // Assert
        expect(returnedValue).toBeDefined();
        expect(returnedValue).toEqual(expectedValue);
      });

      it('returns 0% if number is 0 and format is percent', () => {
        // Arrange
        const value = 0;
        const numberField = {
          property: 'numberField',
          label: 'Number Field',
          format: HypersyncFieldFormat.Percent
        };

        const expectedValue = '0%';

        // Act
        const returnedValue = provider['formatNumber'](value, numberField);

        // Assert
        expect(returnedValue).toBeDefined();
        expect(returnedValue).toEqual(expectedValue);
      });

      it('returns empty string if number is not actually a number and format is percent', () => {
        // Arrange
        const value = undefined;
        const numberField = {
          property: 'numberField',
          label: 'Number Field',
          format: HypersyncFieldFormat.Percent
        };

        const expectedValue = '';

        // Act
        const returnedValue = provider['formatNumber'](value, numberField);

        // Assert
        expect(returnedValue).toBeDefined();
        expect(returnedValue).toEqual(expectedValue);
      });
    });
  });
});
