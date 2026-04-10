/**
 * Validates an OAuth bearer authorization header.
 */
export class ValidateAuthorizationHeaderQuery {
  /**
   * Creates an instance of ValidateAuthorizationHeaderQuery.
   * @param authorizationHeader Value for authorizationHeader.
   */
  constructor(public readonly authorizationHeader: string | undefined) {}
}
