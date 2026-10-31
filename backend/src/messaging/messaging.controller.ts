import {Body,Controller,Get,Inject,Param,Patch,Post,Delete,Query,Req,UseInterceptors,UploadedFile,Res,Header} from '@nestjs/common';
import {FileInterceptor} from '@nestjs/platform-express';
import {Public} from '../auth/guard';
import type {Response} from 'express';
import {MessageImageService} from './message-image.service';
import {MessagingService} from './messaging.service';
import {AdminRequest} from '../auth/authz';
@Controller('messages')
export class MessagingController {
 constructor(@Inject(MessagingService) private readonly svc:MessagingService,@Inject(MessageImageService) private readonly images:MessageImageService){}
 @Post('images') @UseInterceptors(FileInterceptor('image',{limits:{fileSize:2*1024*1024,files:1}}))
 upload(@Req() req:AdminRequest,@UploadedFile() file:{buffer:Buffer;size:number},@Query('providerId') providerId?:string){
   return this.images.upload(req.admin,file,providerId);
 }
 @Public() @Get('images/:filename') async image(@Param('filename') name:string,@Res() res:Response){
   const r=await this.images.read(name);
   res.setHeader('Content-Type',r.mime);
   res.setHeader('X-Content-Type-Options','nosniff');
   res.setHeader('Content-Security-Policy',"default-src 'none'; sandbox");
   res.setHeader('Cache-Control','public, max-age=31536000, immutable');
   res.end(r.buffer);
 }
 @Get() list(@Req() req:AdminRequest,@Query() q:{providerId?:string;limit?:string;offset?:string;search?:string}){return this.svc.list(req.admin,q);}
 @Get(':id') get(@Req() req:AdminRequest,@Param('id') id:string){return this.svc.get(req.admin,id);}
 @Post() create(@Req() req:AdminRequest,@Body() body:unknown){return this.svc.create(req.admin,body);}
 @Patch(':id') update(@Req() req:AdminRequest,@Param('id') id:string,@Body() body:unknown){return this.svc.update(req.admin,id,body);}
 @Get(':id/preview') preview(@Req() req:AdminRequest,@Param('id') id:string){return this.svc.preview(req.admin,id);}
 @Post(':id/send') send(@Req() req:AdminRequest,@Param('id') id:string){return this.svc.send(req.admin,id);}
 @Post(':id/schedules') schedule(@Req() req:AdminRequest,@Param('id') id:string,@Body() body:unknown){return this.svc.schedule(req.admin,id,body);}
 @Delete(':id/schedules/:sid') disable(@Req() req:AdminRequest,@Param('id') id:string,@Param('sid') sid:string){return this.svc.disableSchedule(req.admin,id,sid);}
}
