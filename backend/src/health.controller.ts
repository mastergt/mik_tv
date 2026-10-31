import { Controller, Get } from '@nestjs/common';
import { Public } from './auth/guard';
@Controller('health')
export class HealthController { @Public() @Get() check() {return {status:'ok',service:'iptv-admin-api',version:'0.1.0'};} }
