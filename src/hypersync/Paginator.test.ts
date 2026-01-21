import {
  GraphQLConnectionsPaginator,
  NextTokenPaginator,
  OffsetAndLimitPaginator,
  PageBasedPaginator,
  Paginator
} from './Paginator';

import {
  DataSetMethod,
  INextTokenScheme,
  IOffsetAndLimitScheme,
  IPageBasedScheme,
  NextTokenType,
  PageUntilCondition,
  PagingType
} from '@hyperproof/hypersync-models';
import { IGraphQLConnectionsScheme } from '@hyperproof/hypersync-models/src/dataSource';

describe('Paginator', () => {
  describe('createPaginator', () => {
    it('should create a NextTokenPaginator with limit parameter and limit value', () => {
      const pagingScheme = {
        type: PagingType.NextToken,
        tokenType: NextTokenType.Token,
        request: {
          limitParameter: '$top',
          limitValue: 10,
          tokenParameter: 'nextToken'
        }
      } as INextTokenScheme;
      const paginator = Paginator.createPaginator(pagingScheme);
      expect(paginator).toBeInstanceOf(NextTokenPaginator);
    });

    it('should not create a NextTokenPaginator if limit value is not a positive integer', () => {
      const pagingScheme = {
        type: PagingType.NextToken,
        tokenType: NextTokenType.Token,
        request: {
          limitParameter: '$top',
          limitValue: -10,
          tokenParameter: 'nextToken'
        }
      } as INextTokenScheme;
      expect(() => Paginator.createPaginator(pagingScheme)).toThrow(
        'Paginator: Limit value undefined must be a positive integer for nextToken schemes.'
      );
    });

    it('should create a NextTokenPaginator with no limit parameter and no limit value', () => {
      const pagingScheme = {
        type: PagingType.NextToken,
        tokenType: NextTokenType.Token,
        request: {
          tokenParameter: 'nextToken'
        }
      } as INextTokenScheme;
      const paginator = Paginator.createPaginator(pagingScheme);
      expect(paginator).toBeInstanceOf(NextTokenPaginator);
    });

    it('should not create a NextTokenPaginator if on limit parameter or limit value in undefined', () => {
      const pagingSchemeWithNoLimitValue = {
        type: PagingType.NextToken,
        tokenType: NextTokenType.Token,
        request: {
          limitParameter: '$top',
          tokenParameter: 'nextToken'
        }
      } as INextTokenScheme;
      expect(() =>
        Paginator.createPaginator(pagingSchemeWithNoLimitValue)
      ).toThrow(
        'Paginator: Limit value must be defined if request parameters are defined for nextToken schemes.'
      );
    });

    it('should create a PageBasedPaginator', () => {
      const pagingScheme = {
        type: PagingType.PageBased,
        request: {
          pageParameter: 'page',
          pageStartingValue: 1,
          limitParameter: 'limit',
          limitValue: 10
        }
      } as IPageBasedScheme;
      const paginator = Paginator.createPaginator(pagingScheme);
      expect(paginator).toBeInstanceOf(PageBasedPaginator);
    });

    it('should not create a PageBasedPaginator if limit parameter is undefined', () => {
      const pagingSchemeWithNoLimitParameter = {
        type: PagingType.PageBased,
        request: {
          pageParameter: 'page',
          pageStartingValue: 1,
          limitValue: 10
        }
      } as IPageBasedScheme;
      expect(() =>
        Paginator.createPaginator(pagingSchemeWithNoLimitParameter)
      ).toThrow(
        'Paginator: Request parameters must be defined for pageBased schemes.'
      );
    });

    it('should not create a PageBasedPaginator if page parameter is undefined', () => {
      const pagingSchemeWithNoPageParameter = {
        type: PagingType.PageBased,
        request: {
          pageStartingValue: 1,
          limitValue: 10,
          limitParameter: 'limit'
        }
      } as IPageBasedScheme;
      expect(() =>
        Paginator.createPaginator(pagingSchemeWithNoPageParameter)
      ).toThrow(
        'Paginator: Request parameters must be defined for pageBased schemes.'
      );
    });

    it('should not create a PageBasedPaginator if pageStartingValue is undefined', () => {
      const pagingSchemeWithNoPageStartingValue = {
        type: PagingType.PageBased,
        request: {
          pageParameter: 'page',
          limitParameter: 'limit',
          limitValue: 10
        }
      } as IPageBasedScheme;
      expect(() =>
        Paginator.createPaginator(pagingSchemeWithNoPageStartingValue)
      ).toThrow(
        'Paginator: Request parameters must be defined for pageBased schemes.'
      );
    });

    it('shouldHYP-63898 not create a PageBasedPaginator if limit parameter is not a positive integer', () => {
      const pagingScheme = {
        type: PagingType.PageBased,
        request: {
          pageParameter: 'page',
          pageStartingValue: 1,
          limitParameter: 'limit',
          limitValue: -10
        }
      } as IPageBasedScheme;
      expect(() => Paginator.createPaginator(pagingScheme)).toThrow(
        'Paginator: Limit value undefined must be a positive integer for page-based schemes.'
      );
    });

    it('should not create a PageBasedPaginator if paging condition is ReachTotalCount and total count is not defined', () => {
      const pagingScheme = {
        type: PagingType.PageBased,
        request: {
          pageParameter: 'page',
          pageStartingValue: 1,
          limitParameter: 'limit',
          limitValue: 10
        },
        pageUntil: PageUntilCondition.ReachTotalCount
      } as IPageBasedScheme;
      expect(() => Paginator.createPaginator(pagingScheme)).toThrow(
        'Paginator: totalCount must be defined for paging condition: reachTotalCount.'
      );
    });

    it('should create an OffsetAndLimitPaginator', () => {
      const pagingScheme = {
        type: PagingType.OffsetAndLimit,
        request: {
          offsetParameter: 'skip',
          offsetStartingValue: 0,
          limitParameter: 'resultsPerPage',
          limitValue: 10
        },
        pageUntil: PageUntilCondition.NoDataLeft
      } as IOffsetAndLimitScheme;
      const paginator = Paginator.createPaginator(pagingScheme);
      expect(paginator).toBeInstanceOf(OffsetAndLimitPaginator);
    });

    it('should not create an OffsetAndLimitPaginator if offsetParameter is undefined', () => {
      const pagingSchemewithNoOffestParameter = {
        type: PagingType.OffsetAndLimit,
        request: {
          offsetStartingValue: 0,
          limitParameter: 'resultsPerPage',
          limitValue: 10
        },
        pageUntil: PageUntilCondition.NoDataLeft
      } as IOffsetAndLimitScheme;
      expect(() =>
        Paginator.createPaginator(pagingSchemewithNoOffestParameter)
      ).toThrow(
        'Paginator: Request parameters must be defined for offsetAndLimit schemes.'
      );
    });

    it('should not create an OffsetAndLimitPaginator if offsetStartingValue is undefined', () => {
      const pagingSchemeWithNoOffsetStartingValue = {
        type: PagingType.OffsetAndLimit,
        request: {
          offsetParameter: 'skip',
          limitParameter: 'resultsPerPage',
          limitValue: 10
        },
        pageUntil: PageUntilCondition.NoDataLeft
      } as IOffsetAndLimitScheme;
      expect(() =>
        Paginator.createPaginator(pagingSchemeWithNoOffsetStartingValue)
      ).toThrow(
        'Paginator: Request parameters must be defined for offsetAndLimit schemes.'
      );
    });

    it('should not create an OffsetAndLimitPaginator if limitParameter is undefined', () => {
      const pagingSchemeWithNoLimitParameter = {
        type: PagingType.OffsetAndLimit,
        request: {
          offsetParameter: 'skip',
          offsetStartingValue: 0,
          limitValue: 10
        },
        pageUntil: PageUntilCondition.NoDataLeft
      } as IOffsetAndLimitScheme;
      expect(() =>
        Paginator.createPaginator(pagingSchemeWithNoLimitParameter)
      ).toThrow(
        'Paginator: Request parameters must be defined for offsetAndLimit schemes.'
      );
    });

    it('should not create an OffsetAndLimitPaginator if limit parameter is not a positive integer', () => {
      const pagingScheme = {
        type: PagingType.OffsetAndLimit,
        request: {
          offsetParameter: 'skip',
          offsetStartingValue: 0,
          limitParameter: 'resultsPerPage',
          limitValue: -10
        },
        pageUntil: PageUntilCondition.NoDataLeft
      } as IOffsetAndLimitScheme;
      expect(() => Paginator.createPaginator(pagingScheme)).toThrow(
        'Paginator: Limit value undefined must be a positive integer for offset-and-limit schemes.'
      );
    });

    it('should not create a OffsetAndLimitPaginator if paging condition is ReachTotalCount and total count is not defined', () => {
      const pagingScheme = {
        type: PagingType.OffsetAndLimit,
        request: {
          offsetParameter: 'skip',
          offsetStartingValue: 0,
          limitParameter: 'resultsPerPage',
          limitValue: 10
        },
        pageUntil: PageUntilCondition.ReachTotalCount
      } as IOffsetAndLimitScheme;
      expect(() => Paginator.createPaginator(pagingScheme)).toThrow(
        'Paginator: totalCount must be defined for paging condition: reachTotalCount.'
      );
    });

    it('should create a GraphQLConnectionsPaginator', () => {
      const pagingScheme = {
        type: PagingType.GraphQLConnections,
        request: { limitParameter: '$top', limitValue: 10 },
        response: { pageInfo: JSON.stringify({ totalCount: 'totalCount' }) },
        pageUntil: PageUntilCondition.NoNextPage
      } as IGraphQLConnectionsScheme;
      const paginator = Paginator.createPaginator(
        pagingScheme,
        DataSetMethod.POST
      );

      expect(paginator).toBeInstanceOf(GraphQLConnectionsPaginator);
    });

    it('should not create a GraphQLConnectionsPaginator if limitParamter is undefined', () => {
      const pagingScheme = {
        type: PagingType.GraphQLConnections,
        request: { limitValue: 10 },
        response: { pageInfo: JSON.stringify({ totalCount: 'totalCount' }) },
        pageUntil: PageUntilCondition.NoNextPage
      } as IGraphQLConnectionsScheme;

      expect(() =>
        Paginator.createPaginator(pagingScheme, DataSetMethod.POST)
      ).toThrow(
        'Paginator: Request parameters must be defined for graphqlConnections schemes.'
      );
    });

    it('should not create a GraphQLConnectionsPaginator if limitValue is undefined', () => {
      const pagingSchemeWithNoLimitValue = {
        type: PagingType.GraphQLConnections,
        request: { limitParameter: '$top' },
        response: { pageInfo: JSON.stringify({ totalCount: 'totalCount' }) },
        pageUntil: PageUntilCondition.NoNextPage
      } as IGraphQLConnectionsScheme;

      expect(() =>
        Paginator.createPaginator(
          pagingSchemeWithNoLimitValue,
          DataSetMethod.POST
        )
      ).toThrow(
        'Paginator: Limit value undefined must be a positive integer for graphqlConnections schemes.'
      );
    });

    it('should not create a GraphQLConnectionsPaginator if limitValue is not a positive integer', () => {
      const pagingSchemeWithNonPositiveLimitValue = {
        type: PagingType.GraphQLConnections,
        request: { limitParameter: '$top', limitValue: -10 },
        response: { pageInfo: JSON.stringify({ totalCount: 'totalCount' }) },
        pageUntil: PageUntilCondition.NoNextPage
      } as IGraphQLConnectionsScheme;

      expect(() =>
        Paginator.createPaginator(
          pagingSchemeWithNonPositiveLimitValue,
          DataSetMethod.POST
        )
      ).toThrow(
        'Paginator: Limit value undefined must be a positive integer for graphqlConnections schemes.'
      );
    });

    it('should not create a GraphQLConnectionsPaginator if limitParamter is undefined', () => {
      const pagingScheme = {
        type: PagingType.GraphQLConnections,
        request: { limitParameter: '$top', limitValue: 10 },
        response: { pageInfo: JSON.stringify({ totalCount: 'totalCount' }) },
        pageUntil: PageUntilCondition.NoNextPage
      } as IGraphQLConnectionsScheme;

      expect(() => Paginator.createPaginator(pagingScheme)).toThrow(
        'Paginator: GraphQL pagination scheme graphqlConnections supports POST method.'
      );
    });

    it('should throw an error for an invalid PagingType', () => {
      const pagingScheme = { type: 'InvalidType' };
      expect(() => Paginator.createPaginator(pagingScheme as any)).toThrow(
        'Paginator: Invalid paging scheme: InvalidType'
      );
    });
  });

  describe('NextTokenPaginator', () => {
    it('tokenType token should paginate request', () => {
      const pagingScheme = {
        type: PagingType.NextToken,
        tokenType: NextTokenType.Token,
        request: {
          limitParameter: '$top',
          limitValue: 10,
          tokenParameter: 'nextToken'
        }
      } as INextTokenScheme;

      const paginator = Paginator.createPaginator(pagingScheme);

      const relativeUrl = '/api/data';
      const baseUrl = 'https://example.com';
      const messageBody = undefined;
      let page = undefined;

      let result = paginator.paginateRequest(
        relativeUrl,
        baseUrl,
        messageBody,
        DataSetMethod.GET,
        page
      );

      expect(result.pagedRelativeUrl).toBe(
        `${relativeUrl}?${pagingScheme.request.limitParameter}=${pagingScheme.request.limitValue}`
      );

      // pretending we found the next token
      page = 'testToken';

      result = paginator.paginateRequest(
        relativeUrl,
        baseUrl,
        messageBody,
        DataSetMethod.GET,
        page
      );

      expect(result.pagedRelativeUrl).toBe(
        `${relativeUrl}?${pagingScheme.request.limitParameter}=${pagingScheme.request.limitValue}&${pagingScheme.request.tokenParameter}=${page}`
      );
    });

    it('tokenType url should paginate request', () => {
      const pagingScheme = {
        type: PagingType.NextToken,
        tokenType: NextTokenType.Url,
        request: {
          limitParameter: '$top',
          limitValue: 10,
          tokenParameter: 'nextToken'
        }
      } as INextTokenScheme;

      const paginator = Paginator.createPaginator(pagingScheme);

      const relativeUrl = '/api/data';
      const baseUrl = 'https://example.com';
      const messageBody = undefined;
      let page = undefined;

      let result = paginator.paginateRequest(
        relativeUrl,
        baseUrl,
        messageBody,
        DataSetMethod.GET,
        page
      );

      expect(result.pagedRelativeUrl).toBe(
        `${relativeUrl}?${pagingScheme.request.limitParameter}=${pagingScheme.request.limitValue}`
      );

      // pretending we found the next token
      page = `${baseUrl}/testToken`;

      result = paginator.paginateRequest(
        relativeUrl,
        baseUrl,
        messageBody,
        DataSetMethod.GET,
        page
      );

      expect(result.pagedRelativeUrl).toBe(page);
    });

    it('should paginate request without limit parameters', () => {
      const pagingScheme = {
        type: PagingType.NextToken,
        tokenType: NextTokenType.Token,
        request: {
          tokenParameter: 'nextToken'
        }
      } as INextTokenScheme;
      const paginator = Paginator.createPaginator(pagingScheme);

      const relativeUrl = '/api/data';
      const baseUrl = 'https://example.com';
      const messageBody = undefined;
      let page = undefined;

      let result = paginator.paginateRequest(
        relativeUrl,
        baseUrl,
        messageBody,
        DataSetMethod.GET,
        page
      );

      expect(result.pagedRelativeUrl).toBe(relativeUrl);

      // pretending we found the next token
      page = 'testToken';

      result = paginator.paginateRequest(
        relativeUrl,
        baseUrl,
        messageBody,
        DataSetMethod.GET,
        page
      );

      expect(result.pagedRelativeUrl).toBe(
        `${relativeUrl}?${pagingScheme.request.tokenParameter}=${page}`
      );
    });

    it('should paginate POST message body', () => {
      const pagingScheme = {
        type: PagingType.NextToken,
        tokenType: NextTokenType.Token,
        request: {
          tokenParameter: 'variables.token'
        },
        response: {
          nextToken: 'pagination.token'
        },
        pageUntil: PageUntilCondition.NoNextToken
      } as INextTokenScheme;
      const paginator = Paginator.createPaginator(pagingScheme);
      const relativeUrl = '/graphql';
      const baseUrl = 'https://example.com';
      const messageBody = {
        query:
          'query($token: String) { attributes(token: $token) { nodes { id name } pagination { token } } }'
      };
      let page = '9f6a4b24af';
      let result = paginator.paginateRequest(
        relativeUrl,
        baseUrl,
        messageBody,
        DataSetMethod.POST,
        page
      );
      expect(result.pagedRelativeUrl).toBe(relativeUrl);
      expect(result.pagedMessageBody).toEqual({
        ...messageBody,
        variables: {
          token: page
        }
      });
    });
  });

  describe('PageBasedPaginator', () => {
    it('should paginate request', () => {
      const pagingScheme = {
        type: PagingType.PageBased,
        request: {
          pageParameter: 'page',
          pageStartingValue: 1,
          limitParameter: '$top',
          limitValue: 10
        }
      } as IPageBasedScheme;
      const paginator = Paginator.createPaginator(pagingScheme);

      const relativeUrl = '/api/data';
      const baseUrl = 'https://example.com';
      const messageBody = undefined;
      let page = undefined;

      let result = paginator.paginateRequest(
        relativeUrl,
        baseUrl,
        messageBody,
        DataSetMethod.GET,
        page
      );

      expect(result.pagedRelativeUrl).toBe(
        `${relativeUrl}?${pagingScheme.request.pageParameter}=${pagingScheme.request.pageStartingValue}&${pagingScheme.request.limitParameter}=${pagingScheme.request.limitValue}`
      );

      // pretending we found the next token
      page = '2';

      result = paginator.paginateRequest(
        relativeUrl,
        baseUrl,
        messageBody,
        DataSetMethod.GET,
        page
      );
      expect(result.pagedRelativeUrl).toBe(
        `${relativeUrl}?page=${page}&${pagingScheme.request.limitParameter}=${pagingScheme.request.limitValue}`
      );
    });

    it('should paginate POST message body', () => {
      const pagingScheme = {
        type: PagingType.PageBased,
        request: {
          pageParameter: 'variables.page',
          pageStartingValue: 1,
          limitParameter: 'variables.limit',
          limitValue: 10
        },
        pageUntil: PageUntilCondition.NoDataLeft
      } as IPageBasedScheme;
      const paginator = Paginator.createPaginator(pagingScheme);
      const relativeUrl = '/graphql';
      const baseUrl = 'https://example.com';
      const messageBody = {
        query:
          'query($page: Int, $limit: Int) { attributes(page: $page, limit: $limit) { nodes { id name } pagination { page } } }'
      };
      let page = undefined;
      let result = paginator.paginateRequest(
        relativeUrl,
        baseUrl,
        messageBody,
        DataSetMethod.POST,
        page
      );
      expect(result.pagedRelativeUrl).toBe(relativeUrl);
      expect(result.pagedMessageBody).toEqual({
        ...messageBody,
        variables: {
          page: 1,
          limit: 10
        }
      });
    });
  });

  describe('OffsetAndLimitPaginator', () => {
    it('should paginate request', () => {
      const pagingScheme = {
        type: PagingType.OffsetAndLimit,
        request: {
          offsetParameter: 'skip',
          offsetStartingValue: 0,
          limitParameter: '$top',
          limitValue: 10
        },
        pageUntil: PageUntilCondition.NoDataLeft
      } as IOffsetAndLimitScheme;
      const paginator = Paginator.createPaginator(pagingScheme);

      const relativeUrl = '/api/data';
      const baseUrl = 'https://example.com';
      const messageBody = undefined;
      let page = undefined;

      let result = paginator.paginateRequest(
        relativeUrl,
        baseUrl,
        messageBody,
        DataSetMethod.GET,
        page
      );

      expect(result.pagedRelativeUrl).toBe(
        `${relativeUrl}?${pagingScheme.request.offsetParameter}=${pagingScheme.request.offsetStartingValue}&${pagingScheme.request.limitParameter}=${pagingScheme.request.limitValue}`
      );

      // pretending we found the next token
      page = '10';

      result = paginator.paginateRequest(
        relativeUrl,
        baseUrl,
        messageBody,
        DataSetMethod.GET,
        page
      );
      expect(result.pagedRelativeUrl).toBe(
        `${relativeUrl}?${pagingScheme.request.offsetParameter}=${page}&${pagingScheme.request.limitParameter}=${pagingScheme.request.limitValue}`
      );
    });

    it('should paginate POST message body', () => {
      const pagingScheme = {
        type: PagingType.OffsetAndLimit,
        request: {
          offsetParameter: 'variables.offset',
          offsetStartingValue: 0,
          limitParameter: 'variables.limit',
          limitValue: 10
        },
        response: {
          totalCount: 'pagination.totalCount'
        },
        pageUntil: PageUntilCondition.ReachTotalCount
      } as IOffsetAndLimitScheme;
      const paginator = Paginator.createPaginator(pagingScheme);
      const relativeUrl = '/graphql';
      const baseUrl = 'https://example.com';
      const messageBody = {
        query:
          'query($offset: Int, $limit: Int) { attributes(offset: $offset, limit: $limit) { nodes { id name } pagination { totalCount } } }'
      };
      let page = undefined;
      let result = paginator.paginateRequest(
        relativeUrl,
        baseUrl,
        messageBody,
        DataSetMethod.POST,
        page
      );
      expect(result.pagedRelativeUrl).toBe(relativeUrl);
      expect(result.pagedMessageBody).toEqual({
        ...messageBody,
        variables: {
          offset: 0,
          limit: 10
        }
      });
    });
  });

  describe('GraphQLConnectionsPaginator', () => {
    it('should not mutate the supplied url', () => {
      const pagingScheme = {
        type: PagingType.GraphQLConnections,
        request: { limitParameter: '$top', limitValue: 10 },
        response: { pageInfo: JSON.stringify({ totalCount: 'totalCount' }) },
        pageUntil: PageUntilCondition.NoNextPage
      } as IGraphQLConnectionsScheme;
      const paginator = Paginator.createPaginator(
        pagingScheme,
        DataSetMethod.POST
      );

      const relativeUrl = '/api/data';
      const baseUrl = 'https://example.com';
      const messageBody = { query: 'test' };
      let page = undefined;

      let result = paginator.paginateRequest(
        relativeUrl,
        baseUrl,
        messageBody,
        DataSetMethod.POST,
        page
      );

      expect(result.pagedRelativeUrl).toBe(relativeUrl);
    });

    it('should paginate message body', () => {
      const pagingScheme = {
        type: PagingType.GraphQLConnections,
        request: { limitParameter: '$top', limitValue: 10 },
        response: { pageInfo: JSON.stringify({ totalCount: 'totalCount' }) },
        pageUntil: PageUntilCondition.NoNextPage
      } as IGraphQLConnectionsScheme;
      const paginator = Paginator.createPaginator(
        pagingScheme,
        DataSetMethod.POST
      );

      const relativeUrl = '/api/data';
      const baseUrl = 'https://example.com';
      const messageBody = { query: 'test' };
      let page = undefined;

      let result = paginator.paginateRequest(
        relativeUrl,
        baseUrl,
        messageBody,
        DataSetMethod.POST,
        page
      );

      expect(
        result.pagedMessageBody.variables[pagingScheme.request.limitParameter]
      ).toBe(pagingScheme.request.limitValue);
    });
  });
});
