import { IsIn, IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';

/**
 * Data transfer object for OAuthAuthorizeQueryDto.
 *
 * @remarks Used by: src/simulation/dto/oauth-authorize-query.dto.ts, src/simulation/oauth/commands/oauth.command.http.controller.ts.
 */
export class OAuthAuthorizeQueryDto {
  /**
   * The response_type value.
   */
  @IsString()
  @IsNotEmpty()
  response_type!: string;

  /**
   * The client_id value.
   */
  @IsString()
  @IsNotEmpty()
  client_id!: string;

  /**
   * The redirect_uri value.
   */
  @IsString()
  @IsNotEmpty()
  @IsUrl({ require_tld: false })
  redirect_uri!: string;

  /**
   * The state value.
   */
  @IsOptional()
  @IsString()
  state?: string;

  /**
   * The identity_id value.
   */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  identity_id?: string;

  /**
   * The token_content_type value.
   */
  @IsOptional()
  @IsString()
  token_content_type?: string;

  /**
   * The simulate_esign value.
   */
  @IsOptional()
  @IsString()
  @IsIn(['ok', 'incorrect_credentials', 'network_issue', 'server_error'])
  simulate_esign?: string;
}
