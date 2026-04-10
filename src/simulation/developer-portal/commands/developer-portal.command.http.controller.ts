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
import { RegisterMockAppDto } from './register-mock-app.request.dto';
import { UpdateMockAppDto } from './update-mock-app.request.dto';
import {
  RegisterMockApplicationCommand,
  RemoveMockApplicationCommand,
  UpdateMockApplicationCommand,
} from '../../application/developer-portal/developer-portal.commands';
import { SimulationTypes } from '../../domain/simulation.types';

/**
 * Handles mutating developer portal API operations for mock applications.
 */
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
