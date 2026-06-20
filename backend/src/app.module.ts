import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { AuditInterceptor } from './common/audit/audit.interceptor';
import { JwtAuthGuard } from './common/auth/jwt-auth.guard';
import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './infra/prisma/prisma.module';
import { RedisModule } from './infra/redis/redis.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { CertificatesModule } from './modules/certificates/certificates.module';
import { EducationModule } from './modules/education/education.module';
import { GamificationModule } from './modules/gamification/gamification.module';
import { HealthModule } from './modules/health/health.module';
import { MissionsModule } from './modules/missions/missions.module';
import { ScoreModule } from './modules/score/score.module';
import { UsersModule } from './modules/users/users.module';
// FASE 3 — núcleo financeiro
import { AdvisorModule } from './modules/advisor/advisor.module';
import { CreditModule } from './modules/credit/credit.module';
import { FraudModule } from './modules/fraud/fraud.module';
import { LedgerModule } from './modules/ledger/ledger.module';
import { OpenFinanceModule } from './modules/open-finance/open-finance.module';
import { PixModule } from './modules/pix/pix.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        // Redact sensitive fields from structured request logs.
        redact: ['req.headers.authorization', 'req.body.password', 'req.body.refreshToken'],
        transport:
          process.env.NODE_ENV === 'production'
            ? undefined
            : { target: 'pino-pretty', options: { singleLine: true } },
      },
    }),
    PrismaModule,
    RedisModule,
    AuditModule,
    AuthModule,
    UsersModule,
    HealthModule,
    // FASE 2 — regras de negócio migradas do frontend
    GamificationModule,
    ScoreModule,
    MissionsModule,
    CertificatesModule,
    EducationModule,
    // FASE 3 — núcleo financeiro
    FraudModule,
    LedgerModule,
    CreditModule,
    OpenFinanceModule,
    PixModule,
    AdvisorModule,
  ],
  providers: [
    // Authentication is enforced globally; opt out with @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
