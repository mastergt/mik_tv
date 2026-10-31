import { Body, Controller, Get, Param, Patch, Post, Query, Req, Inject } from '@nestjs/common';
import { AdminRequest } from '../auth/authz';
import { ProvidersService } from './providers.service';
@Controller('providers')
export class ProvidersController {
  constructor(@Inject(ProvidersService) private readonly service:ProvidersService){}
  @Get() list(@Req() req:AdminRequest,@Query() query:{limit?:string;offset?:string}) { return this.service.list(req.admin,query); }
  @Get(':id') get(@Req() req:AdminRequest,@Param('id') id:string) { return this.service.get(req.admin,id); }
  @Post() create(@Req() req:AdminRequest,@Body() body:unknown) { return this.service.create(req.admin,body); }
  @Patch(':id') update(@Req() req:AdminRequest,@Param('id') id:string,@Body() body:unknown) { return this.service.update(req.admin,id,body); }
}
