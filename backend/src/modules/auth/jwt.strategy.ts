import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import {
  AccessTokenPayload,
  AuthenticatedUser,
} from '../../common/auth/auth.types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.accessSecret') as string,
    });
  }

  validate(payload: AccessTokenPayload): AuthenticatedUser {
    if (payload.type !== 'access') {
      throw new UnauthorizedException('Invalid token type');
    }
    return {
      id: payload.sub,
      email: payload.email,
      roles: payload.roles ?? [],
      perms: payload.perms ?? [],
      jti: payload.jti,
    };
  }
}
