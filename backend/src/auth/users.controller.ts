import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Put, Query, Req, NotFoundException, Inject } from '@nestjs/common';
import * as argon2 from 'argon2';
import { Db } from '../common/db';
import { Audit } from '../common/audit';
import { Authz, AdminRequest } from './authz';
import { dbError, intId, page, providerId } from '../common/http';
import { dto } from '../common/validate';
import { IsArray, IsEmail, IsIn, IsInt, IsOptional, IsString, Length, Min, ValidateIf } from 'class-validator';
import { sqlInsert, sqlUpdate, only } from '../common/sql';
class UserCreate {
  @IsString() @Length(3,100) username!:string;
  @IsString() @Length(1,200) display_name!:string;
  @IsString() @Length(12,300) password!:string;
  @IsOptional() @IsEmail() email?:string;
}
class StatusDto { @IsIn(['pending','active','disabled']) status!:'pending'|'active'|'disabled'; }
class AssignmentDto {
  @IsInt() @Min(1) role_id!:number;
  @IsOptional() @IsInt() @Min(1) provider_id?:number|null;
}
class AssignmentsDto { @IsArray() assignments!:AssignmentDto[]; }
@Controller('users')
export class UsersController {
  constructor(@Inject(Db) private readonly db:Db, @Inject(Authz) private readonly authz:Authz, @Inject(Audit) private readonly audit:Audit){}
  @Get() async list(@Req()req:AdminRequest,@Query()q:{limit?:string,offset?:string}) {
    await this.authz.global(req.admin,'users.read');const {limit,offset}=page(q);
    return this.db.rows(`SELECT id::text,username,display_name,email,status,created_at,last_login_at FROM auth.users ORDER BY id DESC LIMIT $1 OFFSET $2`,[limit,offset]);
  }
  @Get('roles') async roles(@Req()req:AdminRequest) {
    await this.authz.global(req.admin,'users.read');return this.db.rows('SELECT * FROM auth.roles ORDER BY id');
  }
  @Get(':id') async get(@Req()req:AdminRequest,@Param('id') raw:string) {
    await this.authz.global(req.admin,'users.read');const id=intId(raw);
    const u=await this.db.one(`SELECT id::text,username,display_name,email,status,created_at,last_login_at FROM auth.users WHERE id=$1`,[id]);
    if(!u)throw new NotFoundException();
    return {...u,assignments:await this.db.rows(`SELECT a.id::text,r.code,a.role_id,a.provider_id FROM auth.user_role_assignments a
      JOIN auth.roles r ON r.id=a.role_id WHERE a.user_id=$1 ORDER BY a.id`,[id])};
  }
  @Post() async create(@Req()req:AdminRequest,@Body()body:unknown) {
    await this.authz.global(req.admin,'users.write');const v=dto(UserCreate,body);
    const hash=await argon2.hash(v.password,{type:argon2.argon2id});
    return this.db.tx(async c=>{
      try {
        const row=(await c.query(`INSERT INTO auth.users(username,password_hash,display_name,email,status)
          VALUES($1,$2,$3,$4,'pending') RETURNING id::text,username,display_name,email,status`,[v.username,hash,v.display_name,v.email??null])).rows[0];
        await this.audit.write(c,req.admin.id,'users.create','auth.users',row.id,null,['username','display_name','email']);
        return row;
      }catch(e){dbError(e)}
    });
  }
  @Patch(':id/status') async changeStatus(@Req()req:AdminRequest,@Param('id')raw:string,@Body()body:unknown) {
    await this.authz.global(req.admin,'users.write');const id=intId(raw),v=dto(StatusDto,body);
    if(id===req.admin.id&&v.status!=='active')throw new BadRequestException('Cannot disable your own account');
    return this.db.tx(async c=>{
      if(v.status!=='active'){
        await c.query('SELECT pg_advisory_xact_lock(948321)');
        const was=await c.query(`SELECT 1 FROM auth.user_role_assignments a JOIN auth.roles r ON r.id=a.role_id
          WHERE a.user_id=$1 AND a.provider_id IS NULL AND r.code='superadmin'`,[id]);
        if(was.rows.length){
          const remaining=await c.query<{count:string}>(`SELECT count(DISTINCT u.id) FROM auth.user_role_assignments a
            JOIN auth.roles r ON r.id=a.role_id JOIN auth.users u ON u.id=a.user_id
            WHERE r.code='superadmin' AND a.provider_id IS NULL AND u.status='active'`);
          if(Number(remaining.rows[0].count)<=1)throw new BadRequestException('Cannot disable last active superadmin');
        }
      }
      const u=(await c.query(`UPDATE auth.users SET status=$1 WHERE id=$2 RETURNING id::text,status`,[v.status,id])).rows[0];
      if(!u)throw new NotFoundException();
      if(v.status==='disabled')await c.query('UPDATE auth.user_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL',[id]);
      await this.audit.write(c,req.admin.id,'users.status','auth.users',id,null,['status']);return u;
    });
  }
  @Put(':id/roles') async replaceRoles(@Req()req:AdminRequest,@Param('id')raw:string,@Body()body:unknown) {
    await this.authz.global(req.admin,'roles.write');const id=intId(raw);
    const v=dto(AssignmentsDto,body);
    // Nested validation is performed explicitly to ensure no arbitrary objects reach the database.
    if(v.assignments.length>100)throw new BadRequestException('Too many assignments');
    const items=v.assignments.map(x=>dto(AssignmentDto,x));
    const uniq=new Set(items.map(x=>`${x.role_id}/${x.provider_id??'global'}`));
    if(uniq.size!==items.length)throw new BadRequestException('Duplicate role assignments');
    const roles=await this.db.rows<{id:number;code:string}>('SELECT id,code FROM auth.roles WHERE id=ANY($1::integer[])',[items.map(x=>x.role_id)]);
    if(new Set(roles.map(r=>r.id)).size!==new Set(items.map(x=>x.role_id)).size)throw new BadRequestException('Unknown role');
    if(items.some(x=>roles.some(r=>r.id===x.role_id&&r.code==='superadmin')&&x.provider_id!=null))
      throw new BadRequestException('Superadmin must be globally scoped');
    return this.db.tx(async c=>{
      try {
        // Serialize all superadmin assignment changes. Prevent deleting the final global superadmin.
        await c.query('SELECT pg_advisory_xact_lock(948321)');
        const user=(await c.query('SELECT id FROM auth.users WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!user)throw new NotFoundException();
        const replacingLast=await c.query<{count:string}>(`SELECT count(DISTINCT u.id) FROM auth.user_role_assignments a
           JOIN auth.roles r ON r.id=a.role_id JOIN auth.users u ON u.id=a.user_id
           WHERE r.code='superadmin' AND a.provider_id IS NULL AND u.status='active'`);
        const wasSuper=await c.query(`SELECT 1 FROM auth.user_role_assignments a JOIN auth.roles r ON r.id=a.role_id
          WHERE a.user_id=$1 AND a.provider_id IS NULL AND r.code='superadmin'`,[id]);
        const keepsSuper=items.some(x=>x.provider_id==null&&roles.some(r=>r.id===x.role_id&&r.code==='superadmin'));
        if(wasSuper.rows.length && !keepsSuper && Number(replacingLast.rows[0].count)<=1)
          throw new BadRequestException('Cannot remove the last active superadmin');
        await c.query('DELETE FROM auth.user_role_assignments WHERE user_id=$1',[id]);
        for(const a of items)await c.query(`INSERT INTO auth.user_role_assignments(user_id,role_id,provider_id,granted_by) VALUES($1,$2,$3,$4)`,[id,a.role_id,a.provider_id??null,req.admin.id]);
        await this.audit.write(c,req.admin.id,'users.roles.replace','auth.user_role_assignments',id,null,['roles']);
        return {user_id:id,assignments:items};
      }catch(e){dbError(e)}
    });
  }
}
