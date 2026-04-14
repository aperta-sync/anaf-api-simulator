import {
  Body,
  Controller,
  NotFoundException,
  Param,
  Patch,
} from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UpdateMockIdentityOwnershipCommand } from '../../application/developer-portal/developer-portal.commands';
import { UpdateIdentityOwnershipRequestDto } from './update-identity-ownership.request.dto';

/**
 * Handles internal identity ownership override operations for test scenarios.
 */
@ApiTags('Developer Portal')
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
  @ApiOperation({ summary: 'Update CIF ownership for a mock identity', description: 'Replaces the list of CUIs that the given signer identity is authorized to act on behalf of. Used to test ownership-restricted scenarios.' })
  @ApiParam({ name: 'identityId', description: 'Signer identity ID (from the identities list)' })
  @ApiResponse({ status: 200, description: 'Updated identity object' })
  @ApiResponse({ status: 404, description: 'Not Found — identityId does not exist' })
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
