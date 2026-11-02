import { Module } from '@nestjs/common';
import { ClientBootstrapController, ClientController } from './client/client.controller';
import { ClientGuard } from './client/client-auth';
import { ClientIdentityService } from './client/client-identity.service';
import { ProviderDiscoveryService } from './client/provider-discovery.service';
import { ClientCatalogService } from './client/client-catalog.service';
import { ClientPlaybackService } from './client/client-playback.service';
import { ClientMessagesService } from './client/client-messages.service';
import { ClientLeaseWorker } from './client/client-lease-worker.service';
import { MessageImageService } from './messaging/message-image.service';
import { MessagingController } from './messaging/messaging.controller';
import { MessagingService } from './messaging/messaging.service';
import { MessagingWorker } from './messaging/messaging-worker.service';
import { EpgService } from './epg/epg.service';
import { EpgImportService } from './epg/epg-import.service';
import { EpgController } from './epg/epg.controller';
import { EpgLogoService } from './epg/epg-logo.service';
import { APP_GUARD } from '@nestjs/core';
import { LoggerService, LoggerShutdown } from './logger/logger.service';
import { Db } from './common/db';
import { Audit } from './common/audit';
import { Authz } from './auth/authz';
import { AuthService } from './auth/auth.service';
import { AdminGuard } from './auth/guard';
import { AuthController } from './auth/auth.controller';
import { UsersController } from './auth/users.controller';
import { ProvidersController } from './providers/providers.controller';
import { ProvidersService } from './providers/providers.service';
import { CatalogController } from './catalog/catalog.controller';
import { CatalogService } from './catalog/catalog.service';
import { HealthController } from './health.controller';
import { SubscribersController } from './subscribers/subscribers.controller';
import { TerminalsController } from './subscribers/terminals.controller';
import { SubscribersService } from './subscribers/subscribers.service';
import { TerminalsService } from './subscribers/terminals.service';
@Module({
  controllers:[HealthController,AuthController,UsersController,ProvidersController,CatalogController,SubscribersController,TerminalsController,EpgController,MessagingController,ClientBootstrapController,ClientController],
  providers:[Db,Audit,Authz,AuthService,ProvidersService,CatalogService,SubscribersService,TerminalsService,EpgService,EpgImportService,EpgLogoService,MessagingService,MessagingWorker,MessageImageService,ClientGuard,ClientIdentityService,ProviderDiscoveryService,ClientCatalogService,ClientPlaybackService,ClientMessagesService,ClientLeaseWorker,LoggerService,LoggerShutdown,{provide:APP_GUARD,useClass:AdminGuard}]
})
export class AppModule {}
