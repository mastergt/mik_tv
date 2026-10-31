import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, Inject } from '@nestjs/common';
import { AdminRequest } from '../auth/authz';
import { CatalogService } from './catalog.service';
@Controller()
export class CatalogController {
  constructor(@Inject(CatalogService) private readonly svc:CatalogService){}
  @Get('app-types') appTypes(@Req() req:AdminRequest) {return this.svc.appTypes(req.admin);}
  @Post('app-types') createAppType(@Req() req:AdminRequest,@Body() raw:unknown) {return this.svc.createAppType(req.admin,raw);}
  @Patch('app-types/:id') updateAppType(@Req() req:AdminRequest,@Param('id') id:string,@Body() raw:unknown) {return this.svc.updateAppType(req.admin,id,raw);}
  @Get('genres') genres(@Req() req:AdminRequest,@Query('providerId') pid?:string) {return this.svc.genres(req.admin,pid);}
  @Post('genres') createGenre(@Req() req:AdminRequest,@Body() raw:unknown) {return this.svc.createGenre(req.admin,raw);}
  @Patch('genres/:id') updateGenre(@Req() req:AdminRequest,@Param('id') id:string,@Body() raw:unknown) {return this.svc.updateGenre(req.admin,id,raw);}
  @Get('streams') streams(@Req() req:AdminRequest,@Query() q:any) {return this.svc.streams(req.admin,q);}
  @Get('streams/:id') stream(@Req() req:AdminRequest,@Param('id') id:string,@Query('providerId') pid?:string) {return this.svc.stream(req.admin,id,pid);}
  @Post('streams') createStream(@Req() req:AdminRequest,@Body() raw:unknown) {return this.svc.createStream(req.admin,raw);}
  @Patch('streams/:id') updateStream(@Req() req:AdminRequest,@Param('id') id:string,@Body() raw:unknown) {return this.svc.updateStream(req.admin,id,raw);}
  @Delete('streams/:id') deleteStream(@Req() req:AdminRequest,@Param('id') id:string) {return this.svc.deleteStream(req.admin,id);}
  @Get('streams/:id/sources') sources(@Req() req:AdminRequest,@Param('id') id:string,@Query('providerId') pid?:string) {return this.svc.sources(req.admin,id,pid);}
  @Post('streams/:id/sources') createSource(@Req() req:AdminRequest,@Param('id') id:string,@Body() raw:unknown) {return this.svc.createSource(req.admin,id,raw);}
  @Patch('sources/:id') updateSource(@Req() req:AdminRequest,@Param('id') id:string,@Body() raw:unknown) {return this.svc.updateSource(req.admin,id,raw);}
  @Delete('sources/:id') deleteSource(@Req() req:AdminRequest,@Param('id') id:string) {return this.svc.deleteSource(req.admin,id);}
  @Get('playlists') playlists(@Req() req:AdminRequest,@Query() q:any) {return this.svc.playlists(req.admin,q);}
  @Get('playlists/:id') playlist(@Req() req:AdminRequest,@Param('id') id:string,@Query('providerId') pid?:string) {return this.svc.playlist(req.admin,id,pid);}
  @Post('playlists') createPlaylist(@Req() req:AdminRequest,@Body() raw:unknown) {return this.svc.createPlaylist(req.admin,raw);}
  @Patch('playlists/:id') updatePlaylist(@Req() req:AdminRequest,@Param('id') id:string,@Body() raw:unknown) {return this.svc.updatePlaylist(req.admin,id,raw);}
  @Put('playlists/:id/streams') items(@Req() req:AdminRequest,@Param('id') id:string,@Body() raw:unknown) {return this.svc.replacePlaylistItems(req.admin,id,raw);}
  @Delete('playlists/:id') deletePlaylist(@Req() req:AdminRequest,@Param('id') id:string) {return this.svc.deletePlaylist(req.admin,id);}
}
