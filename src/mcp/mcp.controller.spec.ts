import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { McpController } from './mcp.controller';

// ── McpService mock ────────────────────────────────────────────────────────────

const mockHandleRequest = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

const mockMcpService = {
  handleRequest: mockHandleRequest,
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeReq(body: unknown = {}, headers: Record<string, string> = {}) {
  return { body, headers, get: (h: string) => headers[h] } as any;
}

function makeRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
  } as any;
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('McpController', () => {
  let controller: McpController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new McpController(mockMcpService as any);
  });

  describe('POST /mcp', () => {
    it('delegates to mcpService.handleRequest with req, res, and body', async () => {
      const body = { jsonrpc: '2.0', method: 'initialize', id: 1 };
      const req = makeReq(body);
      const res = makeRes();

      await controller.post(req, res);

      expect(mockHandleRequest).toHaveBeenCalledTimes(1);
      expect(mockHandleRequest).toHaveBeenCalledWith(req, res, body);
    });

    it('propagates errors thrown by handleRequest', async () => {
      const error = new Error('transport error');
      mockHandleRequest.mockRejectedValueOnce(error);

      await expect(controller.post(makeReq(), makeRes())).rejects.toThrow('transport error');
    });
  });

  describe('GET /mcp', () => {
    it('delegates to mcpService.handleRequest with undefined body', async () => {
      const req = makeReq();
      const res = makeRes();

      await controller.get(req, res);

      expect(mockHandleRequest).toHaveBeenCalledTimes(1);
      expect(mockHandleRequest).toHaveBeenCalledWith(req, res, undefined);
    });

    it('propagates errors thrown by handleRequest', async () => {
      const error = new Error('SSE error');
      mockHandleRequest.mockRejectedValueOnce(error);

      await expect(controller.get(makeReq(), makeRes())).rejects.toThrow('SSE error');
    });
  });

  describe('DELETE /mcp', () => {
    it('delegates to mcpService.handleRequest with undefined body', async () => {
      const req = makeReq();
      const res = makeRes();

      await controller.delete(req, res);

      expect(mockHandleRequest).toHaveBeenCalledTimes(1);
      expect(mockHandleRequest).toHaveBeenCalledWith(req, res, undefined);
    });

    it('propagates errors thrown by handleRequest', async () => {
      const error = new Error('delete error');
      mockHandleRequest.mockRejectedValueOnce(error);

      await expect(controller.delete(makeReq(), makeRes())).rejects.toThrow('delete error');
    });
  });
});
