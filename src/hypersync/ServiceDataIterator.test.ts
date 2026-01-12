import { DataSetResultStatus } from './IDataSource';
import { IterableObject, ServiceDataIterator } from './ServiceDataIterator';

import {
  DataSetIteratorDefinition,
  IteratorSource
} from '@hyperproof/hypersync-models';

describe('ServiceDataIterator', () => {
  const mockRestDataSource = {
    setPagingState: jest.fn(),
    getData: jest.fn(),
    iterateData: jest.fn(),
    getConfig: jest.fn(() => ({}))
  };

  const iteratorDef: DataSetIteratorDefinition = {
    layer: 1,
    source: IteratorSource.DataSet,
    dataSet: 'planets',
    dataSetParams: { system: 'solar' },
    iterandKey: 'id',
    subArraySize: 1
  };

  const dataSetIterator: DataSetIteratorDefinition[] = [iteratorDef];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should throw if iterator definition is invalid', () => {
    const badDef = { ...iteratorDef, subArraySize: 0 };
    expect(
      () =>
        new ServiceDataIterator(
          mockRestDataSource,
          [{ ...badDef }],
          'testProof'
        )
    ).toThrow();
  });

  it('extractIteratorLayer returns correct layer', () => {
    expect(
      ServiceDataIterator.extractIteratorLayer(dataSetIterator, 1)
    ).toEqual(iteratorDef);
  });

  it('mergeIterandWithParams merges params and iterand', () => {
    const iterand = { id: 123 };
    const params = { hyper: 'proof', foo: 'bar' };
    expect(
      ServiceDataIterator.mergeIterandWithParams(iterand, 'id', params)
    ).toEqual({
      hyper: 'proof',
      foo: 'bar',
      id: 123
    });
  });

  it('generateIteratorPlan throws if iterableArray is not array', async () => {
    mockRestDataSource.getData.mockResolvedValue({
      status: DataSetResultStatus.Complete,
      data: { id: 1, name: 'Mercury' },
      source: 'test'
    });
    const iterator = new ServiceDataIterator(
      mockRestDataSource,
      dataSetIterator,
      'testProof'
    );
    await expect(iterator.generateIteratorPlan({}, {})).rejects.toThrow(
      /must be an array/
    );
  });

  it('validateIterableArray returns undefined for valid array', () => {
    class TestIterator extends ServiceDataIterator {
      public callValidateIterableArray(iterableArray: IterableObject[]) {
        return this.validateIterableArray(iterableArray);
      }
    }
    const iterator = new TestIterator(
      mockRestDataSource,
      dataSetIterator,
      'testProof'
    );
    expect(
      iterator.callValidateIterableArray([{ id: 1 }, { id: 2 }, { id: 3 }])
    ).toBeUndefined();
  });
});
