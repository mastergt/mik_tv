import { Body, Controller, Get, Param, Patch, Post, Query, Req, Inject, Delete, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../auth/guard';
import { AdminRequest } from '../auth/authz';
import { ProvidersService } from './providers.service';
@Controller('providers')
export class ProvidersController {
  constructor(@Inject(ProvidersService) private readonly service:ProvidersService){}
  @Get() list(@Req() req:AdminRequest,@Query() query:{limit?:string;offset?:string}) { return this.service.list(req.admin,query); }
  @Public() @Get('logos/:filename') async logo(@Param('filename') filename:string,@Res() res:Response) {
    const bytes=await this.service.logoFile(filename);
    res.setHeader('Content-Type','image/png');res.setHeader('Cache-Control','public,max-age=31536000,immutable');res.setHeader('X-Content-Type-Options','nosniff');res.end(bytes);
  }
  @Post(':id/logo') uploadLogo(@Req() req:AdminRequest,@Param('id') id:string,@Body() body:unknown){return this.service.uploadLogo(req.admin,id,body);}
  @Delete(':id/logo') removeLogo(@Req() req:AdminRequest,@Param('id') id:string){return this.service.removeLogo(req.admin,id);}
  @Get(':id') get(@Req() req:AdminRequest,@Param('id') id:string) { return this.service.get(req.admin,id); }
  @Post() create(@Req() req:AdminRequest,@Body() body:unknown) { return this.service.create(req.admin,body); }
  @Patch(':id') update(@Req() req:AdminRequest,@Param('id') id:string,@Body() body:unknown) { return this.service.update(req.admin,id,body); }
}
