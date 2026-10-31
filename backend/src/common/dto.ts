import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Length, Max, Min, ValidateIf, ArrayUnique, IsUrl } from 'class-validator';

export class VisibilityDto {
  @IsOptional() @IsIn(['all','selected']) visibility?: 'all' | 'selected';
  @IsOptional() @IsArray() @ArrayUnique() @IsInt({each:true}) @Min(1,{each:true}) provider_ids?: number[];
}
export class ProviderDto {
  @IsString() @Length(1,200) name!: string;
  @IsString() @Length(2,64) slug!: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsString() @Length(1,100) timezone?: string;
  @IsOptional() @IsInt() @Min(0) @Max(1000000) default_terminal_limit?: number;
  @IsOptional() @IsInt() @Min(0) @Max(1000000) default_concurrent_stream_limit?: number;
  @IsOptional() @IsBoolean() playback_history_enabled?: boolean;
  @IsOptional() @IsBoolean() stream_monitoring_enabled?: boolean;
}
export class StreamDto extends VisibilityDto {
  @IsInt() @Min(1) number!: number;
  @IsString() @Length(1,300) name!: string;
  @IsOptional() @IsString() description?: string;
  @IsInt() @Min(1) app_type_id!: number;
  @IsOptional() @IsString() logo_key?: string;
  @IsOptional() @IsBoolean() is_public?: boolean;
  @IsOptional() @IsBoolean() is_adult?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(21) age_rating?: number;
  @IsOptional() @IsBoolean() is_radio?: boolean;
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsArray() @ArrayUnique() @IsInt({each:true}) @Min(1,{each:true}) genre_ids?: number[];
}
export class SourceDto {
  @IsIn(['live','dvr']) source_kind!: 'live' | 'dvr';
  @IsIn(['hls','udp','http_ts','dash','rtsp','other']) protocol!: string;
  @IsString() @Length(6,4096) url!: string;
  @IsOptional() @IsInt() @Min(1) priority?: number;
  @IsOptional() @IsInt() @Min(1) provider_id?: number | null;
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsIn(['template','api']) dvr_url_mode?: string | null;
  @IsOptional() @IsInt() @Min(1) dvr_window_seconds?: number | null;
  @IsOptional() @IsString() comment?: string;
}
export class PlaylistDto extends VisibilityDto {
  @IsString() @Length(1,300) name!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsBoolean() is_public?: boolean;
  @IsOptional() @IsBoolean() is_hidden?: boolean;
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsString() expires_at?: string | null;
  @IsOptional() @IsInt() @Min(0) price_kopecks?: number | null;
  @IsOptional() @IsString() @Length(3,3) currency?: string;
}
export class PlaylistItemsDto {
  @IsArray() @ArrayUnique() @IsString({each: true}) stream_ids!: string[];
}
export class GenreDto extends VisibilityDto {
  @IsString() @Length(1,200) name!: string;
  @IsOptional() @IsBoolean() is_adult?: boolean;
}
export class AppTypeDto {
  @IsString() @Length(2,50) code!: string;
  @IsString() @Length(1,200) name!: string;
  @IsOptional() @IsBoolean() enabled?:boolean;
  // ui_config remains a small typed JSON object in the admin panel; configure via dedicated endpoint in a later stage.
}
