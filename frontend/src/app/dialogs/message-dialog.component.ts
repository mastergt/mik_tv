import {Component,Inject,inject,signal} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {MatDialogModule,MatDialogRef,MAT_DIALOG_DATA} from '@angular/material/dialog';
import {MatButtonModule} from '@angular/material/button';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatSlideToggleModule} from '@angular/material/slide-toggle';
import {MessagingApi,MessageDetail,MessageAudience} from '../core/messaging-api.service';
import {Feedback} from '../core/feedback.service';
import {Provider} from '../core/models';
import {AuthService} from '../core/auth.service';

@Component({selector:'app-message-dialog',standalone:true,imports:[FormsModule,MatDialogModule,MatButtonModule,MatFormFieldModule,MatInputModule,MatSelectModule,MatSlideToggleModule],template:`
<h2 mat-dialog-title>{{data.message?'Редактировать сообщение':'Новое сообщение'}}</h2>
<mat-dialog-content class="form-body">
 <p class="intro">Настройте текст, формат отображения и аудиторию рассылки. Доставка будет запущена отдельной командой.</p>
 <div class="line">
  <mat-form-field appearance="outline"><mat-label>Провайдер — владелец</mat-label>
   <mat-select [(ngModel)]="owner" [disabled]="!!data.message" (selectionChange)="ownerChanged()">
    @if(data.globalWrite){<mat-option [value]="null">Все провайдеры (глобальное сообщение)</mat-option>}
    @for(p of data.providers;track p.id){<mat-option [value]="p.id">{{p.name}}</mat-option>}
   </mat-select>
  </mat-form-field>
  <mat-form-field appearance="outline"><mat-label>Тип сообщения</mat-label>
   <mat-select [(ngModel)]="displayType"><mat-option value="ticker">Бегущая строка</mat-option><mat-option value="popup">Всплывающее окно</mat-option><mat-option value="banner">Баннер</mat-option><mat-option value="system">Важное системное</mat-option></mat-select>
  </mat-form-field>
 </div>
 <mat-form-field appearance="outline" class="full"><mat-label>Заголовок</mat-label><input matInput [(ngModel)]="title" maxlength="200" placeholder="Например, плановые работы"></mat-form-field>
 <mat-form-field appearance="outline" class="full"><mat-label>Текст сообщения</mat-label><textarea matInput [(ngModel)]="body" maxlength="4000" rows="4" required></textarea><mat-hint align="end">{{body.length}} / 4000</mat-hint></mat-form-field>
 <div class="line">
  <mat-form-field appearance="outline"><mat-label>Приоритет (1–10)</mat-label><input matInput type="number" min="1" max="10" [(ngModel)]="priority"></mat-form-field>
  <mat-form-field appearance="outline"><mat-label>Показ, секунд</mat-label><input matInput type="number" min="1" max="3600" [(ngModel)]="duration"></mat-form-field>
  @if(displayType==='ticker') {<mat-form-field appearance="outline"><mat-label>Скорость строки (1–10)</mat-label><input matInput type="number" min="1" max="10" [(ngModel)]="tickerSpeed"></mat-form-field>}
 </div>
 <div class="switches"><mat-slide-toggle [(ngModel)]="enabled">Включено</mat-slide-toggle><mat-slide-toggle [(ngModel)]="requiresAck">Требовать подтверждение</mat-slide-toggle><mat-slide-toggle [(ngModel)]="active">Активно (разрешить отправку)</mat-slide-toggle></div>
 <h3>Получатели</h3>
 @if(owner===null){
  <mat-form-field appearance="outline" class="full"><mat-label>Провайдеры для рассылки</mat-label>
   <mat-select [(ngModel)]="targetProviders" multiple [disabled]="allProviders">
    @for(p of data.providers;track p.id){<mat-option [value]="p.id">{{p.name}}</mat-option>}
   </mat-select>
  </mat-form-field>
  <mat-slide-toggle [(ngModel)]="allProviders">Явно отправлять всем провайдерам</mat-slide-toggle>
 }
 <mat-form-field appearance="outline" class="full"><mat-label>Тип аудитории</mat-label>
  <mat-select [(ngModel)]="targetMode"><mat-option value="all">Все активные абоненты выбранных провайдеров</mat-option><mat-option value="abonents">Конкретные абоненты</mat-option><mat-option value="balance">Баланс ниже порога</mat-option></mat-select>
 </mat-form-field>
 @if(targetMode==='abonents'){<mat-form-field appearance="outline" class="full"><mat-label>ID абонентов через запятую</mat-label><textarea matInput [(ngModel)]="abonentIds" rows="2" placeholder="1001, 1002, 1003"></textarea></mat-form-field>}
 @if(targetMode==='balance'){<mat-form-field appearance="outline" class="full"><mat-label>Баланс меньше, ₽</mat-label><input matInput type="number" step="0.01" [(ngModel)]="balanceRub"></mat-form-field>}
 <p class="note">Баланс проверяется при запуске рассылки. Если он не синхронизирован с биллингом, такой абонент не попадает в выборку по балансу.</p>
</mat-dialog-content>
<mat-dialog-actions align="end"><button mat-button mat-dialog-close>Отмена</button><button mat-flat-button (click)="save()" [disabled]="busy()||!body.trim()">{{busy()?'Сохранение…':'Сохранить'}}</button></mat-dialog-actions>
`,styles:[`
.image-field{border:1px dashed var(--border);border-radius:13px;padding:14px;margin-bottom:20px}.image-field label{font-size:14px;font-weight:750;display:block;margin-bottom:10px}.image-field input{font-size:14px;max-width:100%}.image-preview{display:flex;align-items:center;gap:15px;margin-top:12px}.image-preview img{max-width:220px;max-height:130px;object-fit:contain;border-radius:9px}
.form-body{min-width:min(720px,85vw);max-height:70vh;display:block;padding-top:10px!important}
.intro{font-size:16px;line-height:1.55;color:var(--muted);margin-bottom:22px}.full{width:100%}
.line{display:flex;gap:14px}.line mat-form-field{flex:1;min-width:0}.switches{display:flex;gap:22px;flex-wrap:wrap;margin:0 0 20px}
h3{font-size:21px;font-weight:800;margin:16px 0}.note{font-size:14px;color:var(--muted);line-height:1.6}
@media(max-width:730px){.line{flex-direction:column}.image-field{border:1px dashed var(--border);border-radius:13px;padding:14px;margin-bottom:20px}.image-field label{font-size:14px;font-weight:750;display:block;margin-bottom:10px}.image-field input{font-size:14px;max-width:100%}.image-preview{display:flex;align-items:center;gap:15px;margin-top:12px}.image-preview img{max-width:220px;max-height:130px;object-fit:contain;border-radius:9px}
.form-body{min-width:0}}
`]})
export class MessageDialog {
 private api=inject(MessagingApi);private ref=inject(MatDialogRef<MessageDialog>);private feedback=inject(Feedback);
 readonly busy=signal(false);
 owner:number|null;title='';body='';displayType='ticker';priority=5;duration:number|null=15;
 tickerSpeed:number|null=5;requiresAck=false;enabled=true;active=false;
 targetProviders:number[]=[];allProviders=false;targetMode='all';abonentIds='';balanceRub=100;imageKey:string|null=null;
 constructor(@Inject(MAT_DIALOG_DATA) public data:{message?:MessageDetail;providerId:number|null;providers:Provider[];globalWrite:boolean}){
  const m=data.message;
  this.owner=m?m.provider_id:data.providerId;
  if(this.owner===null&&!data.globalWrite && data.providers.length)this.owner=data.providers[0].id;
  if(m){this.imageKey=m.image_key??null;this.title=m.title??'';this.body=m.body;this.displayType=m.display_type;this.priority=m.priority;this.duration=m.duration_seconds;
   this.tickerSpeed=m.ticker_speed;this.requiresAck=m.requires_ack;this.enabled=m.enabled;this.active=m.status==='active';
   const a=m.audience??{};this.targetProviders=a.provider_ids??[];this.allProviders=a.all_providers===true;
   if(a.abonent_ids?.length){this.targetMode='abonents';this.abonentIds=a.abonent_ids.join(', ');}
   else if(a.balance_lt_kopecks!==undefined){this.targetMode='balance';this.balanceRub=a.balance_lt_kopecks/100;}
  }
 }
 ownerChanged(){this.targetProviders=[];this.allProviders=false;}
 uploadImage(event:Event){
  const input=event.target as HTMLInputElement;const file=input.files?.[0];if(!file)return;
  if(file.size>2*1024*1024){this.feedback.ok('Изображение должно быть не больше 2 МБ');input.value='';return;}
  this.busy.set(true);this.api.uploadImage(file,this.owner).subscribe({next:r=>{this.imageKey=r.image_key;this.busy.set(false);input.value='';this.feedback.ok('Изображение загружено');},error:e=>{this.busy.set(false);input.value='';this.feedback.error(e);}});
 }
 save(){
  if(this.busy())return;
  if(this.owner===null&&!this.allProviders&&!this.targetProviders.length){this.feedback.ok('Выберите хотя бы одного провайдера');return;}
  const aud:MessageAudience=this.owner===null?
    (this.allProviders?{all_providers:true}:{provider_ids:this.targetProviders}):{provider_ids:[this.owner]};
  if(this.targetMode==='abonents'){
   const ids=this.abonentIds.split(/[,;\s]+/).filter(Boolean);
   if(!ids.length||ids.some(x=>!/^\d+$/.test(x))){this.feedback.ok('Укажите числовые ID абонентов');return;}
   aud.abonent_ids=ids;
  }
  if(this.targetMode==='balance'){
   if(!Number.isFinite(this.balanceRub)){this.feedback.ok('Некорректный баланс');return;}
   aud.balance_lt_kopecks=Math.round(this.balanceRub*100);
  }
  const v:Record<string,unknown>={title:this.title.trim()||null,body:this.body.trim(),display_type:this.displayType,
   priority:Number(this.priority),duration_seconds:this.duration===null?null:Number(this.duration),
   ticker_speed:this.displayType==='ticker'?Number(this.tickerSpeed):null,requires_ack:this.requiresAck,
   enabled:this.enabled,status:this.active?'active':'draft',audience:aud,image_key:this.imageKey};
  if(!this.data.message)v['provider_id']=this.owner;
  this.busy.set(true);
  const call=this.data.message?this.api.update(this.data.message.id,v):this.api.create(v);
  call.subscribe({next:m=>{this.busy.set(false);this.feedback.ok('Сообщение сохранено');this.ref.close(m);},error:e=>{this.busy.set(false);this.feedback.error(e);}});
 }
}
