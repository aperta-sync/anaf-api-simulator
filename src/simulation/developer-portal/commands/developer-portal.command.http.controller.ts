import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RegisterMockAppDto } from './register-mock-app.request.dto';
import { UpdateMockAppDto } from './update-mock-app.request.dto';
import {
  ResetPortalStateCommand,
  RegisterMockApplicationCommand,
  RemoveMockApplicationCommand,
  UpdateMockApplicationCommand,
} from '../../application/developer-portal/developer-portal.commands';
import { SimulationTypes } from '../../domain/simulation.types';

/**
 * Handles mutating developer portal API operations for mock applications.
 */
@ApiTags('Developer Portal')
@Controller('developer-portal/api/apps')
export class DeveloperPortalCommandHttpController {
  /**
   * Creates an instance of DeveloperPortalCommandHttpController.
   * @param commandBus Value for commandBus.
   */
  constructor(private readonly commandBus: CommandBus) {}

  /**
   * Registers a new mock application via JSON API.
   *
   * @param dto Validated app registration payload.
   * @returns Newly issued client credentials and metadata.
   */
  @Post()
  @ApiOperation({ summary: 'Register a new mock OAuth application' })
  @ApiResponse({ status: 201, description: 'Created — returns clientId, clientSecret, redirectUris and metadata' })
  async registerFromApi(@Body() dto: RegisterMockAppDto) {
    const registered = await this.commandBus.execute(
      new RegisterMockApplicationCommand(
        dto.applicationName,
        dto.redirectUris,
        'portal',
      ),
    );

    return this.toApiModel(registered);
  }

  /**
   * Updates mutable properties of a registered mock application.
   *
   * @param clientId OAuth client identifier.
   * @param dto Partial update payload containing a new name and/or redirect URI list.
   * @returns Updated application details.
   */
  @Patch(':clientId')
  @ApiOperation({ summary: 'Update a mock application\'s name or redirect URIs' })
  @ApiParam({ name: 'clientId', description: 'OAuth client identifier' })
  @ApiResponse({ status: 200, description: 'Updated application details' })
  @ApiResponse({ status: 404, description: 'Not Found — clientId does not exist' })
  async updateApplication(
    @Param('clientId') clientId: string,
    @Body() dto: UpdateMockAppDto,
  ) {
    if (
      typeof dto.applicationName !== 'string' &&
      !Array.isArray(dto.redirectUris)
    ) {
      throw new BadRequestException(
        'At least one field is required: applicationName or redirectUris.',
      );
    }

    const updated = await this.commandBus.execute(
      new UpdateMockApplicationCommand(clientId, {
        applicationName: dto.applicationName,
        redirectUris: dto.redirectUris,
      }),
    );

    if (!updated) {
      throw new NotFoundException(
        `Mock application ${clientId} was not found.`,
      );
    }

    return {
      application: this.toApiModel(updated),
    };
  }

  /**
   * Deletes a registered application.
   *
   * @param clientId OAuth client identifier.
   */
  @Delete(':clientId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a mock application' })
  @ApiParam({ name: 'clientId', description: 'OAuth client identifier' })
  @ApiResponse({ status: 204, description: 'No Content — deleted successfully' })
  @ApiResponse({ status: 404, description: 'Not Found — clientId does not exist' })
  async removeApplication(@Param('clientId') clientId: string): Promise<void> {
    const deleted = await this.commandBus.execute(
      new RemoveMockApplicationCommand(clientId),
    );
    if (!deleted) {
      throw new NotFoundException(
        `Mock application ${clientId} was not found.`,
      );
    }
  }

  /**
   * Resets portal-managed mutable state back to startup defaults.
   */
  @Post('reset-defaults')
  @ApiOperation({ summary: 'Reset portal state to startup defaults', description: 'Resets simulation config, clears portal-registered apps, and reinitializes mock state.' })
  @ApiResponse({ status: 201, description: 'Reset summary — config, requestCount, applications' })
  async resetDefaults() {
    const result = await this.commandBus.execute(new ResetPortalStateCommand());

    return {
      config: result.config,
      requestCount: result.requestCount,
      applications: result.applications.map((app) => this.toApiModel(app)),
    };
  }

  /**
   * Converts internal registration objects into API response shape.
   *
   * @param app Internal application entity.
   * @returns Serialized API model.
   */
  private toApiModel(app: SimulationTypes.RegisteredMockApplication) {
    return {
      applicationName: app.applicationName,
      clientId: app.clientId,
      clientSecret: app.clientSecret,
      redirectUris: app.redirectUris,
      createdAt: app.createdAt,
      source: app.source,
    };
  }
}
