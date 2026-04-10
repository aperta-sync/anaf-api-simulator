import { IsArray, IsString, Matches } from 'class-validator';

/**
 * Data transfer object for UpdateIdentityOwnershipRequestDto.
 *
 * @remarks Used by: src/simulation/developer-portal/commands/developer-portal.identity.command.http.controller.ts.
 */
export class UpdateIdentityOwnershipRequestDto {
  /**
   * The authorizedCuis value.
   */
  @IsArray()
  @IsString({ each: true })
  @Matches(/^RO?\d{2,10}$/i, {
    each: true,
    message:
      'Each value in authorizedCuis must be a Romanian CIF format like RO10000008.',
  })
  authorizedCuis!: string[];
}
