import { DEVELOPER_PORTAL_CQRS_HANDLERS } from './developer-portal/developer-portal.handlers';
import { MESSAGE_CQRS_HANDLERS } from './messages/messages.handlers';
import { OAUTH_CQRS_HANDLERS } from './oauth/oauth.handlers';
import { SIMULATION_CQRS_HANDLERS as SIMULATION_RUNTIME_CQRS_HANDLERS } from './simulation/simulation.handlers';
import { VAT_CQRS_HANDLERS } from './vat/vat.handlers';

/**
 * Aggregates all simulation command and query handlers for module registration.
 */
export const SIMULATION_CQRS_HANDLERS = [
  ...DEVELOPER_PORTAL_CQRS_HANDLERS,
  ...MESSAGE_CQRS_HANDLERS,
  ...OAUTH_CQRS_HANDLERS,
  ...SIMULATION_RUNTIME_CQRS_HANDLERS,
  ...VAT_CQRS_HANDLERS,
];
