import {Component,inject,signal} from '@angular/core';
import {FormBuilder,ReactiveFormsModule,Validators} from '@angular/forms';
import {MAT_DIALOG_DATA,MatDialogModule,MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatButtonModule} from '@angular/material/button';
import {MatSlideToggleModule} from '@angular/material/slide-toggle';
import {SubscribersApi} from '../core/subscribers-api.service';
import {Provider,Terminal} from '../core/models';
import {Feedback} from '../core/feedback.service';
interface Data {terminal:Terminal;providers:Provider[];globalWrite:boolean}
@Component({standalone:true,imports:[ReactiveFormsModule,MatDialogModule,MatFormFieldModule,MatInputModule,MatSelectModule,MatButtonModule,MatSlideToggleModule],template:`
<div class="form-dialog wide"><h2 mat-dialog-title>Настройки терминала</h2><mat-dialog-content>
 <p class="dialog-intro">Можно переименовать устройство, привязать к другому абоненту или отключить. Лимит терминалов проверяется в PostgreSQL.</p>
 <form [formGroup]="form" class="form-grid">
  <mat-form-field appearance="outline"><mat-label>Название</mat-label><input matInput formControlName="device_name"></mat-form-field>
  <mat-form-field appearance="outline"><mat-label>Производитель</mat-label><input matInput formControlName="manufacturer"></mat-form-field>
  <mat-form-field appearance="outline"><mat-label>Модель</mat-label><input matInput formControlName="model"></mat-form-field>
  <mat-form-field appearance="outline"><mat-label>ID абонента</mat-label><input matInput formControlName="abonent_id" placeholder="Пусто — отвязать"><mat-hint>Указывайте внутренний ID абонента</mat-hint></mat-form-field>
  <mat-form-field appearance="outline"><mat-label>Провайдер</mat-label><mat-select formControlName="provider_id">
    @if(data.globalWrite){<mat-option [value]="null">Не выбран</mat-option>}
    @for(p of data.providers;track p.id){<mat-option [value]="p.id">{{p.name}}</mat-option>}</mat-select>
  </mat-form-field>
  <div class="span-two toggle-row"><mat-slide-toggle formControlName="enabled">Терминал включён</mat-slide-toggle></div>
 </form></mat-dialog-content><mat-dialog-actions align="end"><button mat-button (click)="ref.close()">Отмена</button>
 <button mat-flat-button [disabled]="form.invalid||busy()" (click)="save()">{{busy()?'Сохраняем…':'Сохранить'}}</button></mat-dialog-actions></div>
`})
export class TerminalDialog {
 readonly data=inject<Data>(MAT_DIALOG_DATA);readonly ref=inject(MatDialogRef<TerminalDialog>);
 private fb=inject(FormBuilder);private api=inject(SubscribersApi);private feedback=inject(Feedback);
 readonly busy=signal(false);readonly form=this.fb.group({
  device_name:[this.data.terminal.device_name??''],manufacturer:[this.data.terminal.manufacturer??''],model:[this.data.terminal.model??''],
  abonent_id:[this.data.terminal.abonent_id??''],provider_id:[this.data.terminal.provider_id],enabled:[this.data.terminal.enabled]
 });
 save(){if(this.busy()||this.form.invalid)return;this.busy.set(true);
  const v=this.form.getRawValue();const payload:Record<string,unknown>={...v,
    device_name:v.device_name||null,manufacturer:v.manufacturer||null,model:v.model||null,abonent_id:v.abonent_id||null};
  this.api.updateTerminal(this.data.terminal.id,payload).subscribe({next:r=>{this.feedback.ok('Терминал обновлён');this.ref.close(r);},
   error:e=>{this.busy.set(false);this.feedback.error(e);}});
 }
}
