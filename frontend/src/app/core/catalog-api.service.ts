import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { AppType, Genre, Playlist, Provider, Source, Stream } from './models';

@Injectable({providedIn:'root'})
export class CatalogApi {
  private http=inject(HttpClient);
  private base='/api/v1';
  private params(q:Record<string,string|number|undefined|null>) {
    let p=new HttpParams();
    Object.entries(q).forEach(([k,v])=>{if(v!==undefined&&v!==null&&v!=='')p=p.set(k,String(v));});
    return p;
  }
  providers(){return this.http.get<Provider[]>(`${this.base}/providers`,{params:{limit:'200'}});}
  createProvider(v:Partial<Provider>){return this.http.post<Provider>(`${this.base}/providers`,v);}
  updateProvider(id:number,v:Partial<Provider>){return this.http.patch<Provider>(`${this.base}/providers/${id}`,v);}
  appTypes(){return this.http.get<AppType[]>(`${this.base}/app-types`);}
  createAppType(v:Partial<AppType>){return this.http.post<AppType>(`${this.base}/app-types`,v);}
  updateAppType(id:number,v:Partial<AppType>){return this.http.patch<AppType>(`${this.base}/app-types/${id}`,v);}
  genres(providerId?:number){return this.http.get<Genre[]>(`${this.base}/genres`,{params:this.params({providerId})});}
  createGenre(v:Partial<Genre>){return this.http.post<Genre>(`${this.base}/genres`,v);}
  updateGenre(id:number,v:Partial<Genre>){return this.http.patch<Genre>(`${this.base}/genres/${id}`,v);}
  streams(q:{providerId?:number;search?:string;appTypeId?:number;limit?:number;offset?:number}={}) {
    return this.http.get<Stream[]>(`${this.base}/streams`,{params:this.params(q)});
  }
  stream(id:string,providerId?:number){return this.http.get<Stream>(`${this.base}/streams/${id}`,{params:this.params({providerId})});}
  createStream(v:Partial<Stream>){return this.http.post<Stream>(`${this.base}/streams`,v);}
  updateStream(id:string,v:Partial<Stream>){return this.http.patch<Stream>(`${this.base}/streams/${id}`,v);}
  deleteStream(id:string){return this.http.delete(`${this.base}/streams/${id}`);}
  sources(id:string,providerId?:number){return this.http.get<Source[]>(`${this.base}/streams/${id}/sources`,{params:this.params({providerId})});}
  createSource(id:string,v:Partial<Source>){return this.http.post<Source>(`${this.base}/streams/${id}/sources`,v);}
  updateSource(id:string,v:Partial<Source>){return this.http.patch<Source>(`${this.base}/sources/${id}`,v);}
  deleteSource(id:string){return this.http.delete(`${this.base}/sources/${id}`);}
  playlists(q:{providerId?:number;search?:string;limit?:number;offset?:number}={}){
    return this.http.get<Playlist[]>(`${this.base}/playlists`,{params:this.params(q)});
  }
  playlist(id:string,providerId?:number){return this.http.get<Playlist>(`${this.base}/playlists/${id}`,{params:this.params({providerId})});}
  createPlaylist(v:Partial<Playlist>){return this.http.post<Playlist>(`${this.base}/playlists`,v);}
  updatePlaylist(id:string,v:Partial<Playlist>){return this.http.patch<Playlist>(`${this.base}/playlists/${id}`,v);}
  replacePlaylistItems(id:string,stream_ids:string[]){return this.http.put<{streams_count:number}>(`${this.base}/playlists/${id}/streams`,{stream_ids});}
  deletePlaylist(id:string){return this.http.delete(`${this.base}/playlists/${id}`);}
}
