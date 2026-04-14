import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { McpController } from './mcp.controller';

// ── McpService mock ────────────────────────────────────────────────────────────

const mockConnectSse = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockHandleMessage = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

const mockMcpService = {
  connectSse: mockConnectSse,
  handleMessage: mockHandleMessage,
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeReq(body: unknown = {}) {
  return { body } as any;
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

  describe('GET /mcp/sse', () => {
    it('delegates to mcpService.connectSse with /mcp/messages endpoint and res', async () => {
      const req = makeReq();
      const res = makeRes();

      await controller.sse(req, res);

      expect(mockConnectSse).toHaveBeenCalledTimes(1);
      expect(mockConnectSse).toHaveBeenCalledWith('/mcp/messages', res);
    });

    it('propagates errors thrown by connectSse', async () => {
      const error = new Error('SSE failed');
      mockConnectSse.mockRejectedValueOnce(error);

      await expect(controller.sse(makeReq(), makeRes())).rejects.toThrow('SSE failed');
    });
  });

  describe('POST /mcp/messages', () => {
    it('delegates to mcpService.handleMessage with sessionId, req, res, and body', async () => {
      const body = { jsonrpc: '2.0', method: 'tools/list', id: 1 };
      const req = makeReq(body);
      const res = makeRes();

      await controller.messages('sess-abc', req, res);

      expect(mockHandleMessage).toHaveBeenCalledTimes(1);
      expect(mockHandleMessage).toHaveBeenCalledWith('sess-abc', req, res, body);
    });

    it('passes an empty string sessionId when query param is absent', async () => {
      const req = makeReq({});
      const res = makeRes();

      await controller.messages(undefined as any, req, res);

      expect(mockHandleMessage).toHaveBeenCalledWith(undefined, req, res, {});
    });

    it('propagates errors thrown by handleMessage', async () => {
      const error = new Error('transport error');
      mockHandleMessage.mockRejectedValueOnce(error);

      await expect(
        controller.messages('sess-xyz', makeReq(), makeRes()),
      ).rejects.toThrow('transport error');
    });
  });
});
