import { Component, Inject, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { EpgApi, EpgSource, EpgSourceForm } from '../core/epg-api.service';
import { ProviderContext } from '../core/provider-context.service';
import { Feedback } from '../core/feedback.service';

@Component({standalone:true,imports:[CommonModule,FormsModule,MatDialogModule,MatButtonModule,MatFormFieldModule,MatInputModule,MatSelectModule,MatSlideToggleModule],template:`
  <h2 mat-dialog-title>{{data.source?'Редактирование EPG':'Новый источник EPG'}}</h2>
  <mat-dialog-content class="epg-dialog">
    <p class="page-desc">XMLTV с поддержкой gzip. Сервер будет загружать файл по HTTPS и сохранять программу в PostgreSQL.</p>
    <mat-form-field appearance="outline"><mat-label>Название источника</mat-label><input matInput [(ngModel)]="form.name" required maxlength="200" /></mat-form-field>
    <mat-form-field appearance="outline"><mat-label>Адрес XMLTV (.xml или .xml.gz)</mat-label><input matInput [(ngModel)]="form.download_uri" required placeholder="https://…/epg.xml.gz" /></mat-form-field>
    <mat-form-field appearance="outline"><mat-label>Интервал обновления</mat-label><mat-select [(ngModel)]="form.refresh_interval_seconds">
      <mat-option [value]="3600">Каждый час</mat-option><mat-option [value]="10800">Каждые 3 часа</mat-option>
      <mat-option [value]="21600">Каждые 6 часов</mat-option><mat-option [value]="43200">Каждые 12 часов</mat-option>
      <mat-option [value]="86400">Раз в сутки</mat-option></mat-select></mat-form-field>
    <mat-form-field appearance="outline"><mat-label>Доступность</mat-label><mat-select [(ngModel)]="form.visibility">
      <mat-option value="all">Все провайдеры</mat-option><mat-option value="selected">Выбранные провайдеры</mat-option>
    </mat-select></mat-form-field>
    @if(form.visibility==='selected'){
      <mat-form-field appearance="outline"><mat-label>Провайдеры</mat-label><mat-select multiple [(ngModel)]="form.provider_ids">
        @for(p of context.providers();track p.id){<mat-option [value]="p.id">{{p.name}}</mat-option>}
      </mat-select></mat-form-field>
    }
    <mat-form-field appearance="outline"><mat-label>Комментарий</mat-label><textarea matInput rows="2" [(ngModel)]="form.comment"></textarea></mat-form-field>
    <mat-slide-toggle [(ngModel)]="form.enabled">Источник включён</mat-slide-toggle>
  </mat-dialog-content>
  <mat-dialog-actions align="end"><button mat-button mat-dialog-close>Отмена</button><button mat-flat-button [disabled]="saving||!form.name.trim()||!form.download_uri.trim()||(form.visibility==='selected'&&!form.provider_ids.length)" (click)="save()">{{saving?'Сохранение…':'Сохранить'}}</button></mat-dialog-actions>
`,styles:[`.epg-dialog{display:flex;flex-direction:column;gap:7px;min-width:min(540px,88vw);padding-top:14px}.epg-dialog .page-desc{margin-bottom:14px}@media(max-width:700px){.epg-dialog{min-width:0}}`]})
export class EpgSourceDialogComponent {
  readonly context=inject(ProviderContext);private api=inject(EpgApi);private feedback=inject(Feedback);private dialog=inject(MatDialogRef<EpgSourceDialogComponent>);
  saving=false;
  form:EpgSourceForm;
  constructor(@Inject(MAT_DIALOG_DATA) public data:{source?:EpgSource}){
    const s=data.source;
    this.form={name:s?.name??'',download_uri:s?.download_uri??'',enabled:s?.enabled??true,
      visibility:s?.visibility??'all',provider_ids:s?.provider_ids??[],refresh_interval_seconds:s?.refresh_interval_seconds??21600,comment:s?.comment??null};
  }
  save(){this.saving=true;
    const r=this.data.source?this.api.updateSource(this.data.source.id,this.form):this.api.createSource(this.form);
    r.subscribe({next:()=>{this.feedback.ok('Источник сохранён');this.dialog.close(true)},error:e=>{this.saving=false;this.feedback.error(e)}});
  }
}
