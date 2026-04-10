import { IsArray, IsOptional, IsString, IsUrl } from 'class-validator';

/**
 * Data transfer object for UpdateMockAppDto.
 *
 * @remarks Used by: src/simulation/developer-portal/commands/developer-portal.command.http.controller.ts, src/simulation/dto/update-mock-app.dto.ts.
 */
export class UpdateMockAppDto {
  /**
   * The applicationName value.
   */
  @IsOptional()
  @IsString()
  applicationName?: string;

  /**
   * The redirectUris value.
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsUrl({ require_tld: false }, { each: true })
  redirectUris?: string[];
}
