import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, SetMetadata, Inject } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service';
import { AdminRequest } from './authz';
export const Public = () => SetMetadata('publicRoute',true);
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth:AuthService, @Inject(Reflector) private readonly reflector:Reflector) {}
  async canActivate(ctx:ExecutionContext) {
    if(this.reflector.getAllAndOverride<boolean>('publicRoute',[ctx.getHandler(),ctx.getClass()])) return true;
    const req=ctx.switchToHttp().getRequest<AdminRequest>();
    const header=req.headers.authorization??'';
    if(!header.startsWith('Bearer ')) throw new UnauthorizedException('Bearer token required');
    req.admin=await this.auth.actorFromToken(header.slice(7));
    return true;
  }
}
