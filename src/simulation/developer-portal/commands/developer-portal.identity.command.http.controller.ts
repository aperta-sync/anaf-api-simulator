import {
  Body,
  Controller,
  NotFoundException,
  Param,
  Patch,
} from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { UpdateMockIdentityOwnershipCommand } from '../../application/developer-portal/developer-portal.commands';
import { UpdateIdentityOwnershipRequestDto } from './update-identity-ownership.request.dto';

/**
 * Handles internal identity ownership override operations for test scenarios.
 */
@Controller('developer-portal/api/internal/identities')
export class DeveloperPortalIdentityCommandHttpController {
  /**
   * Creates an instance of DeveloperPortalIdentityCommandHttpController.
   * @param commandBus Value for commandBus.
   */
  constructor(private readonly commandBus: CommandBus) {}

  /**
   * Replaces authorized CIF ownership for a signer identity.
   */
  @Patch(':identityId/ownership')
  async updateOwnership(
    @Param('identityId') identityId: string,
    @Body() dto: UpdateIdentityOwnershipRequestDto,
  ) {
    const updated = await this.commandBus.execute(
      new UpdateMockIdentityOwnershipCommand(identityId, dto.authorizedCuis),
    );

    if (!updated) {
      throw new NotFoundException(
        `Mock identity ${identityId} was not found for ownership update.`,
      );
    }

    return {
      identity: updated,
    };
  }
}
