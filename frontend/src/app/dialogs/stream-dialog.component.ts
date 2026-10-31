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
import { AppType, Genre, Provider, Stream, Visibility } from '../core/models';
export interface StreamDialogData {stream?:Stream;apps:AppType[];genres:Genre[];providers:Provider[];selectedProvider:number|null;globalWrite:boolean}
@Component({standalone:true,imports:[ReactiveFormsModule,MatDialogModule,MatFormFieldModule,MatInputModule,MatSelectModule,MatSlideToggleModule,MatButtonModule],template:`
<div class="form-dialog wide">
  <h2 mat-dialog-title>{{data.stream?'Редактировать канал':'Добавить канал'}}</h2>
  <mat-dialog-content>
    <p class="dialog-intro">Основная информация о канале. URL вещания задаются отдельно в источниках LIVE и DVR.</p>
    <form [formGroup]="form" class="form-grid" id="stream-form" (ngSubmit)="save()">
      <mat-form-field appearance="outline"><mat-label>Номер канала</mat-label><input matInput type="number" min="1" formControlName="number" required></mat-form-field>
      <mat-form-field appearance="outline"><mat-label>Тип приложения</mat-label><mat-select formControlName="app_type_id" required>@for(app of data.apps;track app.id){<mat-option [value]="app.id">{{app.name}}</mat-option>}</mat-select></mat-form-field>
      <mat-form-field class="span-two" appearance="outline"><mat-label>Название канала</mat-label><input matInput formControlName="name" required placeholder="Например, Новости HD"></mat-form-field>
      <mat-form-field class="span-two" appearance="outline"><mat-label>Описание</mat-label><textarea matInput formControlName="description" rows="2"></textarea></mat-form-field>
      <mat-form-field class="span-two" appearance="outline"><mat-label>Жанры</mat-label><mat-select formControlName="genre_ids" multiple>@for(g of data.genres;track g.id){<mat-option [value]="g.id">{{g.name}}</mat-option>}</mat-select></mat-form-field>
      <mat-form-field appearance="outline"><mat-label>Доступность</mat-label><mat-select formControlName="visibility" (selectionChange)="visibilityChanged()"><mat-option value="all" [disabled]="!data.globalWrite">Все провайдеры</mat-option><mat-option value="selected">Выбранные провайдеры</mat-option></mat-select></mat-form-field>
      <mat-form-field appearance="outline"><mat-label>Возрастной рейтинг</mat-label><input matInput type="number" min="0" max="21" formControlName="age_rating"></mat-form-field>
      @if(form.controls.visibility.value==='selected'){
        <mat-form-field class="span-two" appearance="outline"><mat-label>Провайдеры</mat-label><mat-select multiple formControlName="provider_ids">@for(p of data.providers;track p.id){<mat-option [value]="p.id">{{p.name}}</mat-option>}</mat-select></mat-form-field>
      }
      <mat-form-field class="span-two" appearance="outline"><mat-label>Ключ логотипа (хранилище)</mat-label><input matInput formControlName="logo_key" placeholder="logos/hd-news.png"></mat-form-field>
      <div class="span-two toggle-row"><mat-slide-toggle formControlName="enabled">Вещание включено</mat-slide-toggle><mat-slide-toggle formControlName="is_public">Бесплатно без авторизации</mat-slide-toggle><mat-slide-toggle formControlName="is_adult">Для взрослых</mat-slide-toggle><mat-slide-toggle formControlName="is_radio">Радио</mat-slide-toggle></div>
    </form>
    <div class="notice">Общие каналы требуют глобальных прав редактирования. Выбор провайдеров влияет на доступность канала в плейлистах.</div>
  </mat-dialog-content>
  <mat-dialog-actions align="end"><button mat-button (click)="ref.close()">Отмена</button><button mat-flat-button [disabled]="busy()||form.invalid" (click)="save()">{{busy()?'Сохраняем…':'Сохранить канал'}}</button></mat-dialog-actions>
</div>
`})
export class StreamDialog {
  readonly data=inject<StreamDialogData>(MAT_DIALOG_DATA);readonly ref=inject(MatDialogRef<StreamDialog>);
  private fb=inject(FormBuilder);private api=inject(CatalogApi);private feedback=inject(Feedback);
  readonly busy=signal(false);
  readonly form=this.fb.nonNullable.group({
    number:[this.data.stream?.number??1,[Validators.required,Validators.min(1)]],
    name:[this.data.stream?.name??'',[Validators.required]],
    description:[this.data.stream?.description??''],
    app_type_id:[this.data.stream?.app_type_id??this.data.apps[0]?.id??1,[Validators.required]],
    visibility:[this.data.stream?.visibility??(this.data.globalWrite?'all':'selected') as Visibility],
    provider_ids:[this.data.stream?.provider_ids??(this.data.selectedProvider?[this.data.selectedProvider]:[])],
    genre_ids:[this.data.stream?.genre_ids??[]],logo_key:[this.data.stream?.logo_key??''],
    is_public:[this.data.stream?.is_public??false],is_adult:[this.data.stream?.is_adult??false],
    age_rating:[this.data.stream?.age_rating??0,[Validators.min(0),Validators.max(21)]],
    is_radio:[this.data.stream?.is_radio??false],enabled:[this.data.stream?.enabled??true]
  });
  visibilityChanged(){if(this.form.controls.visibility.value==='all')this.form.controls.provider_ids.setValue([]);
    else if(!this.form.controls.provider_ids.value.length&&this.data.selectedProvider)this.form.controls.provider_ids.setValue([this.data.selectedProvider]);}
  save(){
    if(this.form.invalid||this.busy())return;
    const v=this.form.getRawValue();
    if(v.visibility==='selected'&&!v.provider_ids.length){this.feedback.error(new Error('Укажите минимум одного провайдера'));return;}
    this.busy.set(true);
    const body={...v,logo_key:v.logo_key||undefined,description:v.description||undefined};
    const request=this.data.stream?.id?this.api.updateStream(this.data.stream.id,body):this.api.createStream(body);
    request.subscribe({next:r=>{this.feedback.ok('Канал сохранён');this.ref.close(r);},error:e=>{this.busy.set(false);this.feedback.error(e);}});
  }
}
