import { paginate } from './common';

describe('paginate', () => {
  it('should paginate first page with default page 0', () => {
    const entities = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const result = paginate(entities, 0, 3);

    expect(result.currentPage).toEqual([1, 2, 3]);
    expect(result.nextPage).toBe('1');
    expect(result.startIndex).toBe(0);
    expect(result.endIndex).toBe(3);
  });

  it('should paginate first page when page parameter is omitted', () => {
    const entities = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const result = paginate(entities, undefined, 3);

    expect(result.currentPage).toEqual([1, 2, 3]);
    expect(result.nextPage).toBe('1');
    expect(result.startIndex).toBe(0);
    expect(result.endIndex).toBe(3);
  });

  it('should paginate middle page', () => {
    const entities = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const result = paginate(entities, 1, 3);

    expect(result.currentPage).toEqual([4, 5, 6]);
    expect(result.nextPage).toBe('2');
    expect(result.startIndex).toBe(3);
    expect(result.endIndex).toBe(6);
  });

  it('should paginate last full page', () => {
    const entities = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const result = paginate(entities, 2, 3);

    expect(result.currentPage).toEqual([7, 8, 9]);
    expect(result.nextPage).toBeUndefined();
    expect(result.startIndex).toBe(6);
    expect(result.endIndex).toBe(9);
  });

  it('should paginate last partial page', () => {
    const entities = [1, 2, 3, 4, 5, 6, 7];
    const result = paginate(entities, 2, 3);

    expect(result.currentPage).toEqual([7]);
    expect(result.nextPage).toBeUndefined();
    expect(result.startIndex).toBe(6);
    expect(result.endIndex).toBe(9);
  });

  it('should handle single item per page', () => {
    const entities = [1, 2, 3, 4, 5];
    const result = paginate(entities, 2, 1);

    expect(result.currentPage).toEqual([3]);
    expect(result.nextPage).toBe('3');
    expect(result.startIndex).toBe(2);
    expect(result.endIndex).toBe(3);
  });

  it('should handle page size larger than array', () => {
    const entities = [1, 2, 3];
    const result = paginate(entities, 0, 10);

    expect(result.currentPage).toEqual([1, 2, 3]);
    expect(result.nextPage).toBeUndefined();
    expect(result.startIndex).toBe(0);
    expect(result.endIndex).toBe(10);
  });

  it('should handle empty array', () => {
    const entities: any[] = [];
    const result = paginate(entities, 0, 3);

    expect(result.currentPage).toEqual([]);
    expect(result.nextPage).toBeUndefined();
    expect(result.startIndex).toBe(0);
    expect(result.endIndex).toBe(3);
  });

  it('should handle page beyond array length', () => {
    const entities = [1, 2, 3];
    const result = paginate(entities, 5, 3);

    expect(result.currentPage).toEqual([]);
    expect(result.nextPage).toBeUndefined();
    expect(result.startIndex).toBe(15);
    expect(result.endIndex).toBe(18);
  });

  it('should handle single element array', () => {
    const entities = [1];
    const result = paginate(entities, 0, 3);

    expect(result.currentPage).toEqual([1]);
    expect(result.nextPage).toBeUndefined();
    expect(result.startIndex).toBe(0);
    expect(result.endIndex).toBe(3);
  });

  it('should handle array with exactly pageSize elements', () => {
    const entities = [1, 2, 3];
    const result = paginate(entities, 0, 3);

    expect(result.currentPage).toEqual([1, 2, 3]);
    expect(result.nextPage).toBeUndefined();
    expect(result.startIndex).toBe(0);
    expect(result.endIndex).toBe(3);
  });

  it('should handle array with pageSize + 1 elements', () => {
    const entities = [1, 2, 3, 4];
    const result = paginate(entities, 0, 3);

    expect(result.currentPage).toEqual([1, 2, 3]);
    expect(result.nextPage).toBe('1');
    expect(result.startIndex).toBe(0);
    expect(result.endIndex).toBe(3);
  });

  it('should handle array of objects', () => {
    const entities = [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
      { id: 3, name: 'Charlie' },
      { id: 4, name: 'David' }
    ];
    const result = paginate(entities, 1, 2);

    expect(result.currentPage).toEqual([
      { id: 3, name: 'Charlie' },
      { id: 4, name: 'David' }
    ]);
    expect(result.nextPage).toBeUndefined();
    expect(result.startIndex).toBe(2);
    expect(result.endIndex).toBe(4);
  });

  it('should handle zero page with multiple pages available', () => {
    const entities = [1, 2, 3, 4, 5, 6];
    const result = paginate(entities, 0, 2);

    expect(result.currentPage).toEqual([1, 2]);
    expect(result.nextPage).toBe('1');
    expect(result.startIndex).toBe(0);
    expect(result.endIndex).toBe(2);
  });
});
