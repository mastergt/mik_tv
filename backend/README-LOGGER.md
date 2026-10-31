# Logger integration

See `../README-UPDATE.md` in the patch for instructions. The `src/logger/logger.service.ts` file implements NestJS `LoggerService`, configures log4js `file`/`logLevelFilter`/optional `stdout` appenders, and optionally records HTTP requests.

Suggested `.env` additions:

```dotenv
LOG_LEVEL=INFO
LOG_TO_CONSOLE=true
LOG_DIR=./logs
LOG_MAX_SIZE_MB=20
LOG_BACKUPS=10
LOG_COMPRESS=true
LOG_HTTP_REQUESTS=false
```
