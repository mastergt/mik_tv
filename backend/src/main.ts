import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import * as log4js from 'log4js';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { configureLogging, LoggerService, httpAccessLogger } from './logger/logger.service';

async function main() {
  if (process.env.NODE_ENV==='production' && process.env.COOKIE_SECURE!=='true') throw new Error('COOKIE_SECURE=true required in production');
  const app=await NestFactory.create(AppModule,{bodyParser:true, logger: new LoggerService()});
  app.use(helmet());
  const accessLogger = httpAccessLogger();
  if (accessLogger) app.use(accessLogger);
  app.setGlobalPrefix('api/v1');
  const origins=(process.env.CORS_ORIGINS??'').split(',').map(x=>x.trim()).filter(Boolean);
  if(origins.length)app.enableCors({origin:origins,credentials:true,methods:['GET','POST','PUT','PATCH','DELETE','OPTIONS']});
  app.useGlobalPipes(new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:false}));
  app.enableShutdownHooks();
  const port=Number(process.env.PORT??4012);
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid PORT');
  await app.listen(port,'127.0.0.1');
  new LoggerService().info(`IPTV Admin API running on 127.0.0.1:${port}`, 'Bootstrap');
}
try {
  configureLogging();
  void main().catch(err => {
    new LoggerService().fatal(err, 'Bootstrap');
    log4js.shutdown(() => process.exit(1));
  });
} catch (err) {
  console.error('Log4js initialization failed:', err);
  process.exitCode = 1;
}
