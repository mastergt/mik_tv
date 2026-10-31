import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type {Request} from 'express';
import { Public } from '../auth/guard';
import { ClientGuard, ClientRequest } from './client-auth';
import { ClientIdentityService } from './client-identity.service';
import { ClientCatalogService } from './client-catalog.service';
import { ClientPlaybackService } from './client-playback.service';
import { ClientMessagesService } from './client-messages.service';

@Public()
@Controller('client')
export class ClientBootstrapController {
  constructor(@Inject(ClientIdentityService) private readonly identity:ClientIdentityService){}
  @Get('bootstrap') bootstrap(){return this.identity.bootstrap();}
  @Post('register') @HttpCode(201) register(@Body() data:unknown,@Req() req:Request){return this.identity.register(data,req);}
}

@Public()
@UseGuards(ClientGuard)
@Controller('client')
export class ClientController {
  constructor(@Inject(ClientIdentityService) private readonly identity:ClientIdentityService,
    @Inject(ClientCatalogService) private readonly catalog:ClientCatalogService,
    @Inject(ClientPlaybackService) private readonly playback:ClientPlaybackService,
    @Inject(ClientMessagesService) private readonly messages:ClientMessagesService){}
  @Post('auth/login') @HttpCode(200) login(@Req() req:ClientRequest,@Body() data:unknown){
    return this.identity.login(req.client,data,req);
  }
  @Post('auth/renew') @HttpCode(200) renew(@Req() req:ClientRequest){return this.identity.renew(req.client,req);}
  @Post('auth/logout') @HttpCode(200) logout(@Req() req:ClientRequest){return this.identity.logout(req.client);}
  @Get('me') me(@Req() req:ClientRequest){return this.identity.me(req.client);}
  @Post('heartbeat') @HttpCode(200) heartbeat(@Req() req:ClientRequest){return this.identity.heartbeat(req.client);}
  @Get('streams') streams(@Req() req:ClientRequest,
    @Query() q:{limit?:string;offset?:string;app_type?:string}){return this.catalog.streams(req.client,q);}
  @Get('streams/:id/epg') epg(@Req() req:ClientRequest,@Param('id') id:string,
    @Query('from') from?:string,@Query('to') to?:string){return this.catalog.epg(req.client,id,from,to);}
  @Get('streams/:id/dvr') dvr(@Req() req:ClientRequest,@Param('id') id:string,
    @Query('start') start?:string,@Query('end') end?:string){return this.catalog.dvr(req.client,id,start,end);}
  @Get('settings') settings(@Req() req:ClientRequest){return this.catalog.settings(req.client);}
  @Patch('settings') saveSettings(@Req() req:ClientRequest,@Body() raw:unknown){return this.catalog.saveSettings(req.client,raw);}
  @Get('favorites') favorites(@Req() req:ClientRequest){return this.catalog.favorites(req.client);}
  @Post('favorites/:id') @HttpCode(200) favorite(@Req() req:ClientRequest,@Param('id') id:string){
    return this.catalog.setFavorite(req.client,id,true);
  }
  @Delete('favorites/:id') favoriteOff(@Req() req:ClientRequest,@Param('id') id:string){
    return this.catalog.setFavorite(req.client,id,false);
  }
  @Post('playback/start') @HttpCode(200) start(@Req() req:ClientRequest,@Body() data:unknown){
    return this.playback.start(req.client,data);
  }
  @Post('playback/heartbeat') @HttpCode(200) playbackHeartbeat(@Req() req:ClientRequest,@Body() data:unknown){
    return this.playback.heartbeat(req.client,data);
  }
  @Post('playback/stop') @HttpCode(200) stop(@Req() req:ClientRequest,@Body() data:unknown){
    return this.playback.stop(req.client,data);
  }
  @Get('messages') messagesList(@Req() req:ClientRequest){return this.messages.list(req.client);}
  @Patch('messages/:id/receipt') receipt(@Req() req:ClientRequest,@Param('id') id:string,@Body() raw:unknown){
    return this.messages.receipt(req.client,id,raw);
  }
}
