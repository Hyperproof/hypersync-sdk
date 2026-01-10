import { DataSetResultStatus, IDataSource } from './IDataSource';
import { JsonCriteriaProvider } from './JsonCriteriaProvider';

import {
  HypersyncCriteriaFieldType,
  ValidationTypes
} from '@hyperproof-int/hypersync-models';
import { Logger } from '@hyperproof-int/integration-sdk';
import fs from 'fs';
import path from 'path';

jest.mock('fs');
jest.mock('path', () => {
  return {
    resolve: jest.fn((...args) => {
      return args[args.length - 2];
    })
  };
});

describe('JsonCriteriaProvider', () => {
  const appRootDir = 'appRootDir';
  const initialFieldName = 'initialField';
  const propertyValue = 'propertyValue';
  const propertyLabel = 'propertyLabel';

  const initialField = {
    type: HypersyncCriteriaFieldType.Text,
    property: 'initialProperty',
    label: 'initialLabel',
    isRequired: false
  };
  const fileContents = {
    [initialFieldName]: initialField
  };
  const fileJson = JSON.stringify(fileContents);
  const dataSet = {
    [propertyValue]: 'dataSetValue',
    [propertyLabel]: 'dataSetLabel'
  };
  const otherSet = {
    [propertyValue]: 'otherSetValue',
    [propertyLabel]: 'otherSetLabel'
  };

  let dataSource: IDataSource;

  beforeEach(() => {
    Logger.info = jest.fn();
    fs.existsSync = jest.fn().mockReturnValue(true);
    fs.readFileSync = jest.fn().mockReturnValue(fileJson);
    dataSource = {
      getData: jest.fn().mockResolvedValue({
        status: DataSetResultStatus.Complete,
        data: [
          {
            [propertyValue]: dataSet.propertyValue,
            [propertyLabel]: dataSet.propertyLabel
          },
          {
            [propertyValue]: otherSet.propertyValue,
            [propertyLabel]: otherSet.propertyLabel
          }
        ]
      })
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('initializes correctly', () => {
    // Arrange & Act
    const provider = new JsonCriteriaProvider(appRootDir, dataSource);

    // Assert
    expect(path.resolve).toHaveBeenCalledWith(appRootDir, expect.any(String));
    expect(fs.existsSync).toHaveBeenCalledWith(appRootDir); // path.resolve was mocked to return appRootDir
    expect(fs.readFileSync).toHaveBeenCalledWith(appRootDir, 'utf8');
    expect(provider).toBeDefined();
  });

  describe('is initialized and', () => {
    let provider: JsonCriteriaProvider;
    beforeEach(() => {
      provider = new JsonCriteriaProvider(appRootDir, dataSource);
    });

    describe('getConfig', () => {
      test('returns the config', () => {
        // Arrange

        // Act
        const config = provider.getConfig();

        // Assert
        expect(config).toBeDefined();
        expect(config).toEqual(fileContents);
      });

      test('with no file returns empty object', () => {
        // Arrange
        fs.existsSync = jest.fn().mockReturnValue(false);
        const provider = new JsonCriteriaProvider(appRootDir, dataSource);

        // Act
        const config = provider.getConfig();

        // Assert
        expect(config).toBeDefined();
        expect(config).toEqual({});
      });
    });

    describe('addCriteriaField', () => {
      test('adds a new field', () => {
        // Arrange
        const fieldName = 'fieldName';
        const fieldValue = {
          type: HypersyncCriteriaFieldType.Text,
          property: 'property',
          label: 'label',
          isRequired: true
        };

        // Act
        provider.addCriteriaField(fieldName, fieldValue);

        // // Assert
        const config = provider.getConfig();
        expect(config).toBeDefined();
        expect(config[fieldName]).toBe(fieldValue);
      });

      test('throws an error when adding a existing field', () => {
        // Arrange
        const newFieldValue = {
          type: HypersyncCriteriaFieldType.Text,
          property: 'rejected',
          label: 'NO',
          isRequired: false
        };

        // Act
        expect(() =>
          provider.addCriteriaField(initialFieldName, newFieldValue)
        ).toThrow('A criteria field with that name already exists.');

        // Assert
        const config = provider.getConfig();
        expect(config).toBeDefined();
        expect(config[initialFieldName]).toBeDefined();
        expect(config[initialFieldName]).toEqual(initialField);
      });
    });

    describe('generateProofCategoryField', () => {
      test('generates the fields when criteriaFields contains hp_proofCategory', async () => {
        // Arrange
        const fileContents = {
          hp_proofCategory: initialField
        };
        const fileJson = JSON.stringify(fileContents);
        fs.readFileSync = jest.fn().mockReturnValue(fileJson);
        const provider = new JsonCriteriaProvider(appRootDir, dataSource);

        const criteriaValues = {};
        const tokenContext = {};

        const criteraFieldReturn = {
          name: initialField.property,
          type: initialField.type,
          label: initialField.label
        };
        provider['buildCriteriaField'] = jest
          .fn()
          .mockResolvedValue(criteraFieldReturn);

        const expectedField = {
          name: criteraFieldReturn.name,
          type: criteraFieldReturn.type,
          label: criteraFieldReturn.label
        };

        // Act
        const field = await provider.generateProofCategoryField(
          criteriaValues,
          tokenContext
        );

        expect(field).not.toBeNull();
        expect(field).toEqual(expectedField);
      });

      test('generates the field when criteriaFields contains proofCategory', async () => {
        // Arrange
        const fileContents = {
          proofCategory: initialField
        };
        const fileJson = JSON.stringify(fileContents);
        fs.readFileSync = jest.fn().mockReturnValue(fileJson);
        const provider = new JsonCriteriaProvider(appRootDir, dataSource);

        const criteriaValues = {};
        const tokenContext = {};

        const criteraFieldReturn = {
          name: initialField.property,
          type: initialField.type,
          label: initialField.label
        };
        provider['buildCriteriaField'] = jest
          .fn()
          .mockResolvedValue(criteraFieldReturn);

        const expectedField = {
          name: initialField.property,
          type: initialField.type,
          label: initialField.label
        };

        // Act
        const field = await provider.generateProofCategoryField(
          criteriaValues,
          tokenContext
        );

        expect(field).not.toBeNull();
        expect(field).toEqual(expectedField);
      });

      test('returns null when no proofCategory fields', async () => {
        // Arrange
        const criteriaValues = {};
        const tokenContext = {};

        // Act
        const field = await provider.generateProofCategoryField(
          criteriaValues,
          tokenContext
        );

        // Assert
        expect(field).toBeNull();
      });
    });

    describe('generateCriteriaFields', () => {
      test('returns valid last page when no proofCriteria is passed in', async () => {
        // Arrange
        const proofCriteria = [];
        const criteriaValues = {};
        const tokenContext = {};
        const pages = [
          {
            fields: [],
            isValid: false
          }
        ];
        const pagesLength = pages.length;
        const pageFields = pages[0].fields;

        // Act
        await provider.generateCriteriaFields(
          proofCriteria,
          criteriaValues,
          tokenContext,
          pages
        );

        // Assert
        expect(pages.length).toBe(pagesLength);
        const page = pages[pagesLength - 1];
        expect(page.isValid).toBeTruthy();
        expect(page.fields).toBe(pageFields);
      });

      test('throws error when proofCriteria is not in criteriaFields', async () => {
        // Arrange
        const proofCriteria = [
          {
            name: 'criteriaName',
            page: 0
          }
        ];
        const criteriaValues = {};
        const tokenContext = {};
        const pages = [];
        const pagesLength = pages.length;

        // Act
        // Due to async function throwing error, can't just use expect().toThrow()
        try {
          await provider.generateCriteriaFields(
            proofCriteria,
            criteriaValues,
            tokenContext,
            pages
          );
          // We shouldn't reach here
          expect(false).toBeTruthy();
        } catch (error) {
          expect(error.message).toBe(
            `Unable to find criterion named ${proofCriteria[0].name}`
          );
        }

        // Assert
        expect(pages.length).toBe(pagesLength);
      });

      test('throws error if criteriaField is not appropriate type', async () => {
        // Arrange
        const initialField = {
          type: HypersyncCriteriaFieldType.Radio,
          property: 'initialProperty',
          label: 'initialLabel',
          isRequired: true
        };
        const fileContents = {
          initialField: initialField
        };
        const fileJson = JSON.stringify(fileContents);
        fs.readFileSync = jest.fn().mockReturnValue(fileJson);
        const provider = new JsonCriteriaProvider(appRootDir, dataSource);

        const proofCriteria = [
          {
            name: initialFieldName,
            page: 0
          }
        ];
        const criteriaValues = {};
        const tokenContext = {};
        const pages = [];
        const pagesLength = pages.length;

        // Act
        // Due to async function throwing error, can't just use expect().toThrow()
        try {
          await provider.generateCriteriaFields(
            proofCriteria,
            criteriaValues,
            tokenContext,
            pages
          );
          expect(false).toBeTruthy();
        } catch (error) {
          expect(error.message).toBe(
            `Unrecognized or unsupported criteria field type: ${initialField.type}`
          );
        }

        // Assert
        expect(pages.length).toBe(pagesLength);
      });

      test('returns appropriate field values', async () => {
        // Arrange
        const proofCriteria = [
          {
            name: initialFieldName,
            page: 0
          }
        ];
        const criteriaValues = {};
        const tokenContext = {};
        const pages = [];
        const pagesLength = pages.length;

        const expectedCriteriaFieldReturn = {
          name: initialField.property,
          type: initialField.type,
          label: initialField.label,
          isRequired: initialField.isRequired,
          options: []
        };
        provider['buildCriteriaField'] = jest
          .fn()
          .mockResolvedValue(expectedCriteriaFieldReturn);

        const expectedPages = [
          {
            fields: [expectedCriteriaFieldReturn],
            isValid: true
          }
        ];

        // Act
        await provider.generateCriteriaFields(
          proofCriteria,
          criteriaValues,
          tokenContext,
          pages
        );

        // Assert
        expect(pages.length).toBe(pagesLength + 1);
        expect(pages).toEqual(expectedPages);
      });

      test('returns appropriate fields with empty fields if extra pages', async () => {
        // Arrange
        const proofCriteria = [
          {
            name: initialFieldName,
            page: 1
          }
        ];
        const criteriaValues = {};
        const tokenContext = {};
        const pages = [];
        const pagesLength = pages.length;

        const expectedCriteriaFieldReturn = {
          name: initialField.property,
          type: initialField.type,
          label: initialField.label,
          isReadable: initialField.isRequired,
          options: []
        };
        provider['buildCriteriaField'] = jest
          .fn()
          .mockResolvedValue(expectedCriteriaFieldReturn);

        const expectedPages = [
          // Add blank page to cover missing page 0
          { isValid: false, fields: [] },
          {
            fields: [expectedCriteriaFieldReturn],
            isValid: true
          }
        ];

        // Act
        await provider.generateCriteriaFields(
          proofCriteria,
          criteriaValues,
          tokenContext,
          pages
        );

        // Assert
        expect(pages.length).toBe(pagesLength + 2);
        expect(pages).toEqual(expectedPages);
      });
    });

    describe('generateProofCriteria', () => {
      test('with no proofCriteria returns emptpy array', async () => {
        // Arrange
        const proofCriteria = [];
        const criteriaValues = {};
        const tokenContext = {};

        // Act
        const criteria = await provider.generateProofCriteria(
          proofCriteria,
          criteriaValues,
          tokenContext
        );

        // Assert
        expect(criteria).toBeDefined();
        expect(criteria).toEqual([]);
      });

      test('with empty non-required proof criteria value returns default display name', async () => {
        // Arrange
        const initialField = {
          type: HypersyncCriteriaFieldType.Text,
          property: 'initialProperty',
          label: 'initialLabel',
          isRequired: false,
          defaultDisplayValue: 'defaultName'
        };
        const fileContents = {
          initialField: initialField
        };
        const fileJson = JSON.stringify(fileContents);
        fs.readFileSync = jest.fn().mockReturnValue(fileJson);
        const provider = new JsonCriteriaProvider(appRootDir, dataSource);

        const proofCriteria = [
          {
            name: initialFieldName,
            page: 0
          }
        ];
        const criteriaValues = {
          [initialField.property]: undefined
        };
        const tokenContext = {};

        const expectedCriteria = [
          {
            name: initialField.property,
            label: initialField.label,
            value: initialField.defaultDisplayValue
          }
        ];

        // Act
        const criteria = await provider.generateProofCriteria(
          proofCriteria,
          criteriaValues,
          tokenContext
        );

        // Assert
        expect(criteria).toBeDefined();
        expect(criteria).toEqual(expectedCriteria);
      });

      test('with empty non-required proof criteria array returns default display name', async () => {
        // Arrange
        const initialField = {
          type: HypersyncCriteriaFieldType.Text,
          property: 'initialProperty',
          label: 'initialLabel',
          isRequired: false,
          defaultDisplayValue: 'defaultName'
        };
        const fileContents = {
          initialField: initialField
        };
        const fileJson = JSON.stringify(fileContents);
        fs.readFileSync = jest.fn().mockReturnValue(fileJson);
        const provider = new JsonCriteriaProvider(appRootDir, dataSource);

        const proofCriteria = [
          {
            name: initialFieldName,
            page: 0
          }
        ];
        const criteriaValues = {
          [initialField.property]: []
        };
        const tokenContext = {};

        const expectedCriteria = [
          {
            name: initialField.property,
            label: initialField.label,
            value: initialField.defaultDisplayValue
          }
        ];

        // Act
        const criteria = await provider.generateProofCriteria(
          proofCriteria,
          criteriaValues,
          tokenContext
        );

        // Assert
        expect(criteria).toBeDefined();
        expect(criteria).toEqual(expectedCriteria);
      });

      test('with field type text returns criteria', async () => {
        // Arrange
        const proofCriteria = [
          {
            name: initialFieldName,
            page: 0
          }
        ];
        const criteriaString = 'criteriaValues';
        const criteriaValues = {
          [initialField.property]: criteriaString
        };
        const tokenContext = {};

        const expectedCriteria = [
          {
            name: initialField.property,
            label: initialField.label,
            value: criteriaString
          }
        ];

        // Act
        const criteria = await provider.generateProofCriteria(
          proofCriteria,
          criteriaValues,
          tokenContext
        );

        // Assert
        expect(criteria).toBeDefined();
        expect(criteria).toEqual(expectedCriteria);
      });

      test('with field type select returns criteria', async () => {
        // Arrange
        const initialField = {
          type: HypersyncCriteriaFieldType.Select,
          property: 'initialProperty',
          label: 'initialLabel',
          isRequired: false,
          dataSet: [],
          valueProperty: propertyValue,
          labelProperty: propertyLabel
        };
        const fileContents = {
          initialField: initialField
        };
        const fileJson = JSON.stringify(fileContents);
        fs.readFileSync = jest.fn().mockReturnValue(fileJson);
        const provider = new JsonCriteriaProvider(appRootDir, dataSource);

        provider['getCriteriaFieldOptions'] = jest.fn().mockReturnValue([
          { value: dataSet.propertyValue, label: dataSet.propertyLabel },
          { value: otherSet.propertyValue, label: otherSet.propertyLabel }
        ]);

        const proofCriteria = [
          {
            name: initialFieldName,
            page: 0
          }
        ];
        const criteriaValues = {
          [initialField.property]: dataSet.propertyValue
        };
        const tokenContext = {};

        const expectedCriteria = [
          {
            name: initialField.property,
            label: initialField.label,
            value: dataSet.propertyLabel
          }
        ];

        // Act
        const criteria = await provider.generateProofCriteria(
          proofCriteria,
          criteriaValues,
          tokenContext
        );

        // Assert
        expect(criteria).toBeDefined();
        expect(criteria).toEqual(expectedCriteria);
      });

      test('with field type select with array returns criteria', async () => {
        // Arrange
        const initialField = {
          type: HypersyncCriteriaFieldType.Select,
          property: 'initialProperty',
          label: 'initialLabel',
          isRequired: false,
          dataSet: [],
          valueProperty: propertyValue,
          labelProperty: propertyLabel
        };
        const fileContents = {
          initialField: initialField
        };
        const fileJson = JSON.stringify(fileContents);
        fs.readFileSync = jest.fn().mockReturnValue(fileJson);
        const provider = new JsonCriteriaProvider(appRootDir, dataSource);

        provider['getCriteriaFieldOptions'] = jest.fn().mockReturnValue([
          { value: dataSet.propertyValue, label: dataSet.propertyLabel },
          { value: otherSet.propertyValue, label: otherSet.propertyLabel }
        ]);

        const proofCriteria = [
          {
            name: initialFieldName,
            page: 0
          }
        ];
        const criteriaValues = {
          [initialField.property]: [
            dataSet.propertyValue,
            otherSet.propertyValue
          ]
        };
        const tokenContext = {};

        const expectedValue =
          dataSet.propertyLabel + ', ' + otherSet.propertyLabel;
        const expectedCriteria = [
          {
            name: initialField.property,
            label: initialField.label,
            value: expectedValue
          }
        ];

        // Act
        const criteria = await provider.generateProofCriteria(
          proofCriteria,
          criteriaValues,
          tokenContext
        );

        // Assert
        expect(criteria).toBeDefined();
        expect(criteria).toEqual(expectedCriteria);
      });
    });

    describe('buildCriteriaField (private)', () => {
      test('with isDisabled true returns empty array for options', async () => {
        // Arrange
        const property = 'property';
        const label = 'label';

        const fieldConfig = {
          type: HypersyncCriteriaFieldType.Select,
          property: property,
          label: label,
          isRequired: true
        };
        const criteriaValues = {};
        const tokenContext = {};
        const isDisabled = true;

        const criteraFieldOptionReturn = {
          value: 'optionValue',
          label: 'optionLabel'
        };
        provider['getCriteriaFieldOptions'] = jest
          .fn()
          .mockResolvedValue([criteraFieldOptionReturn]);

        const expectedResponse = {
          name: fieldConfig.property,
          type: fieldConfig.type,
          label: fieldConfig.label,
          isRequired: fieldConfig.isRequired,
          options: [],
          isDisabled: isDisabled
        };

        // Act
        const criteriaField = await provider['buildCriteriaField'](
          fieldConfig,
          criteriaValues,
          tokenContext,
          isDisabled
        );

        // Assert
        expect(criteriaField).toBeDefined();
        expect(criteriaField).toEqual(expectedResponse);
      });

      test('with field type text returns empty array for options', async () => {
        // Arrange
        const property = 'property';
        const label = 'label';

        const fieldConfig = {
          type: HypersyncCriteriaFieldType.Text,
          property: property,
          label: label,
          isRequired: true
        };
        const criteriaValues = {};
        const tokenContext = {};
        const isDisabled = false;

        const criteraFieldOptionReturn = {
          value: 'optionValue',
          label: 'optionLabel'
        };
        provider['getCriteriaFieldOptions'] = jest
          .fn()
          .mockResolvedValue([criteraFieldOptionReturn]);

        const expectedResponse = {
          name: fieldConfig.property,
          type: fieldConfig.type,
          label: fieldConfig.label,
          isRequired: fieldConfig.isRequired,
          options: [],
          isDisabled: isDisabled
        };

        // Act
        const criteriaField = await provider['buildCriteriaField'](
          fieldConfig,
          criteriaValues,
          tokenContext,
          isDisabled
        );

        // Assert
        expect(criteriaField).toBeDefined();
        expect(criteriaField).toEqual(expectedResponse);
      });

      test('returns criteria fields', async () => {
        // Arrange
        const property = 'property';
        const label = 'label';
        const placeholder = 'placeholderValue';
        const criteriaValue = 'criteriaValue';

        const fieldConfig = {
          type: HypersyncCriteriaFieldType.Select,
          property: property,
          label: label,
          isRequired: true,
          placeholder: placeholder,
          isMulti: false,
          validation: {
            type: ValidationTypes.alphaNumeric
          }
        };
        const criteriaValues = {
          [property]: criteriaValue
        };
        const tokenContext = {};
        const isDisabled = false;

        const criteraFieldOptionReturn = {
          value: 'optionValue',
          label: 'optionLabel'
        };
        provider['getCriteriaFieldOptions'] = jest
          .fn()
          .mockResolvedValue([criteraFieldOptionReturn]);

        const expectedResponse = {
          name: fieldConfig.property,
          type: fieldConfig.type,
          label: fieldConfig.label,
          isRequired: fieldConfig.isRequired,
          options: [criteraFieldOptionReturn],
          value: criteriaValues[property],
          placeholder: fieldConfig.placeholder,
          isDisabled: isDisabled,
          isMulti: fieldConfig.isMulti,
          validation: {
            type: fieldConfig.validation.type,
            errorMessage: ''
          }
        };

        // Act
        const criteriaField = await provider['buildCriteriaField'](
          fieldConfig,
          criteriaValues,
          tokenContext,
          isDisabled
        );

        // Assert
        expect(criteriaField).toBeDefined();
        expect(criteriaField).toEqual(expectedResponse);
      });
    });

    describe('getCriteriaFieldOptions (private)', () => {
      test('throws an error if getData returns pending', async () => {
        // Arrange
        const dataSource = {
          getData: jest.fn().mockResolvedValue({
            status: DataSetResultStatus.Pending,
            data: []
          })
        };
        const provider = new JsonCriteriaProvider(appRootDir, dataSource);

        const property = 'property';
        const label = 'label';
        const dataSet = 'dataset';
        const valueProperty = 'valueProp';
        const labelProperty = 'labelProp';

        const fieldConfig = {
          type: HypersyncCriteriaFieldType.Select,
          property: property,
          label: label,
          isRequired: true,
          dataSet: dataSet,
          valueProperty: valueProperty,
          labelProperty: labelProperty
        };
        const criteriaValues = {};
        const tokenContext = {};

        // Act
        // Due to async function throwing error, can't just use expect().toThrow()
        let criteriaFieldOptions;
        try {
          criteriaFieldOptions = await provider['getCriteriaFieldOptions'](
            fieldConfig,
            criteriaValues,
            tokenContext
          );
          expect(false).toBeTruthy();
        } catch (error) {
          expect(error.message).toBe(
            `Pending response received for critera field data set: ${dataSet}`
          );
        }

        // Assert
        expect(criteriaFieldOptions).toBeUndefined();
      });

      test('throws an error if getData returns a non-array data set', async () => {
        // Arrange
        const dataSource = {
          getData: jest.fn().mockResolvedValue({
            status: DataSetResultStatus.Complete,
            data: ''
          })
        };
        const provider = new JsonCriteriaProvider(appRootDir, dataSource);

        const property = 'property';
        const label = 'label';
        const dataSet = 'dataset';
        const valueProperty = 'valueProp';
        const labelProperty = 'labelProp';

        const fieldConfig = {
          type: HypersyncCriteriaFieldType.Select,
          property: property,
          label: label,
          isRequired: true,
          dataSet: dataSet,
          valueProperty: valueProperty,
          labelProperty: labelProperty
        };
        const criteriaValues = {};
        const tokenContext = {};

        // Act
        // Due to async function throwing error, can't just use expect().toThrow()
        let criteriaFieldOptions;
        try {
          criteriaFieldOptions = await provider['getCriteriaFieldOptions'](
            fieldConfig,
            criteriaValues,
            tokenContext
          );
          expect(false).toBeTruthy();
        } catch (error) {
          expect(error.message).toBe(
            `Invalid criteria field data set: ${dataSet}`
          );
        }

        // Assert
        expect(criteriaFieldOptions).toBeUndefined();
      });

      test('returns empty array if no dataSet or fixedValues', async () => {
        // Arrange
        const property = 'property';
        const label = 'label';
        const valueProperty = 'valueProp';
        const labelProperty = 'labelProp';

        const fieldConfig = {
          type: HypersyncCriteriaFieldType.Select,
          property: property,
          label: label,
          isRequired: true,
          valueProperty: valueProperty,
          labelProperty: labelProperty
        };
        const criteriaValues = {};
        const tokenContext = {};

        const expectedResponse = [];

        // Act
        const criteriaFieldOptions = await provider['getCriteriaFieldOptions'](
          fieldConfig,
          criteriaValues,
          tokenContext
        );

        // Assert
        expect(criteriaFieldOptions).toBeDefined();
        expect(criteriaFieldOptions).toEqual(expectedResponse);
      });

      test('returns empty array if no valueProperty or fixedValue', async () => {
        // Arrange
        const property = 'property';
        const label = 'label';
        const dataSet = 'dataset';
        const labelProperty = 'labelProp';

        const fieldConfig = {
          type: HypersyncCriteriaFieldType.Select,
          property: property,
          label: label,
          isRequired: true,
          dataSet: dataSet,
          labelProperty: labelProperty
        };
        const criteriaValues = {};
        const tokenContext = {};

        const expectedResponse = [];

        // Act
        const criteriaFieldOptions = await provider['getCriteriaFieldOptions'](
          fieldConfig,
          criteriaValues,
          tokenContext
        );

        // Assert
        expect(criteriaFieldOptions).toBeDefined();
        expect(criteriaFieldOptions).toEqual(expectedResponse);
      });

      test('returns empty array if no labelProperty or fixedValue', async () => {
        // Arrange
        const property = 'property';
        const label = 'label';
        const dataSet = 'dataset';
        const valueProperty = 'valueProp';

        const fieldConfig = {
          type: HypersyncCriteriaFieldType.Select,
          property: property,
          label: label,
          isRequired: true,
          dataSet: dataSet,
          valueProperty: valueProperty
        };
        const criteriaValues = {};
        const tokenContext = {};

        const expectedResponse = [];

        // Act
        const criteriaFieldOptions = await provider['getCriteriaFieldOptions'](
          fieldConfig,
          criteriaValues,
          tokenContext
        );

        // Assert
        expect(criteriaFieldOptions).toBeDefined();
        expect(criteriaFieldOptions).toEqual(expectedResponse);
      });

      test('returns appropriate JSON if getData returns non-empty array', async () => {
        // Arrange
        const firstLabel = 'firstLabel';
        const firstValue = 'firstValue';
        const secondLabel = 'secondLabel';
        const secondValue = 'secondValue';

        const dataSource = {
          getData: jest.fn().mockResolvedValue({
            status: DataSetResultStatus.Complete,
            data: [
              {
                labelProp: firstLabel,
                valueProp: firstValue
              },
              {
                labelProp: secondLabel,
                valueProp: secondValue
              }
            ]
          })
        };
        const provider = new JsonCriteriaProvider(appRootDir, dataSource);

        const property = 'property';
        const label = 'label';
        const dataSet = 'dataset';
        const valueProperty = 'valueProp';
        const labelProperty = 'labelProp';

        const fieldConfig = {
          type: HypersyncCriteriaFieldType.Select,
          property: property,
          label: label,
          isRequired: true,
          dataSet: dataSet,
          valueProperty: valueProperty,
          labelProperty: labelProperty
        };
        const criteriaValues = {};
        const tokenContext = {};

        const expectedResponse = [
          {
            label: firstLabel,
            value: firstValue
          },
          {
            label: secondLabel,
            value: secondValue
          }
        ];

        // Act
        const criteriaFieldOptions = await provider['getCriteriaFieldOptions'](
          fieldConfig,
          criteriaValues,
          tokenContext
        );

        // Assert
        expect(criteriaFieldOptions).toBeDefined();
        expect(criteriaFieldOptions).toEqual(expectedResponse);
      });

      test('returns appropriate JSON if only fixedValue is populated', async () => {
        // Arrange
        const property = 'property';
        const label = 'label';
        const stringValue = {
          label: 'string',
          value: 'value'
        };
        const numberValue = {
          label: 'number',
          value: 1
        };

        const fieldConfig = {
          type: HypersyncCriteriaFieldType.Select,
          property: property,
          label: label,
          isRequired: true,
          fixedValues: [stringValue, numberValue]
        };
        const criteriaValues = {};
        const tokenContext = {};

        const expectedResponse = [stringValue, numberValue];

        // Act
        const criteriaFieldOptions = await provider['getCriteriaFieldOptions'](
          fieldConfig,
          criteriaValues,
          tokenContext
        );

        // Assert
        expect(criteriaFieldOptions).toBeDefined();
        expect(criteriaFieldOptions).toEqual(expectedResponse);
      });

      test('returns appropriate JSON if getData and fixedValue are populated', async () => {
        // Arrange
        const firstLabel = 'firstLabel';
        const firstValue = 'firstValue';
        const secondLabel = 'secondLabel';
        const secondValue = 'secondValue';

        const dataSource = {
          getData: jest.fn().mockResolvedValue({
            status: DataSetResultStatus.Complete,
            data: [
              {
                labelProp: firstLabel,
                valueProp: firstValue
              },
              {
                labelProp: secondLabel,
                valueProp: secondValue
              }
            ]
          })
        };
        const provider = new JsonCriteriaProvider(appRootDir, dataSource);

        const property = 'property';
        const label = 'label';
        const dataSet = 'dataset';
        const valueProperty = 'valueProp';
        const labelProperty = 'labelProp';
        const stringValue = {
          label: 'string',
          value: 'value'
        };
        const numberValue = {
          label: 'number',
          value: 1
        };

        const fieldConfig = {
          type: HypersyncCriteriaFieldType.Select,
          property: property,
          label: label,
          isRequired: true,
          dataSet: dataSet,
          valueProperty: valueProperty,
          labelProperty: labelProperty,
          fixedValues: [stringValue, numberValue]
        };
        const criteriaValues = {};
        const tokenContext = {};

        const expectedResponse = [
          stringValue,
          numberValue,
          {
            label: firstLabel,
            value: firstValue
          },
          {
            label: secondLabel,
            value: secondValue
          }
        ];

        // Act
        const criteriaFieldOptions = await provider['getCriteriaFieldOptions'](
          fieldConfig,
          criteriaValues,
          tokenContext
        );

        // Assert
        expect(criteriaFieldOptions).toBeDefined();
        expect(criteriaFieldOptions).toEqual(expectedResponse);
      });

      test('returns appropriate JSON if getData has multiple pages', async () => {
        // Arrange
        const firstLabel = 'firstLabel';
        const firstValue = 'firstValue';
        const secondLabel = 'secondLabel';
        const secondValue = 'secondValue';

        const mockGetData = jest.fn();
        mockGetData.mockResolvedValueOnce({
          status: DataSetResultStatus.Complete,
          data: [
            {
              labelProp: firstLabel,
              valueProp: firstValue
            }
          ],
          nextPage: 'true'
        });
        mockGetData.mockResolvedValue({
          status: DataSetResultStatus.Complete,
          data: [
            {
              labelProp: secondLabel,
              valueProp: secondValue
            }
          ]
        });

        const dataSource = {
          getData: mockGetData
        };
        const provider = new JsonCriteriaProvider(appRootDir, dataSource);

        const property = 'property';
        const label = 'label';
        const dataSet = 'dataset';
        const valueProperty = 'valueProp';
        const labelProperty = 'labelProp';
        const stringValue = {
          label: 'string',
          value: 'value'
        };
        const numberValue = {
          label: 'number',
          value: 1
        };

        const fieldConfig = {
          type: HypersyncCriteriaFieldType.Select,
          property: property,
          label: label,
          isRequired: true,
          dataSet: dataSet,
          valueProperty: valueProperty,
          labelProperty: labelProperty,
          fixedValues: [stringValue, numberValue]
        };
        const criteriaValues = {};
        const tokenContext = {};

        const expectedResponse = [
          stringValue,
          numberValue,
          {
            label: firstLabel,
            value: firstValue
          },
          {
            label: secondLabel,
            value: secondValue
          }
        ];

        // Act
        const criteriaFieldOptions = await provider['getCriteriaFieldOptions'](
          fieldConfig,
          criteriaValues,
          tokenContext
        );

        // Assert
        expect(criteriaFieldOptions).toBeDefined();
        expect(criteriaFieldOptions).toEqual(expectedResponse);
      });

      test('getData is called with search input for criteria search field type', async () => {
        // Arrange
        const fieldConfig = {
          type: HypersyncCriteriaFieldType.Search,
          property: 'property',
          label: 'label',
          isRequired: true,
          dataSet: 'dataset',
          valueProperty: 'id',
          labelProperty: 'name'
        };
        const criteriaValues = {};
        const tokenContext = {};
        const searchInput = {
          searchKey: { value: 'searchValue', offset: '0' }
        };

        const mockGetData = jest.fn().mockResolvedValue({
          status: DataSetResultStatus.Complete,
          data: []
        });
        const provider = new JsonCriteriaProvider(appRootDir, {
          getData: mockGetData
        });

        // Act
        await provider['getCriteriaFieldOptions'](
          fieldConfig,
          criteriaValues,
          tokenContext,
          searchInput
        );

        // Assert
        expect(mockGetData).toHaveBeenCalledWith(
          'dataset',
          expect.objectContaining({ searchKey: 'searchValue' }),
          undefined
        );
      });
    });
  });
});
