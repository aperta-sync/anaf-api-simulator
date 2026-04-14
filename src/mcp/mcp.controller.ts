import { Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { McpService } from './mcp.service';

/**
 * Handles MCP (Model Context Protocol) SSE transport endpoints.
 *
 * GET  /mcp/sse          — establishes an SSE connection; the SDK sends an
 *                          `endpoint` event pointing to POST /mcp/messages
 * POST /mcp/messages     — JSON-RPC message handler for an established session
 */
@ApiExcludeController()
@Controller('mcp')
export class McpController {
  constructor(private readonly mcpService: McpService) {}

  @Get('sse')
  async sse(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.mcpService.connectSse('/mcp/messages', res as any);
  }

  @Post('messages')
  async messages(
    @Query('sessionId') sessionId: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    await this.mcpService.handleMessage(sessionId, req as any, res as any, req.body);
  }
}
