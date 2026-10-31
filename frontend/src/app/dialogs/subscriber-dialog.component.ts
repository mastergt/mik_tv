import {Component,inject,signal} from '@angular/core';
import {NgFor} from '@angular/common';
import {FormBuilder,ReactiveFormsModule,Validators} from '@angular/forms';
import {MAT_DIALOG_DATA,MatDialogModule,MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatSlideToggleModule} from '@angular/material/slide-toggle';
import {MatButtonModule} from '@angular/material/button';
import {SubscribersApi} from '../core/subscribers-api.service';
import {Subscriber,Provider} from '../core/models';
import {Feedback} from '../core/feedback.service';
interface DialogData {subscriber?:Subscriber;providers:Provider[];providerId:number|null}
@Component({standalone:true,imports:[NgFor,ReactiveFormsModule,MatDialogModule,MatFormFieldModule,MatInputModule,MatSelectModule,MatSlideToggleModule,MatButtonModule],template:`
<div class="form-dialog wide"><h2 mat-dialog-title>{{data.subscriber?'Редактировать абонента':'Новый абонент'}}</h2>
<mat-dialog-content>
 <p class="dialog-intro">Договор, учетная запись и ограничения. Баланс синхронизируется из внешнего биллинга.</p>
 <form [formGroup]="form" class="form-grid" (ngSubmit)="save()">
  <mat-form-field appearance="outline"><mat-label>Провайдер</mat-label>
    <mat-select formControlName="provider_id" required><mat-option *ngFor="let p of data.providers" [value]="p.id">{{p.name}}</mat-option></mat-select>
  </mat-form-field>
  <mat-form-field appearance="outline"><mat-label>Логин</mat-label><input matInput formControlName="username" required></mat-form-field>
  <mat-form-field appearance="outline"><mat-label>ФИО / Название</mat-label><input matInput formControlName="display_name"></mat-form-field>
  <mat-form-field appearance="outline"><mat-label>Номер договора</mat-label><input matInput formControlName="contract_number"></mat-form-field>
  <mat-form-field appearance="outline"><mat-label>Название услуги</mat-label><input matInput formControlName="service_name"></mat-form-field>
  <mat-form-field appearance="outline"><mat-label>Телефон</mat-label><input matInput formControlName="phone"></mat-form-field>
  <mat-form-field appearance="outline"><mat-label>Email</mat-label><input matInput formControlName="email"></mat-form-field>
  <mat-form-field appearance="outline"><mat-label>Адрес</mat-label><input matInput formControlName="address"></mat-form-field>
  <mat-form-field appearance="outline" class="span-two"><mat-label>{{data.subscriber?'Новый пароль (не менять — оставить пустым)':'Пароль абонента (необязательно)'}}</mat-label>
    <input matInput type="password" autocomplete="new-password" formControlName="password"><mat-hint>Если задан — минимум 6 символов. Шифруется, не сохраняется открытым текстом.</mat-hint>
  </mat-form-field>
  <mat-form-field appearance="outline"><mat-label>Лимит терминалов</mat-label><input matInput type="number" min="0" formControlName="terminal_limit_override"><mat-hint>Пусто — лимит провайдера, 0 — без ограничений</mat-hint></mat-form-field>
  <mat-form-field appearance="outline"><mat-label>Одновременные просмотры</mat-label><input matInput type="number" min="0" formControlName="concurrent_stream_limit_override"><mat-hint>Пусто — лимит провайдера, 0 — без ограничений</mat-hint></mat-form-field>
  <mat-form-field appearance="outline" class="span-two"><mat-label>Комментарий</mat-label><textarea matInput rows="2" formControlName="comment"></textarea></mat-form-field>
  <div class="span-two toggle-row"><mat-slide-toggle formControlName="enabled">Абонент активен</mat-slide-toggle></div>
 </form>
</mat-dialog-content>
<mat-dialog-actions align="end"><button mat-button (click)="ref.close()">Отмена</button>
 <button mat-flat-button [disabled]="form.invalid||busy()" (click)="save()">{{busy()?'Сохранение…':'Сохранить'}}</button></mat-dialog-actions></div>
`})
export class SubscriberDialog {
 readonly data=inject<DialogData>(MAT_DIALOG_DATA);readonly ref=inject(MatDialogRef<SubscriberDialog>);
 private fb=inject(FormBuilder);private api=inject(SubscribersApi);private feedback=inject(Feedback);
 readonly busy=signal(false);
 readonly form=this.fb.group({
  provider_id:[{value:this.data.subscriber?.provider_id??this.data.providerId,disabled:!!this.data.subscriber},Validators.required],
  username:[this.data.subscriber?.username??'',Validators.required],
  password:['',[Validators.minLength(6)]],display_name:[this.data.subscriber?.display_name??''],
  contract_number:[this.data.subscriber?.contract_number??''],service_name:[this.data.subscriber?.service_name??''],
  phone:[this.data.subscriber?.phone??''],email:[this.data.subscriber?.email??''],address:[this.data.subscriber?.address??''],
  comment:[this.data.subscriber?.comment??''],enabled:[this.data.subscriber?.enabled??true],
  terminal_limit_override:[this.data.subscriber?.terminal_limit_override??null,[Validators.min(0)]],
  concurrent_stream_limit_override:[this.data.subscriber?.concurrent_stream_limit_override??null,[Validators.min(0)]]
 });
 save(){if(this.busy()||this.form.invalid)return;this.busy.set(true);
  const value=this.form.getRawValue(),payload:Record<string,unknown>={...value};
  if(this.data.subscriber)delete payload['provider_id'];
  if(!value.password)delete payload['password'];
  for(const key of ['display_name','contract_number','service_name','phone','email','address','comment'])if(payload[key]==='')payload[key]=null;
  const request=this.data.subscriber?this.api.updateAbonent(this.data.subscriber.id,payload):this.api.createAbonent(payload);
  request.subscribe({next:r=>{this.feedback.ok('Абонент сохранён');this.ref.close(r);},error:e=>{this.busy.set(false);this.feedback.error(e);}});
 }
}
