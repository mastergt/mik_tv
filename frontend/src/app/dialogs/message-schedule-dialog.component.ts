import {Component,inject,signal} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {MatDialogModule,MatDialogRef,MAT_DIALOG_DATA} from '@angular/material/dialog';
import {MatButtonModule} from '@angular/material/button';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MessagingApi} from '../core/messaging-api.service';
import {Feedback} from '../core/feedback.service';
@Component({standalone:true,imports:[FormsModule,MatDialogModule,MatButtonModule,MatFormFieldModule,MatInputModule,MatSelectModule],template:`
<h2 mat-dialog-title>Расписание рассылки</h2>
<mat-dialog-content class="schedule-form">
 <mat-form-field appearance="outline" class="full"><mat-label>Периодичность</mat-label><mat-select [(ngModel)]="kind"><mat-option value="once">Однократно</mat-option><mat-option value="daily">Каждый день</mat-option></mat-select></mat-form-field>
 @if(kind==='once'){
  <label class="native-label">Дата и время запуска</label><input class="date-field" type="datetime-local" [(ngModel)]="runAt">
 } @else {
  <div class="line"><mat-form-field appearance="outline"><mat-label>Час (0–23)</mat-label><input matInput type="number" min="0" max="23" [(ngModel)]="hour"></mat-form-field>
  <mat-form-field appearance="outline"><mat-label>Минута</mat-label><input matInput type="number" min="0" max="59" [(ngModel)]="minute"></mat-form-field></div>
  <mat-form-field appearance="outline" class="full"><mat-label>Часовой пояс IANA</mat-label><input matInput [(ngModel)]="timezone" placeholder="Europe/Moscow"></mat-form-field>
 }
 <p class="hint">Повторение — ежедневно по местному времени провайдера. После перезапуска сервера пропущенные запуски не воспроизводятся пачкой.</p>
</mat-dialog-content>
<mat-dialog-actions align="end"><button mat-button mat-dialog-close>Отмена</button><button mat-flat-button [disabled]="busy()" (click)="save()">Запланировать</button></mat-dialog-actions>
`,styles:[`
.schedule-form{width:min(470px,87vw);padding-top:13px!important}.full{width:100%}.line{display:flex;gap:14px}.line mat-form-field{flex:1}
.native-label{font-size:15px;font-weight:700;color:var(--muted);display:block;margin:0 0 10px}.date-field{font-size:17px;border-radius:11px;border:1px solid var(--border);background:var(--muted-panel);color:var(--text);padding:13px;width:100%;margin-bottom:20px}
.hint{font-size:14px;line-height:1.6;color:var(--muted)}
`]})
export class MessageScheduleDialog {
 private api=inject(MessagingApi);private ref=inject(MatDialogRef<MessageScheduleDialog>);private feedback=inject(Feedback);
 readonly data=inject<{id:string}>(MAT_DIALOG_DATA);readonly busy=signal(false);
 kind:'once'|'daily'='once';runAt='';hour=10;minute=0;timezone='Europe/Moscow';
 save(){
  let body:Record<string,unknown>;
  if(this.kind==='once'){
   const d=new Date(this.runAt);
   if(!this.runAt||Number.isNaN(d.getTime())){this.feedback.ok('Выберите дату и время');return;}
   body={kind:'once',run_at:d.toISOString()};
  }else body={kind:'daily',hour:Number(this.hour),minute:Number(this.minute),timezone:this.timezone};
  this.busy.set(true);
  this.api.schedule(this.data.id,body).subscribe({next:r=>{this.busy.set(false);this.feedback.ok('Расписание добавлено');this.ref.close(r);},
   error:e=>{this.busy.set(false);this.feedback.error(e);}});
 }
}
