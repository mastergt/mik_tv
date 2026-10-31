import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatButtonModule } from '@angular/material/button';
import { CatalogApi } from '../core/catalog-api.service';
import { Feedback } from '../core/feedback.service';
import { Provider, Source } from '../core/models';
export interface SourceDialogData {streamId:string;source?:Source;providers:Provider[];selectedProvider:number|null;globalWrite:boolean;kind?:'live'|'dvr'}
@Component({standalone:true,imports:[ReactiveFormsModule,MatDialogModule,MatFormFieldModule,MatInputModule,MatSelectModule,MatSlideToggleModule,MatButtonModule],template:`
<div class="form-dialog wide">
  <h2 mat-dialog-title>{{data.source?'Редактировать источник':'Новый источник вещания'}}</h2>
  <mat-dialog-content>
    <p class="dialog-intro">Основной адрес и резервные адреса задаются приоритетами: 10 — основной, 20 — резервный.</p>
    <form [formGroup]="form" class="form-grid" (ngSubmit)="save()">
      <mat-form-field appearance="outline"><mat-label>Назначение</mat-label><mat-select formControlName="source_kind" (selectionChange)="kindChanged()"><mat-option value="live">LIVE — прямой эфир</mat-option><mat-option value="dvr">DVR — архив</mat-option></mat-select></mat-form-field>
      <mat-form-field appearance="outline"><mat-label>Протокол</mat-label><mat-select formControlName="protocol">@for(p of protocols;track p){<mat-option [value]="p">{{p.toUpperCase()}}</mat-option>}</mat-select></mat-form-field>
      <mat-form-field class="span-two" appearance="outline"><mat-label>Адрес источника</mat-label><input matInput formControlName="url" required placeholder="https://media.example.com/live/index.m3u8"></mat-form-field>
      <mat-form-field appearance="outline"><mat-label>Приоритет</mat-label><input matInput type="number" min="1" formControlName="priority"><mat-hint>10 — основной, 20 — резерв</mat-hint></mat-form-field>
      <mat-form-field appearance="outline"><mat-label>Провайдер</mat-label><mat-select formControlName="provider_id" [disabled]="!!data.source"><mat-option [value]="null" [disabled]="!data.globalWrite">Общий источник</mat-option>@for(p of data.providers;track p.id){<mat-option [value]="p.id">{{p.name}}</mat-option>}</mat-select></mat-form-field>
      @if(form.controls.source_kind.value==='dvr'){
        <mat-form-field appearance="outline"><mat-label>Режим DVR URL</mat-label><mat-select formControlName="dvr_url_mode"><mat-option value="template">Шаблон URL</mat-option><mat-option value="api">API архива</mat-option></mat-select></mat-form-field>
        <mat-form-field appearance="outline"><mat-label>Глубина архива, сек.</mat-label><input matInput type="number" formControlName="dvr_window_seconds" min="1"></mat-form-field>
        <div class="span-two notice">Для шаблона доступны переменные: {{'{start_unix}'}} · {{'{end_unix}'}} · {{'{duration_sec}'}} · {{'{start_iso}'}} · {{'{end_iso}'}}</div>
      }
      <mat-form-field class="span-two" appearance="outline"><mat-label>Комментарий</mat-label><textarea matInput rows="2" formControlName="comment"></textarea></mat-form-field>
      <div class="span-two toggle-row"><mat-slide-toggle formControlName="enabled">Источник включён</mat-slide-toggle></div>
    </form>
  </mat-dialog-content>
  <mat-dialog-actions align="end"><button mat-button (click)="ref.close()">Отмена</button><button mat-flat-button [disabled]="form.invalid||busy()" (click)="save()">{{busy()?'Сохраняем…':'Сохранить'}}</button></mat-dialog-actions>
</div>
`})
export class SourceDialog {
  readonly data=inject<SourceDialogData>(MAT_DIALOG_DATA);readonly ref=inject(MatDialogRef<SourceDialog>);
  private fb=inject(FormBuilder);private api=inject(CatalogApi);private feedback=inject(Feedback);
  readonly protocols=['hls','http_ts','udp','dash','rtsp','other'];readonly busy=signal(false);
  readonly form=this.fb.nonNullable.group({
    source_kind:[this.data.source?.source_kind??this.data.kind??'live' as 'live'|'dvr'],
    protocol:[this.data.source?.protocol??'hls'],url:[this.data.source?.url??'',[Validators.required,Validators.pattern(/^[a-z][a-z0-9+.-]*:\/\/.+/i)]],
    priority:[this.data.source?.priority??10,[Validators.min(1)]],
    provider_id:[this.data.source?.provider_id??this.data.selectedProvider??null as number|null],
    dvr_url_mode:[this.data.source?.dvr_url_mode??'template' as 'template'|'api'],
    dvr_window_seconds:[this.data.source?.dvr_window_seconds??null as number|null],
    comment:[this.data.source?.comment??''],enabled:[this.data.source?.enabled??true]
  });
  kindChanged(){/* DVR options only sent when kind is DVR */}
  save(){
    if(this.form.invalid||this.busy())return;this.busy.set(true);
    const v=this.form.getRawValue();
    const body:Partial<Source>={source_kind:v.source_kind,protocol:v.protocol,url:v.url,priority:v.priority,
      enabled:v.enabled,comment:v.comment||undefined};
    if(!this.data.source)body.provider_id=v.provider_id;
    if(v.source_kind==='dvr'){
      body.dvr_url_mode=v.dvr_url_mode;body.dvr_window_seconds=v.dvr_window_seconds;
    } else if(this.data.source?.source_kind==='dvr'){
      body.dvr_url_mode=null;body.dvr_window_seconds=null;
    }
    const job=this.data.source?.id?this.api.updateSource(this.data.source.id,body):this.api.createSource(this.data.streamId,body);
    job.subscribe({next:r=>{this.feedback.ok('Источник сохранён');this.ref.close(r);},error:e=>{this.busy.set(false);this.feedback.error(e);}});
  }
}
