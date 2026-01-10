import {
  HypersyncApp,
  HypersyncAppConnector,
  IHypersyncAppConfig
} from './HypersyncApp';
import { ICriteriaPage, ICriteriaProvider } from './ICriteriaProvider';
import { IDataSource } from './IDataSource';
import { JsonProofProvider } from './JsonProofProvider';
import { IHypersync } from './models';
import { ProofProviderBase } from './ProofProviderBase';
import { ProofProviderFactory } from './ProofProviderFactory';

import {
  IntegrationContext,
  ObjectType,
  UserContext
} from '@hyperproof-int/integration-sdk/lib';
import { ILocalizable } from '@hyperproof-int/integration-sdk/src';

describe('HypersyncApp.ts', () => {
  let app: any;
  let mockProofProviderFactory: any;
  let datasource: any;
  let criteria: any;
  let pages: any;
  let messages: any;
  beforeAll(() => {
    process.env.integration_type = 'testConnector';
  });
  beforeEach(() => {
    app = new HypersyncApp({
      appRootDir: 'testDir',
      connectorName: 'testConnector',
      messages: {},
      credentialsMetadata: {}
    } as IHypersyncAppConfig);
  });
  describe('HypersyncApp', () => {
    beforeEach(() => {
      mockProofProviderFactory = {
        getProofTypeOptions: jest.fn(),
        createProofProvider: jest.fn(),
        getCustomProofTypeCategories: jest
          .fn()
          .mockReturnValue(new Set<undefined>())
      };

      datasource = {
        dataSetName: 'testDatasource',
        params: {}
      } as unknown as IDataSource;

      criteria = {};

      pages = [
        {
          fields: [],
          isValid: true
        }
      ] as ICriteriaPage[];

      messages = {};
    });
    describe('generateCriteriaMetadata()', () => {
      describe('category field', () => {
        it('should call generateProofCategoryfield', async () => {
          // Arrange
          const mockCriteriaProvider = {
            generateProofCategoryField: jest.fn()
          };

          let proofProviderFactory =
            mockProofProviderFactory as unknown as ProofProviderFactory;
          let criteriaProvider =
            mockCriteriaProvider as unknown as ICriteriaProvider;

          // Act
          await app.generateCriteriaMetadata(
            messages,
            datasource,
            criteriaProvider,
            proofProviderFactory,
            criteria,
            pages
          );

          // Assert
          expect(
            criteriaProvider.generateProofCategoryField
          ).toHaveBeenCalled();
        });

        it('should add categoryField to fields array when valid', async () => {
          // Arrange
          const validCategoryField = {
            name: 'category',
            type: 'select',
            label: 'Category',
            options: [{ value: 'test', label: 'Test' }],
            value: 'test'
          };

          const mockCriteriaProvider = {
            generateProofCategoryField: jest
              .fn()
              .mockResolvedValue(validCategoryField)
          };

          let proofProviderFactory =
            mockProofProviderFactory as unknown as ProofProviderFactory;
          let criteriaProvider =
            mockCriteriaProvider as unknown as ICriteriaProvider;

          // Act
          await app.generateCriteriaMetadata(
            messages,
            datasource,
            criteriaProvider,
            proofProviderFactory,
            criteria,
            pages
          );

          // Assert
          expect(pages[0].fields).toContainEqual(validCategoryField);
        });

        it('should throw error when categoryField type is not "select"', async () => {
          // Arrange
          const invalidCategoryField = {
            name: 'category',
            type: 'text', // Wrong type
            label: 'Category',
            options: [{ value: 'test', label: 'Test' }],
            value: 'test'
          };

          const mockCriteriaProvider = {
            generateProofCategoryField: jest
              .fn()
              .mockResolvedValue(invalidCategoryField)
          };

          let proofProviderFactory =
            mockProofProviderFactory as unknown as ProofProviderFactory;
          let criteriaProvider =
            mockCriteriaProvider as unknown as ICriteriaProvider;

          // Act & Assert
          await expect(
            app.generateCriteriaMetadata(
              messages,
              datasource,
              criteriaProvider,
              proofProviderFactory,
              criteria,
              pages
            )
          ).rejects.toThrow('Invalid proof category field.');
        });

        it('should throw error when categoryField options array is missing', async () => {
          // Arrange
          const invalidCategoryField = {
            name: 'category',
            type: 'select',
            label: 'Category',
            value: 'test'
            // Missing options array
          };

          const mockCriteriaProvider = {
            generateProofCategoryField: jest
              .fn()
              .mockResolvedValue(invalidCategoryField)
          };

          let proofProviderFactory =
            mockProofProviderFactory as unknown as ProofProviderFactory;
          let criteriaProvider =
            mockCriteriaProvider as unknown as ICriteriaProvider;

          // Act & Assert
          await expect(
            app.generateCriteriaMetadata(
              messages,
              datasource,
              criteriaProvider,
              proofProviderFactory,
              criteria,
              pages
            )
          ).rejects.toThrow('Invalid proof category field.');
        });

        it('should throw error when categoryField options array has length <= 0', async () => {
          // Arrange
          const invalidCategoryField = {
            name: 'category',
            type: 'select',
            label: 'Category',
            value: 'test',
            options: [] // Empty array
          };

          const mockCriteriaProvider = {
            generateProofCategoryField: jest
              .fn()
              .mockResolvedValue(invalidCategoryField)
          };

          let proofProviderFactory =
            mockProofProviderFactory as unknown as ProofProviderFactory;
          let criteriaProvider =
            mockCriteriaProvider as unknown as ICriteriaProvider;

          // Act & Assert
          await expect(
            app.generateCriteriaMetadata(
              messages,
              datasource,
              criteriaProvider,
              proofProviderFactory,
              criteria,
              pages
            )
          ).rejects.toThrow('Invalid proof category field.');
        });

        it('should throw error when categoryField options[0].value is not a string', async () => {
          // Arrange
          const invalidCategoryField = {
            name: 'category',
            type: 'select',
            label: 'Category',
            value: 'test',
            options: [{ value: 1, label: 'Test' }] // Value is not a string
          };

          const mockCriteriaProvider = {
            generateProofCategoryField: jest
              .fn()
              .mockResolvedValue(invalidCategoryField)
          };

          let proofProviderFactory =
            mockProofProviderFactory as unknown as ProofProviderFactory;
          let criteriaProvider =
            mockCriteriaProvider as unknown as ICriteriaProvider;

          // Act & Assert
          await expect(
            app.generateCriteriaMetadata(
              messages,
              datasource,
              criteriaProvider,
              proofProviderFactory,
              criteria,
              pages
            )
          ).rejects.toThrow('Invalid proof category field.');
        });

        // ensure custom proof type is picked up in customprooftypecategory
        it('should add custom proof type categories to categoryField options', async () => {
          // Arrange
          const validCategoryField = {
            name: 'category',
            type: 'select',
            label: 'Category',
            options: [{ value: 'test', label: 'Test' }],
            value: 'test'
          };

          const mockCriteriaProvider = {
            generateProofCategoryField: jest
              .fn()
              .mockResolvedValue(validCategoryField)
          };

          const customCategories = new Set(['other', 'customCategory2']);

          const mockProofProviderFactory = {
            getProofTypeOptions: jest.fn(),
            createProofProvider: jest.fn(),
            getCustomProofTypeCategories: jest
              .fn()
              .mockReturnValue(customCategories)
          };

          let proofProviderFactory =
            mockProofProviderFactory as unknown as ProofProviderFactory;
          let criteriaProvider =
            mockCriteriaProvider as unknown as ICriteriaProvider;

          // Act
          await app.generateCriteriaMetadata(
            messages,
            datasource,
            criteriaProvider,
            proofProviderFactory,
            criteria,
            pages
          );

          // Assert
          const categoryFieldOptions = pages[0].fields.find(
            f => f.name === 'category'
          )?.options;
          expect(categoryFieldOptions).toContainEqual({
            value: 'other',
            label: 'Other'
          });
        });
      });

      describe('proof types', () => {
        it('should validate proofTypeField', async () => {
          // Arrange
          const categoryField = {
            name: 'category',
            type: 'select',
            label: 'Category',
            options: [{ value: 'test', label: 'Test' }],
            value: 'test'
          };

          const mockCriteriaProvider = {
            generateProofCategoryField: jest
              .fn()
              .mockResolvedValue(categoryField)
          };

          const validProofTypes = [
            { value: 'type1', label: 'Type 1' },
            { value: 'type2', label: 'Type 2' }
          ];

          const mockProofProviderFactory = {
            getProofTypeOptions: jest.fn().mockReturnValue(validProofTypes),
            createProofProvider: jest.fn(),
            getCustomProofTypeCategories: jest
              .fn()
              .mockReturnValue(new Set<undefined>())
          };

          const invalidCriteria = {
            proofType: 'invalidType' // Type that doesn't exist in options
          };

          let proofProviderFactory =
            mockProofProviderFactory as unknown as ProofProviderFactory;
          let criteriaProvider =
            mockCriteriaProvider as unknown as ICriteriaProvider;

          // Act
          await app.generateCriteriaMetadata(
            messages,
            datasource,
            criteriaProvider,
            proofProviderFactory,
            invalidCriteria,
            pages
          );

          // Assert
          // Verify proofType was cleared since it was invalid
          expect(invalidCriteria.proofType).toBeUndefined();

          // Verify proofType field was added with correct options
          const proofTypeField = pages[0].fields.find(
            f => f.name === 'proofType'
          );
          expect(proofTypeField?.options).toEqual(validProofTypes);
          expect(proofTypeField?.isRequired).toBeTruthy();
          expect(proofTypeField?.value).toBeUndefined();
        });

        it('should add proofType field when category is selected and valid proof type exists', async () => {
          // Arrange
          const categoryField = {
            name: 'category',
            type: 'select',
            label: 'Category',
            options: [{ value: 'test', label: 'Test' }],
            value: 'test'
          };

          const mockCriteriaProvider = {
            generateProofCategoryField: jest
              .fn()
              .mockResolvedValue(categoryField)
          };

          const validProofTypes = [
            { value: 'type1', label: 'Type 1' },
            { value: 'type2', label: 'Type 2' }
          ];

          const mockProofProvider = {
            generateCriteriaMetadata: jest.fn()
          };

          const mockProofProviderFactory = {
            getProofTypeOptions: jest.fn().mockReturnValue(validProofTypes),
            createProofProvider: jest.fn().mockReturnValue(mockProofProvider),
            getCustomProofTypeCategories: jest
              .fn()
              .mockReturnValue(new Set<undefined>())
          };

          const criteria = {
            proofType: 'type1' // Valid proof type that exists in options
          };

          let proofProviderFactory =
            mockProofProviderFactory as unknown as ProofProviderFactory;
          let criteriaProvider =
            mockCriteriaProvider as unknown as ICriteriaProvider;
          let provider = mockProofProvider as unknown as
            | ProofProviderBase<IDataSource>
            | JsonProofProvider;

          // Act
          await app.generateCriteriaMetadata(
            messages,
            datasource,
            criteriaProvider,
            proofProviderFactory,
            criteria,
            pages
          );

          // Assert
          const proofTypeField = pages[0].fields.find(
            f => f.name === 'proofType'
          );
          expect(proofTypeField?.options).toEqual(validProofTypes);
          expect(proofTypeField?.value).toBe('type1');
          expect(proofTypeField?.isRequired).toBeTruthy();
          expect(proofTypeField?.isDisabled).toBeFalsy();
          expect(provider.generateCriteriaMetadata).toHaveBeenCalledWith(
            criteria,
            pages,
            undefined
          );
        });

        it('should add proofType field with correct disabled state', async () => {
          // Arrange
          const categoryField = {
            name: 'category',
            type: 'select',
            label: 'Category',
            options: [{ value: 'test', label: 'Test' }],
            value: null // No value selected
          };

          const mockCriteriaProvider = {
            generateProofCategoryField: jest
              .fn()
              .mockResolvedValue(categoryField)
          };

          let proofProviderFactory =
            mockProofProviderFactory as unknown as ProofProviderFactory;
          let criteriaProvider =
            mockCriteriaProvider as unknown as ICriteriaProvider;

          // Act
          await app.generateCriteriaMetadata(
            messages,
            datasource,
            criteriaProvider,
            proofProviderFactory,
            criteria,
            pages
          );

          // Assert
          const proofTypeField = pages[0].fields.find(
            f => f.name === 'proofType'
          );
          expect(proofTypeField?.isDisabled).toBeTruthy();
        });

        it('should filter proof types based on selected category', async () => {
          // Arrange
          const categoryField = {
            name: 'category',
            type: 'select',
            label: 'Category',
            options: [{ value: 'test', label: 'Test' }],
            value: 'test'
          };

          const mockCriteriaProvider = {
            generateProofCategoryField: jest
              .fn()
              .mockResolvedValue(categoryField)
          };

          const expectedProofTypes = [
            { value: 'type1', label: 'Type 1' },
            { value: 'type2', label: 'Type 2' }
          ];

          const mockProofProviderFactory = {
            getProofTypeOptions: jest.fn().mockReturnValue(expectedProofTypes),
            createProofProvider: jest.fn(),
            getCustomProofTypeCategories: jest
              .fn()
              .mockReturnValue(new Set<undefined>())
          };

          let proofProviderFactory =
            mockProofProviderFactory as unknown as ProofProviderFactory;
          let criteriaProvider =
            mockCriteriaProvider as unknown as ICriteriaProvider;

          // Act
          await app.generateCriteriaMetadata(
            messages,
            datasource,
            criteriaProvider,
            proofProviderFactory,
            criteria,
            pages
          );

          // Assert
          expect(
            mockProofProviderFactory.getProofTypeOptions
          ).toHaveBeenCalledWith('test', undefined);

          const proofTypeField = pages[0].fields.find(
            f => f.name === 'proofType'
          );
          expect(proofTypeField?.options).toEqual(expectedProofTypes);
          expect(proofTypeField?.isDisabled).toBeFalsy();
        });

        it('should clear proofType if not found in filtered options', async () => {
          // Arrange
          const categoryField = {
            name: 'category',
            type: 'select',
            label: 'Category',
            options: [{ value: 'test', label: 'Test' }],
            value: 'test'
          };

          const mockCriteriaProvider = {
            generateProofCategoryField: jest
              .fn()
              .mockResolvedValue(categoryField)
          };

          const mockProofProviderFactory = {
            getProofTypeOptions: jest
              .fn()
              .mockReturnValue([{ value: 'newType', label: 'New Type' }]),
            createProofProvider: jest.fn(),
            getCustomProofTypeCategories: jest
              .fn()
              .mockReturnValue(new Set<undefined>())
          };

          const criteria = {
            proofType: 'oldType' // This type doesn't exist in new options
          };

          let proofProviderFactory =
            mockProofProviderFactory as unknown as ProofProviderFactory;
          let criteriaProvider =
            mockCriteriaProvider as unknown as ICriteriaProvider;

          // Act
          await app.generateCriteriaMetadata(
            messages,
            datasource,
            criteriaProvider,
            proofProviderFactory,
            criteria,
            pages
          );

          // Assert
          expect(criteria.proofType).toBeUndefined();
        });
      });

      describe('proof provider', () => {
        it('should create proof provider when valid proof type is selected', async () => {
          // Arrange
          const categoryField = {
            name: 'category',
            type: 'select',
            label: 'Category',
            options: [{ value: 'test', label: 'Test' }],
            value: 'test'
          };

          const mockCriteriaProvider = {
            generateProofCategoryField: jest
              .fn()
              .mockResolvedValue(categoryField)
          };

          const mockProofProvider = {
            generateCriteriaMetadata: jest.fn().mockReturnValue({})
          };

          const mockProofProviderFactory = {
            getProofTypeOptions: jest
              .fn()
              .mockReturnValue([{ value: 'validType', label: 'Valid Type' }]),
            createProofProvider: jest.fn().mockReturnValue(mockProofProvider),
            getCustomProofTypeCategories: jest
              .fn()
              .mockReturnValue(new Set<undefined>())
          };

          const criteria = {
            proofType: 'validType'
          };

          let proofProviderFactory =
            mockProofProviderFactory as unknown as ProofProviderFactory;
          let criteriaProvider =
            mockCriteriaProvider as unknown as ICriteriaProvider;

          // Act
          await app.generateCriteriaMetadata(
            messages,
            datasource,
            criteriaProvider,
            proofProviderFactory,
            criteria,
            pages
          );

          // Assert
          expect(
            mockProofProviderFactory.createProofProvider
          ).toHaveBeenCalledWith('validType', datasource, criteriaProvider);
          expect(
            mockProofProvider.generateCriteriaMetadata
          ).toHaveBeenCalledWith(criteria, pages, undefined);
        });
      });
    });
    describe('createdataSource()', () => {});
  });

  describe('HypersyncAppConnector', () => {
    let mockConnector: HypersyncAppConnector;
    let mockApp: HypersyncApp;

    beforeAll(() => {
      process.env.integration_type = 'testAppConnector';
    });

    beforeEach(() => {
      mockApp = {
        validateCredentials: jest.fn(),
        getMessages: jest.fn().mockReturnValue({}),
        createDataSource: jest.fn().mockResolvedValue({}),
        createCriteriaProvider: jest.fn().mockResolvedValue({}),
        getProofProviderFactory: jest.fn().mockResolvedValue({}),
        getProofData: jest.fn().mockResolvedValue([])
      } as Partial<HypersyncApp> as HypersyncApp;

      mockConnector = new HypersyncAppConnector('testAppConnector', mockApp);
    });

    describe('syncNow()', () => {
      describe('user context', () => {
        it('should throw error when user context is not found', async () => {
          // Arrange

          const mockIntegrationContext = {
            storage: {
              list: jest.fn().mockResolvedValue({ items: [] }),
              get: jest.fn(),
              put: jest.fn(),
              delete: jest.fn()
            },
            logger: {
              info: jest.fn(),
              error: jest.fn()
            }
          } as unknown as IntegrationContext;

          const hypersync = {
            settings: {
              vendorUserId: 'testUser'
            }
          } as unknown as IHypersync;

          jest
            .spyOn(mockConnector, 'getUser')
            .mockImplementation()
            .mockResolvedValue(undefined);

          // Act & Assert
          await expect(
            mockConnector.syncNow(
              mockIntegrationContext,
              'orgId',
              ObjectType.LABEL,
              'objectId',
              hypersync,
              'syncStartDate'
            )
          ).rejects.toThrow(/The connection may have been deleted/);
        });

        it('should call app.getProofData with correct parameters', async () => {
          // Arrange

          const mockIntegrationContext = {
            storage: {
              list: jest.fn().mockResolvedValue({ items: [] }),
              get: jest.fn(),
              put: jest.fn(),
              delete: jest.fn()
            },
            logger: {
              info: jest.fn(),
              error: jest.fn()
            }
          } as unknown as IntegrationContext;

          const mockUserContext = {
            vendorUserId: 'testUser',
            vendorUserProfile: { id: 'testProfile' }
          } as unknown as UserContext;

          const hypersync = {
            settings: {
              vendorUserId: 'testUser'
            }
          } as unknown as IHypersync;

          const organization: ILocalizable = {
            language: 'en',
            locale: 'US',
            timeZone: 'America/Los_Angeles'
          };

          jest
            .spyOn(mockConnector as any, 'getUser')
            .mockResolvedValue(mockUserContext);
          jest
            .spyOn(mockConnector as any, 'createResources')
            .mockResolvedValue({
              messages: {},
              dataSource: {},
              criteriaProvider: {},
              proofProviderFactory: {}
            });

          // Act
          await mockConnector.syncNow(
            mockIntegrationContext,
            'orgId',
            ObjectType.LABEL,
            'objectId',
            hypersync,
            'syncStartDate',
            organization,
            'page1',
            { metadata: 'test' },
            3,
            undefined
          );

          // Assert
          expect(mockApp.getProofData).toHaveBeenCalledWith(
            {},
            {},
            {},
            hypersync,
            organization,
            { id: 'testProfile' },
            'syncStartDate',
            'page1',
            { metadata: 'test' },
            3,
            undefined
          );
        });

        it('should return results from getProofData', async () => {
          // Arrange
          const expectedResults = {
            data: [
              {
                proof: 'data'
              }
            ]
          };
          (mockApp.getProofData as jest.Mock).mockResolvedValue(
            expectedResults
          );

          const mockIntegrationContext = {
            storage: {
              list: jest.fn().mockResolvedValue({ items: [] })
            }
          } as unknown as IntegrationContext;

          const mockUserContext = {
            vendorUserId: 'testUser',
            vendorUserProfile: {}
          } as unknown as UserContext;

          const hypersync = {
            settings: {
              vendorUserId: 'testUser'
            }
          } as unknown as IHypersync;

          jest
            .spyOn(mockConnector as any, 'getUser')
            .mockResolvedValue(mockUserContext);
          jest
            .spyOn(mockConnector as any, 'createResources')
            .mockResolvedValue({
              messages: {},
              dataSource: {},
              criteriaProvider: {},
              proofProviderFactory: {}
            });

          // Act
          const result = await mockConnector.syncNow(
            mockIntegrationContext,
            'orgId',
            ObjectType.LABEL,
            'objectId',
            hypersync,
            'syncStartDate'
          );

          // Assert
          expect(result).toEqual(expectedResults);
        });
      });
    });

    describe('validateCredentials()', () => {
      it('should throw error when userId does not match userIdPattern', async () => {
        // Arrange
        const userIdPattern = /^user_\d+$/;
        (mockApp.validateCredentials as jest.Mock).mockResolvedValue({
          userId: 'invalidUserId',
          profile: { userName: 'Test User' },
          userIdPattern: userIdPattern
        });

        const credentials = { username: 'testuser', password: 'testpass' };
        const mockIntegrationContext = {
          storage: {
            list: jest.fn().mockResolvedValue({ items: [] })
          }
        } as unknown as IntegrationContext;

        // Act & Assert
        await expect(
          mockConnector.validateCredentials(
            credentials,
            mockIntegrationContext,
            'hyperproofUserId123'
          )
        ).rejects.toThrow();
      });

      it('should pass validation when userId matches userIdPattern', async () => {
        // Arrange
        const userIdPattern = /^user_\d+$/;
        (mockApp.validateCredentials as jest.Mock).mockResolvedValue({
          userId: 'user_12345', // This matches the pattern
          profile: { userName: 'Test User' },
          userIdPattern: userIdPattern
        });

        const credentials = {
          username: 'testuser',
          password: 'testpass'
        };

        const mockIntegrationContext = {
          storage: {
            list: jest.fn().mockResolvedValue({ items: [] })
          }
        } as unknown as IntegrationContext;

        // Act
        const result = await mockConnector.validateCredentials(
          credentials,
          mockIntegrationContext,
          'hyperproofUserId123'
        );

        // Assert
        expect(result).toEqual({
          vendorUserId: 'user_12345',
          vendorUserProfile: { userName: 'Test User' }
        });
      });
    });
  });
});
