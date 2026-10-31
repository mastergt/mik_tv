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
import { Playlist, Provider, Visibility } from '../core/models';
export interface PlaylistDialogData {playlist?:Playlist;providers:Provider[];selectedProvider:number|null;globalWrite:boolean}
@Component({standalone:true,imports:[ReactiveFormsModule,MatDialogModule,MatFormFieldModule,MatInputModule,MatSelectModule,MatSlideToggleModule,MatButtonModule],template:`
<div class="form-dialog wide">
  <h2 mat-dialog-title>{{data.playlist?'Настройки плейлиста':'Новый плейлист'}}</h2>
  <mat-dialog-content>
    <p class="dialog-intro">Создайте подборку, настройте провайдеров и добавьте каналы в редакторе.</p>
    <form [formGroup]="form" class="form-grid" (ngSubmit)="save()">
      <mat-form-field class="span-two" appearance="outline"><mat-label>Название плейлиста</mat-label><input matInput formControlName="name" required placeholder="Например, Базовый пакет"></mat-form-field>
      <mat-form-field class="span-two" appearance="outline"><mat-label>Описание</mat-label><textarea matInput rows="2" formControlName="description"></textarea></mat-form-field>
      <mat-form-field appearance="outline"><mat-label>Доступность</mat-label><mat-select formControlName="visibility" (selectionChange)="visibilityChanged()"><mat-option value="all" [disabled]="!data.globalWrite">Все провайдеры</mat-option><mat-option value="selected">Выбранные</mat-option></mat-select></mat-form-field>
      <mat-form-field appearance="outline"><mat-label>Стоимость, ₽</mat-label><input matInput type="number" step="0.01" min="0" formControlName="price_rub"><mat-hint>Необязательное поле</mat-hint></mat-form-field>
      @if(form.controls.visibility.value==='selected'){
        <mat-form-field class="span-two" appearance="outline"><mat-label>Провайдеры</mat-label><mat-select formControlName="provider_ids" multiple>@for(p of data.providers;track p.id){<mat-option [value]="p.id">{{p.name}}</mat-option>}</mat-select></mat-form-field>
      }
      <mat-form-field appearance="outline"><mat-label>Дата окончания</mat-label><input matInput type="datetime-local" formControlName="expires_at"><mat-hint>Пусто — бессрочно</mat-hint></mat-form-field>
      <mat-form-field appearance="outline"><mat-label>Валюта</mat-label><input matInput formControlName="currency" maxlength="3"></mat-form-field>
      <div class="span-two toggle-row"><mat-slide-toggle formControlName="enabled">Включён</mat-slide-toggle><mat-slide-toggle formControlName="is_public">Публичный</mat-slide-toggle><mat-slide-toggle formControlName="is_hidden">Скрытый</mat-slide-toggle></div>
    </form>
  </mat-dialog-content>
  <mat-dialog-actions align="end"><button mat-button (click)="ref.close()">Отмена</button><button mat-flat-button [disabled]="busy()||form.invalid" (click)="save()">{{busy()?'Сохраняем…':'Сохранить плейлист'}}</button></mat-dialog-actions>
</div>
`})
export class PlaylistDialog {
  readonly data=inject<PlaylistDialogData>(MAT_DIALOG_DATA);readonly ref=inject(MatDialogRef<PlaylistDialog>);
  private fb=inject(FormBuilder);private api=inject(CatalogApi);private feedback=inject(Feedback);
  readonly busy=signal(false);
  readonly form=this.fb.nonNullable.group({
    name:[this.data.playlist?.name??'',Validators.required],description:[this.data.playlist?.description??''],
    visibility:[this.data.playlist?.visibility??(this.data.globalWrite?'all':'selected') as Visibility],
    provider_ids:[this.data.playlist?.provider_ids??(this.data.selectedProvider?[this.data.selectedProvider]:[])],
    price_rub:[this.data.playlist?.price_kopecks!=null?Number(this.data.playlist.price_kopecks)/100:null as number|null],
    expires_at:[this.toLocal(this.data.playlist?.expires_at)],currency:[this.data.playlist?.currency??'RUB'],
    enabled:[this.data.playlist?.enabled??true],is_hidden:[this.data.playlist?.is_hidden??false],is_public:[this.data.playlist?.is_public??false]
  });
  toLocal(value?:string|null){if(!value)return '';const d=new Date(value);if(!Number.isFinite(d.getTime()))return '';const local=new Date(d.getTime()-d.getTimezoneOffset()*60000);return local.toISOString().slice(0,16);}
  visibilityChanged(){if(this.form.controls.visibility.value==='all')this.form.controls.provider_ids.setValue([]);
    else if(!this.form.controls.provider_ids.value.length&&this.data.selectedProvider)this.form.controls.provider_ids.setValue([this.data.selectedProvider]);}
  save(){if(this.form.invalid||this.busy())return;const v=this.form.getRawValue();
    if(v.visibility==='selected'&&!v.provider_ids.length){this.feedback.error(new Error('Нужно выбрать провайдера'));return;}
    if(v.price_rub!==null&&(!Number.isFinite(v.price_rub)||v.price_rub<0||Math.round(v.price_rub*100)>Number.MAX_SAFE_INTEGER)){
      this.feedback.error(new Error('Некорректная стоимость'));return;
    }
    this.busy.set(true);
    const data:Partial<Playlist>={name:v.name,description:v.description,visibility:v.visibility,provider_ids:v.provider_ids,
      price_kopecks:v.price_rub===null?null:String(Math.round(v.price_rub*100)),currency:v.currency.toUpperCase(),
      expires_at:v.expires_at?new Date(v.expires_at).toISOString():null,
      enabled:v.enabled,is_public:v.is_public,is_hidden:v.is_hidden};
    // DTO expects a JavaScript number in kopecks (integer), not a string.
    const body={...data,price_kopecks:v.price_rub===null?null:Math.round(v.price_rub*100)};
    const job=this.data.playlist?.id?this.api.updatePlaylist(this.data.playlist.id,body as Partial<Playlist>):this.api.createPlaylist(body as Partial<Playlist>);
    job.subscribe({next:r=>{this.feedback.ok('Плейлист сохранён');this.ref.close(r);},error:e=>{this.busy.set(false);this.feedback.error(e);}});
  }
}
