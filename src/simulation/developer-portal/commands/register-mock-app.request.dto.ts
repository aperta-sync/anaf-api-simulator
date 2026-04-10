import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsString,
  IsUrl,
} from 'class-validator';

/**
 * Data transfer object for RegisterMockAppDto.
 *
 * @remarks Used by: src/simulation/developer-portal/commands/developer-portal.command.http.controller.ts, src/simulation/dto/register-mock-app.dto.ts.
 */
export class RegisterMockAppDto {
  /**
   * The applicationName value.
   */
  @IsString()
  @IsNotEmpty()
  applicationName!: string;

  /**
   * The redirectUris value.
   */
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @IsUrl({ require_tld: false }, { each: true })
  redirectUris!: string[];
}
