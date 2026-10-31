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
import { Genre, Provider, Visibility } from '../core/models';
export interface GenreDialogData {genre?:Genre;providers:Provider[];selectedProvider:number|null;globalWrite:boolean}
@Component({standalone:true,imports:[ReactiveFormsModule,MatDialogModule,MatFormFieldModule,MatInputModule,MatSelectModule,MatSlideToggleModule,MatButtonModule],template:`
<div class="form-dialog"><h2 mat-dialog-title>{{data.genre?'Редактировать жанр':'Новый жанр'}}</h2>
<mat-dialog-content><form [formGroup]="form" class="stack" (ngSubmit)="save()">
  <mat-form-field appearance="outline"><mat-label>Название</mat-label><input matInput required formControlName="name" placeholder="Кино, новости, спорт…"></mat-form-field>
  <mat-form-field appearance="outline"><mat-label>Доступность</mat-label><mat-select formControlName="visibility" [disabled]="!!data.genre" (selectionChange)="changed()"><mat-option value="all" [disabled]="!data.globalWrite">Все провайдеры</mat-option><mat-option value="selected">Выбранные провайдеры</mat-option></mat-select></mat-form-field>
  @if(form.controls.visibility.value==='selected'&&!data.genre){<mat-form-field appearance="outline"><mat-label>Провайдеры</mat-label><mat-select formControlName="provider_ids" multiple>@for(p of data.providers;track p.id){<mat-option [value]="p.id">{{p.name}}</mat-option>}</mat-select></mat-form-field>}
  <mat-slide-toggle formControlName="is_adult">Категория 18+</mat-slide-toggle>
@if(data.genre?.visibility==='selected'){<div class="notice">Изменение списка провайдеров для существующего жанра будет доступно после расширения API. Сейчас редактируются название и ограничение 18+.</div>}
</form></mat-dialog-content>
<mat-dialog-actions align="end"><button mat-button (click)="ref.close()">Отмена</button><button mat-flat-button [disabled]="busy()||form.invalid" (click)="save()">Сохранить</button></mat-dialog-actions></div>
`})
export class GenreDialog {
  readonly data=inject<GenreDialogData>(MAT_DIALOG_DATA);readonly ref=inject(MatDialogRef<GenreDialog>);
  private fb=inject(FormBuilder);private api=inject(CatalogApi);private feedback=inject(Feedback);
  readonly busy=signal(false);
  readonly form=this.fb.nonNullable.group({name:[this.data.genre?.name??'',Validators.required],
    visibility:[this.data.genre?.visibility??(this.data.globalWrite?'all':'selected') as Visibility],
    provider_ids:[this.data.genre?.provider_ids??(this.data.selectedProvider?[this.data.selectedProvider]:[])],is_adult:[this.data.genre?.is_adult??false]});
  changed(){if(this.form.controls.visibility.value==='all')this.form.controls.provider_ids.setValue([]);
    else if(!this.form.controls.provider_ids.value.length&&this.data.selectedProvider)this.form.controls.provider_ids.setValue([this.data.selectedProvider]);}
  save(){if(this.form.invalid||this.busy())return;const v=this.form.getRawValue();
    if(v.visibility==='selected'&&!v.provider_ids.length){this.feedback.error(new Error('Выберите провайдера'));return;}
    this.busy.set(true);
    // GET /genres does not expose provider_ids; preserve existing links when editing.
    const job=this.data.genre?.id?this.api.updateGenre(this.data.genre.id,{name:v.name,is_adult:v.is_adult}):this.api.createGenre(v);
    job.subscribe({next:r=>{this.feedback.ok('Жанр сохранён');this.ref.close(r);},error:e=>{this.busy.set(false);this.feedback.error(e);}});
  }
}
