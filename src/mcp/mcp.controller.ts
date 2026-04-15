import { Controller, Delete, Get, Post, Req, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { McpService } from './mcp.service';

/**
 * Handles MCP (Model Context Protocol) Streamable HTTP transport endpoints.
 *
 * POST   /mcp  — initializes a new session or forwards messages for an existing one
 * GET    /mcp  — optional standalone SSE stream for server-initiated notifications
 * DELETE /mcp  — terminates an existing session
 */
@ApiExcludeController()
@Controller('mcp')
export class McpController {
  constructor(private readonly mcpService: McpService) {}

  @Post()
  async post(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.mcpService.handleRequest(req as any, res as any, req.body);
  }

  @Get()
  async get(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.mcpService.handleRequest(req as any, res as any, undefined);
  }

  @Delete()
  async delete(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.mcpService.handleRequest(req as any, res as any, undefined);
  }
}
