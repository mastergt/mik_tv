import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req, Inject } from '@nestjs/common';
import { EpgService } from './epg.service';
import { EpgImportService } from './epg-import.service';
import { EpgLogoService } from './epg-logo.service';
import { Public } from '../auth/guard';
import type { Response } from 'express';
import { Res } from '@nestjs/common';
import { Authz, AdminRequest } from '../auth/authz';
@Controller('epg')
export class EpgController {
  constructor(@Inject(EpgService) private readonly svc:EpgService,
    @Inject(EpgImportService) private readonly importer:EpgImportService,
    @Inject(Authz) private readonly authz:Authz,
    @Inject(EpgLogoService) private readonly logos:EpgLogoService){}
  @Get('sources') sources(@Req() req:AdminRequest,@Query('providerId') pid?:string){return this.svc.sources(req.admin,pid);}
  @Post('sources') create(@Req() req:AdminRequest,@Body() data:unknown){return this.svc.createSource(req.admin,data);}
  @Get('sources/:id') source(@Req() req:AdminRequest,@Param('id') id:string,@Query('providerId') pid?:string){return this.svc.source(req.admin,id,pid);}
  @Patch('sources/:id') update(@Req() req:AdminRequest,@Param('id') id:string,@Body() data:unknown){return this.svc.updateSource(req.admin,id,data);}
  @Get('sources/:id/channels') channels(@Req() req:AdminRequest,@Param('id') id:string,@Query() q:any){return this.svc.channels(req.admin,id,q.search,q.limit,q.offset,q.providerId);}
  @Get('sources/:id/jobs') jobs(@Req() req:AdminRequest,@Param('id') id:string,@Query('providerId') pid?:string){return this.svc.jobs(req.admin,id,pid);}
  @Post('sources/:id/import') @HttpCode(202) async import(@Req() req:AdminRequest,@Param('id') id:string){
    await this.authz.global(req.admin,'epg.write');
    const sourceId=Number(id);
    if(!Number.isSafeInteger(sourceId)||sourceId<=0)throw new BadRequestException('Invalid source ID');
    return this.importer.requestImport(sourceId);
  }
  @Get('channel-search') search(@Req() req:AdminRequest,@Query('providerId') pid?:string,@Query('query') query?:string){return this.svc.searchChannels(req.admin,pid,query);}
  @Get('streams/:id/assignment') assignment(@Req() req:AdminRequest,@Param('id') id:string,@Query('providerId') pid?:string){return this.svc.streamAssignment(req.admin,id,pid);}
  @Post('streams/:id/logo-from-epg') importLogo(@Req() req:AdminRequest,@Param('id') id:string,@Body() body:unknown){return this.logos.fromEpg(req.admin,id,body);}
  @Public() @Get('logos/:filename') async logo(@Param('filename') filename:string,@Res() res:Response){
    const file=await this.logos.fileData(filename);
    res.setHeader('Content-Type',file.contentType);
    res.setHeader('Cache-Control','public, max-age=31536000, immutable');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Content-Security-Policy',"default-src 'none'; sandbox");
    res.end(file.body);
  }
  @Get('stream-options') streamOptions(@Req() req:AdminRequest,@Query() q:any){return this.svc.streamOptions(req.admin,q.providerId,q.search);}
  @Get('mappings') mappings(@Req() req:AdminRequest,@Query() q:any){return this.svc.mappings(req.admin,q.providerId,q.search,q.limit,q.offset);}
  @Post('mappings') mapping(@Req() req:AdminRequest,@Body() data:unknown){return this.svc.setMapping(req.admin,data);}
  @Delete('mappings/:id') remove(@Req() req:AdminRequest,@Param('id') id:string){return this.svc.removeMapping(req.admin,id);}
  @Get('programmes') programmes(@Req() req:AdminRequest,@Query() q:any){return this.svc.programmes(req.admin,q.streamId,q.providerId,q.from,q.to);}
}
