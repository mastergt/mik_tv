import { Controller, Post, Get, Req, Res, Body, Param, Query, ForbiddenException, Inject } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { Public } from './guard';
import { AdminRequest } from './authz';
import { Authz } from './authz';
function cookie(req:Request,name:string) {
  return req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1);
}
function assertCookieOrigin(req:Request) {
  const origin=req.headers.origin;
  if(!origin)return; // CLI clients do not normally send Origin; browser POSTs do.
  const configured=[process.env.PUBLIC_API_URL,process.env.ADMIN_WEB_URL,...(process.env.CORS_ORIGINS??'').split(',')]
    .filter((s):s is string=>Boolean(s));
  const trusted=configured.some(value=>{
    try{return new URL(value).origin===origin;}catch{return false;}
  });
  if(!trusted)throw new ForbiddenException('Untrusted browser Origin');
}
@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly service:AuthService, @Inject(Authz) private readonly authz:Authz) {}
  @Public() @Post('login') login(@Body() body:{username:string,password:string},@Res({passthrough:true}) res:Response,@Req() req:Request) {
    return this.service.login(body?.username,body?.password,res,req);
  }
  @Public() @Post('refresh') refresh(@Req() req:Request,@Res({passthrough:true}) res:Response) {
    assertCookieOrigin(req);return this.service.refresh(cookie(req,'iptv_admin_refresh'),res,req);
  }
  @Public() @Post('logout') logout(@Req() req:Request,@Res({passthrough:true}) res:Response) {
    assertCookieOrigin(req);return this.service.logout(cookie(req,'iptv_admin_refresh'),res);
  }
  @Get('me') async me(@Req() req:AdminRequest) {
    return {user:req.admin,permissions:await this.authz.capabilities(req.admin)};
  }
  @Public() @Get('oidc/:provider/start') start(@Param('provider') code:string,@Res() res:Response) {
    return this.service.oidcStart(code,res);
  }
  @Public() @Get('oidc/:provider/callback') callback(@Param('provider') code:string,@Query('state') state:string,
    @Query('code') authCode:string,@Req() req:Request,@Res() res:Response) {
    return this.service.oidcCallback(code,state,authCode,cookie(req,'iptv_oidc_state'),res,req);
  }
}
