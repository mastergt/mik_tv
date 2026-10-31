import { BadRequestException, Type } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
export function dto<T extends object>(cls: Type<T>, payload: unknown, patch = false): T {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new BadRequestException('JSON object required');
  const input=plainToInstance(cls,payload);
  const errors=validateSync(input,{whitelist:true,forbidNonWhitelisted:true,skipMissingProperties:patch});
  if(errors.length) throw new BadRequestException(errors.map(e=>({field:e.property,errors:e.constraints})))
  if(patch && !Object.keys(payload).length) throw new BadRequestException('Empty update');
  return input;
}
