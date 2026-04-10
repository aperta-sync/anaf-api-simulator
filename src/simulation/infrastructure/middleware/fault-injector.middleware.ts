import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { SimulationEngineService } from '../../application/services/simulation-engine.service';

/**
 * Injects latency, transient faults and rate limiting into simulated API routes.
 */
@Injectable()
export class FaultInjectorMiddleware implements NestMiddleware {
  /**
   * Creates an instance of FaultInjectorMiddleware.
   * @param simulationEngine Value for simulationEngine.
   */
  constructor(private readonly simulationEngine: SimulationEngineService) {}

  /**
   * Applies fault-injection rules for eligible requests.
   *
   * @param req Express request object.
   * @param res Express response object.
   * @param next Express next callback.
   */
  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const isAdminRoute =
      req.path === '/' ||
      req.path.startsWith('/developer-portal') ||
      req.path.startsWith('/simulation');

    if (isAdminRoute) {
      next();
      return;
    }

    const config = this.simulationEngine.getConfig();
    const requestCount = this.simulationEngine.incrementRequestCount();

    if (config.latencyMs > 0) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, config.latencyMs);
      });
    }

    const isRateLimitedEndpoint =
      req.path.includes('/FCTEL/rest/') ||
      req.path.includes('/PlatitorTvaRest/');

    const rateLimitMode = config.rateLimitMode;

    if (
      rateLimitMode === 'deterministic' &&
      isRateLimitedEndpoint &&
      requestCount % 5 === 0
    ) {
      res.status(429).json({
        cod: 429,
        message: 'Rate limit simulated by fault injector (Every 5th request)',
        path: req.path,
        requestCount,
      });
      return;
    }

    if (rateLimitMode === 'windowed' && isRateLimitedEndpoint) {
      const endpointGroup = req.path.includes('/FCTEL/rest/')
        ? 'efactura'
        : 'vat';
      const clientKey = this.resolveRateLimitClientKey(req);
      const state = this.simulationEngine.evaluateWindowRateLimit(
        `${endpointGroup}:${clientKey}`,
        config.rateLimitMaxRequests,
        config.rateLimitWindowMs,
      );

      res.setHeader('X-RateLimit-Limit', String(config.rateLimitMaxRequests));
      res.setHeader('X-RateLimit-Remaining', String(state.remaining));
      res.setHeader('X-RateLimit-Reset', String(state.resetAt));

      if (state.limited) {
        res.setHeader('Retry-After', String(state.retryAfterSeconds));
        res.status(429).json({
          cod: 429,
          message: `Rate limit simulated by fault injector (${
            config.rateLimitMaxRequests
          } requests per ${Math.round(
            config.rateLimitWindowMs / 1_000,
          )}s window)`,
          mode: 'windowed',
          path: req.path,
          requestCount,
        });
        return;
      }
    }

    if (config.errorRate > 0 && Math.random() * 100 < config.errorRate) {
      const isTimeoutFault = Math.random() < 0.35;

      if (isTimeoutFault) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 1_000);
        });

        res.status(504).json({
          cod: 504,
          message: 'Upstream timeout simulated by fault injector',
          path: req.path,
          requestCount,
        });
        return;
      }

      res.status(500).json({
        cod: 500,
        message: 'Random server fault injected by simulator',
        path: req.path,
        requestCount,
      });
      return;
    }

    next();
  }

  /**
   * Builds a stable per-client key for windowed rate limiting.
   */
  private resolveRateLimitClientKey(req: Request): string {
    const authHeader = String(req.headers.authorization ?? '');
    const bearer = authHeader.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
    if (bearer) {
      return `token:${bearer.slice(0, 24)}`;
    }

    const forwardedFor = String(req.headers['x-forwarded-for'] ?? '')
      .split(',')[0]
      ?.trim();

    return forwardedFor || req.ip || 'anonymous';
  }
}
