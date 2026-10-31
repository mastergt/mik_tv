import {Body,Controller,Delete,Get,Header,Inject,Param,Patch,Post,Query,Req} from '@nestjs/common';
import {AdminRequest} from '../auth/authz';
import {SubscribersService} from './subscribers.service';
@Controller('abonents')
export class SubscribersController {
 constructor(@Inject(SubscribersService) private svc:SubscribersService){}
 @Get() list(@Req() req:AdminRequest,@Query() q:{providerId?:string;search?:string;limit?:string;offset?:string}){return this.svc.list(req.admin,q);}
 @Get(':id') get(@Req() req:AdminRequest,@Param('id') id:string){return this.svc.get(req.admin,id);}
 @Post() create(@Req() req:AdminRequest,@Body() raw:unknown){return this.svc.create(req.admin,raw);}
 @Patch(':id') update(@Req() req:AdminRequest,@Param('id') id:string,@Body() raw:unknown){return this.svc.update(req.admin,id,raw);}
 @Post(':id/reveal-password') @Header('Cache-Control','no-store') reveal(@Req() req:AdminRequest,@Param('id') id:string){return this.svc.reveal(req.admin,id);}
 @Get(':id/entitlements') entitlements(@Req() req:AdminRequest,@Param('id') id:string){return this.svc.entitlements(req.admin,id);}
 @Post(':id/playlists') grantPlaylist(@Req() req:AdminRequest,@Param('id') id:string,@Body() raw:unknown){return this.svc.grant(req.admin,id,'playlists',raw);}
 @Delete(':id/playlists/:itemId') revokePlaylist(@Req() req:AdminRequest,@Param('id') id:string,@Param('itemId') itemId:string){return this.svc.revoke(req.admin,id,'playlists',itemId);}
 @Post(':id/streams') grantStream(@Req() req:AdminRequest,@Param('id') id:string,@Body() raw:unknown){return this.svc.grant(req.admin,id,'streams',raw);}
 @Delete(':id/streams/:itemId') revokeStream(@Req() req:AdminRequest,@Param('id') id:string,@Param('itemId') itemId:string){return this.svc.revoke(req.admin,id,'streams',itemId);}
}
