import {IsBoolean,IsInt,IsOptional,IsString,IsUUID,Length,Max,Min} from 'class-validator';
export class SubscriberDto {
 @IsInt() @Min(1) provider_id!:number;
 @IsString() @Length(1,150) username!:string;
 @IsOptional() @IsString() @Length(6,200) password?:string;
 @IsOptional() @IsBoolean() enabled?:boolean;
 @IsOptional() @IsString() @Length(1,200) contract_number?:string|null;
 @IsOptional() @IsString() @Length(1,200) service_name?:string|null;
 @IsOptional() @IsString() @Length(1,200) external_system?:string|null;
 @IsOptional() @IsString() @Length(1,200) external_abonent_id?:string|null;
 @IsOptional() @IsString() @Length(1,250) display_name?:string|null;
 @IsOptional() @IsString() @Length(1,500) address?:string|null;
 @IsOptional() @IsString() @Length(1,100) phone?:string|null;
 @IsOptional() @IsString() @Length(1,250) email?:string|null;
 @IsOptional() @IsString() @Length(0,4000) comment?:string|null;
 @IsOptional() @IsInt() @Min(0) @Max(1000000) terminal_limit_override?:number|null;
 @IsOptional() @IsInt() @Min(0) @Max(1000000) concurrent_stream_limit_override?:number|null;
}
export class GrantDto {
 @IsString() @Length(1,19) item_id!:string;
 @IsOptional() @IsBoolean() enabled?:boolean;
 @IsOptional() @IsString() valid_from?:string;
 @IsOptional() @IsString() valid_until?:string|null;
}
export class TerminalDto {
 @IsUUID() device_uuid!:string;
 @IsOptional() @IsInt() @Min(1) provider_id?:number;
 @IsOptional() @IsString() @Length(1,19) abonent_id?:string;
 @IsOptional() @IsString() @Length(1,200) device_name?:string;
 @IsOptional() @IsString() @Length(1,200) manufacturer?:string;
 @IsOptional() @IsString() @Length(1,200) model?:string;
 @IsOptional() @IsString() @Length(1,100) platform?:string;
 @IsOptional() @IsString() @Length(1,100) os_version?:string;
 @IsOptional() @IsString() @Length(1,100) app_version?:string;
 @IsOptional() @IsString() @Length(1,2048) useragent?:string;
 @IsOptional() @IsBoolean() enabled?:boolean;
}
export class TerminalUpdateDto {
 @IsOptional() @IsInt() @Min(1) provider_id?:number|null;
 @IsOptional() @IsString() @Length(1,19) abonent_id?:string|null;
 @IsOptional() @IsString() @Length(1,200) device_name?:string|null;
 @IsOptional() @IsString() @Length(1,200) manufacturer?:string|null;
 @IsOptional() @IsString() @Length(1,200) model?:string|null;
 @IsOptional() @IsBoolean() enabled?:boolean;
}
