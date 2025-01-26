
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();

    const { method, url, body, params, query } = req;
    const user = req.user ? `${req.user.id} (${req.user.email})` : 'Guest';

    const now = Date.now();
    this.logger.log(
      `Incoming Request: ${method} ${url} | User: ${user} | Params: ${JSON.stringify(
        params,
      )} | Query: ${JSON.stringify(query)} | Body: ${JSON.stringify(body)}`,
    );

    return next
      .handle()
      .pipe(
        tap((response) =>
          this.logger.log(
            `Outgoing Response: ${method} ${url} | User: ${user} | Response: ${JSON.stringify(
              response,
            )} | Time: ${Date.now() - now}ms`,
          ),
        ),
      );
  }
}
