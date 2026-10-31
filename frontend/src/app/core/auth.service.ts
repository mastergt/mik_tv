import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, map, catchError, of, finalize, shareReplay, switchMap } from 'rxjs';
import { Me, SessionToken } from './models';

@Injectable({providedIn:'root'})
export class AuthService {
  private http=inject(HttpClient);
  readonly token=signal<string|null>(null);
  readonly me=signal<Me|null>(null);
  readonly authenticated=computed(()=>!!this.token()&&!!this.me());
  private refreshing?:Observable<string>;

  signin(username:string,password:string):Observable<Me>{
    return this.http.post<SessionToken>('/api/v1/auth/login',{username,password},{withCredentials:true}).pipe(
      tap(result=>this.token.set(result.access_token)),
      switchMap(()=>this.fetchMe())
    );
  }
  fetchMe():Observable<Me>{
    return this.http.get<Me>('/api/v1/auth/me').pipe(tap(me=>this.me.set(me)));
  }
  refreshToken():Observable<string>{
    if(this.refreshing) return this.refreshing;
    this.refreshing=this.http.post<SessionToken>('/api/v1/auth/refresh',{},{withCredentials:true})
      .pipe(map(result=>{this.token.set(result.access_token);return result.access_token;}),
        finalize(()=>this.refreshing=undefined),shareReplay({bufferSize:1,refCount:false}));
    return this.refreshing;
  }
  restore():Observable<boolean>{
    if(this.authenticated())return of(true);
    return this.refreshToken().pipe(
      switchMap(()=>this.fetchMe()),
      map(()=>true),
      catchError(()=>{this.clear();return of(false);})
    );
  }
  clear(){ this.token.set(null);this.me.set(null); }
  signout():Observable<unknown>{
    return this.http.post('/api/v1/auth/logout',{},{withCredentials:true}).pipe(
      tap(()=>this.clear()),catchError(err=>{this.clear();return of(null);})
    );
  }
  can(permission:string, providerId?:number|null):boolean{
    const scope=this.me()?.permissions[permission];
    if(!scope)return false;
    if(providerId==null)return scope.global;
    return scope.global||scope.providers.includes(providerId);
  }
  allowedProviderIds(permission:string):number[]{return this.me()?.permissions[permission]?.providers??[];}
}
