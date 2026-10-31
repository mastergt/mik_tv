import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { HttpErrorResponse } from '@angular/common/http';
@Injectable({providedIn:'root'})
export class Feedback {
  private snack=inject(MatSnackBar);
  ok(message:string){ this.snack.open(message,'Закрыть',{duration:3500}); }
  error(err:unknown, prefix='Ошибка') {
    const data=err instanceof HttpErrorResponse?err.error:null;
    const raw=data?.message;
    const message=Array.isArray(raw)?raw.join('; '):typeof raw==='string'?raw:
      err instanceof HttpErrorResponse?`HTTP ${err.status||'сеть'}`:err instanceof Error?err.message:'Неизвестная ошибка';
    this.snack.open(`${prefix}: ${message}`,'Закрыть',{duration:7500});
  }
}
