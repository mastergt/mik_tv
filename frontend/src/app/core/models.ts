export interface Scope { global:boolean; providers:number[] }
export interface Actor { id:string; username:string|null; display_name:string }
export interface Me { user:Actor; permissions:Record<string,Scope> }
export interface SessionToken { access_token:string; expires_in:number; token_type:string }
export interface Provider {
  id:number; name:string; slug:string; enabled:boolean; timezone:string;
  default_terminal_limit:number; default_concurrent_stream_limit:number;
  playback_history_enabled:boolean; stream_monitoring_enabled:boolean;
}
export type Visibility = 'all'|'selected';
export interface AppType { id:number; code:string; name:string; enabled:boolean }
export interface Genre { id:number; name:string; visibility:Visibility; is_adult:boolean; provider_ids?:number[] }
export interface Stream {
  id:string; number:number; name:string; description:string|null; app_type_id:number;
  app_type?:string; visibility:Visibility; provider_ids?:number[]; genre_ids?:number[];
  logo_key:string|null; enabled:boolean; is_public:boolean; is_adult:boolean; age_rating:number; is_radio:boolean;
  source_count?:number;
}
export interface Source {
  id:string; stream_id:string; source_kind:'live'|'dvr'; protocol:string; url:string;
  priority:number; provider_id:number|null; enabled:boolean;
  dvr_url_mode:'template'|'api'|null; dvr_window_seconds:number|null; comment:string|null;
}
export interface Playlist {
  id:string; name:string; description:string|null; visibility:Visibility; provider_ids?:number[];
  is_public:boolean; is_hidden:boolean; enabled:boolean; expires_at:string|null;
  price_kopecks:string|null; currency:string; streams_count?:number;
  items?:PlaylistItem[];
}
export interface PlaylistItem { id:string; stream_id:string; position:number; name:string; enabled:boolean }
export interface ApiError { status?:number; message?:string | string[]; error?:string }
export interface Page<T>{items:T[];total:number;limit:number;offset:number}
export interface Subscriber {
 id:string;provider_id:number;provider_name?:string;username:string;display_name:string|null;enabled:boolean;
 contract_number:string|null;service_name:string|null;external_system:string|null;external_abonent_id:string|null;
 address:string|null;phone:string|null;email:string|null;comment:string|null;
 balance_kopecks:string|null;balance_synced_at:string|null;last_login_at:string|null;
 terminal_count:number;terminal_limit_override:number|null;concurrent_stream_limit_override:number|null;
 default_terminal_limit?:number;default_concurrent_stream_limit?:number;created_at:string;updated_at:string;
}
export interface Assignment {
 id:string;enabled:boolean;valid_from:string;valid_until:string|null;name:string;
 resource_enabled:boolean;playlist_id?:string;stream_id?:string;number?:number;
}
export interface Entitlements {playlists:Assignment[];streams:Assignment[]}
export interface Terminal {
 id:string;device_uuid:string;provider_id:number|null;provider_name?:string|null;
 abonent_id:string|null;abonent_username?:string|null;abonent_name?:string|null;
 device_name:string|null;manufacturer:string|null;model:string|null;platform:string|null;
 os_version:string|null;app_version:string|null;useragent:string|null;
 lan_addr:string|null;wan_addr:string|null;mac_addr:string|null;
 enabled:boolean;has_active_session?:boolean;registration_time:string;last_activity:string;
}
export interface TerminalSession {
 id:string;abonent_id:string|null;auth_type:string;ip:string|null;user_agent:string|null;
 started_at:string;last_seen_at:string;expires_at:string|null;ended_at:string|null;revoked_at:string|null;
}
export interface PlaybackSession {
 id:string;stream_id:string;stream_name:string;started_at:string;last_heartbeat_at:string|null;
 ended_at:string|null;status:string;error_code:string|null;
}
