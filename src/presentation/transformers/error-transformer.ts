/**
 * Error Transformer
 * Transforms errors to MCP-compatible format
 */

import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { DomainError } from '../../core/interfaces/core-abstractions.js';

export class ErrorTransformer {
  /**
   * Transform any error to MCP error
   */
  transform(error: unknown): McpError {
    if (error instanceof McpError) {
      return error;
    }

    if (error instanceof DomainError) {
      return new McpError(
        this.mapErrorCode(error.statusCode),
        error.message,
        error.toJSON()
      );
    }

    if (error instanceof Error) {
      return new McpError(
        ErrorCode.InternalError,
        error.message,
        {
          name: error.name,
          stack: error.stack
        }
      );
    }

    return new McpError(
      ErrorCode.InternalError,
      'An unexpected error occurred',
      { error: String(error) }
    );
  }

  /**
   * Map HTTP status code to MCP error code
   */
  private mapErrorCode(statusCode: number): ErrorCode {
    switch (statusCode) {
      case 400:
        return ErrorCode.InvalidRequest;
      case 404:
        return ErrorCode.MethodNotFound;
      case 422:
        return ErrorCode.InvalidParams;
      case 503:
        return ErrorCode.InternalError;
      default:
        return ErrorCode.InternalError;
    }
  }
}