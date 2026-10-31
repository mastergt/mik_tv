import {Body,Controller,Get,Inject,Param,Patch,Post,Query,Req} from '@nestjs/common';
import {AdminRequest} from '../auth/authz';
import {TerminalsService} from './terminals.service';
@Controller('terminals')
export class TerminalsController {
 constructor(@Inject(TerminalsService) private svc:TerminalsService){}
 @Get() list(@Req() req:AdminRequest,@Query() q:{providerId?:string;abonentId?:string;search?:string;limit?:string;offset?:string}){return this.svc.list(req.admin,q);}
 @Get(':id') get(@Req() req:AdminRequest,@Param('id') id:string){return this.svc.get(req.admin,id);}
 @Post() create(@Req() req:AdminRequest,@Body() raw:unknown){return this.svc.create(req.admin,raw);}
 @Patch(':id') update(@Req() req:AdminRequest,@Param('id') id:string,@Body() raw:unknown){return this.svc.update(req.admin,id,raw);}
 @Get(':id/sessions') sessions(@Req() req:AdminRequest,@Param('id') id:string){return this.svc.sessions(req.admin,id);}
 @Post(':id/sessions/:sessionId/revoke') revoke(@Req() req:AdminRequest,@Param('id') id:string,@Param('sessionId') sid:string){return this.svc.revokeSession(req.admin,id,sid);}
 @Get(':id/playback') playback(@Req() req:AdminRequest,@Param('id') id:string){return this.svc.playback(req.admin,id);}
 @Get(':id/settings') settings(@Req() req:AdminRequest,@Param('id') id:string){return this.svc.settings(req.admin,id);}
 @Get(':id/favorites') favorites(@Req() req:AdminRequest,@Param('id') id:string){return this.svc.favorites(req.admin,id);}
}
