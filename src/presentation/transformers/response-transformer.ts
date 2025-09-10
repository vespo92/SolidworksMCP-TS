/**
 * Response Transformer
 * Transforms tool responses to MCP format
 */

import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Result, ResultUtil } from '../../core/interfaces/core-abstractions.js';

export class ResponseTransformer {
  /**
   * Transform any response to MCP format
   */
  transform(response: any): CallToolResult {
    // Handle Result type
    if (this.isResult(response)) {
      if (ResultUtil.isSuccess(response)) {
        return this.transformSuccess(response.data);
      } else {
        return this.transformError(response.error);
      }
    }

    // Handle direct responses
    if (response instanceof Error) {
      return this.transformError(response);
    }

    return this.transformSuccess(response);
  }

  /**
   * Transform successful response
   */
  private transformSuccess(data: any): CallToolResult {
    // Handle null/undefined
    if (data === null || data === undefined) {
      return {
        content: [
          {
            type: 'text',
            text: 'Operation completed successfully'
          }
        ]
      };
    }

    // Handle objects with special formatting
    if (typeof data === 'object' && !Array.isArray(data)) {
      if (data.message || data.result) {
        return {
          content: [
            {
              type: 'text',
              text: data.message || JSON.stringify(data.result, null, 2)
            }
          ]
        };
      }
    }

    // Handle arrays
    if (Array.isArray(data)) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(data, null, 2)
          }
        ]
      };
    }

    // Handle primitives
    return {
      content: [
        {
          type: 'text',
          text: String(data)
        }
      ]
    };
  }

  /**
   * Transform error response
   */
  private transformError(error: any): CallToolResult {
    const message = error instanceof Error 
      ? error.message 
      : String(error);

    return {
      content: [
        {
          type: 'text',
          text: `Error: ${message}`
        }
      ],
      isError: true
    };
  }

  /**
   * Check if response is a Result type
   */
  private isResult(value: any): value is Result<any> {
    return (
      typeof value === 'object' &&
      value !== null &&
      'success' in value &&
      (value.success === true || value.success === false)
    );
  }
}