import { HttpInterceptorFn, HttpErrorResponse, HttpRequest, HttpHandlerFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';

export const apiInterceptor:HttpInterceptorFn=(req:HttpRequest<unknown>,next:HttpHandlerFn)=>{
  const auth=inject(AuthService);
  if(!req.url.startsWith('/api/v1/')||/\/auth\/(login|refresh|logout)$/.test(req.url))return next(req);
  const token=auth.token();
  const current=token?req.clone({setHeaders:{Authorization:`Bearer ${token}`}}):req;
  return next(current).pipe(catchError((error:unknown)=>{
    if(!(error instanceof HttpErrorResponse)||error.status!==401)return throwError(()=>error);
    return auth.refreshToken().pipe(
      switchMap(fresh=>next(req.clone({setHeaders:{Authorization:`Bearer ${fresh}`}}))),
      catchError(e=>{auth.clear();return throwError(()=>e);})
    );
  }));
};
