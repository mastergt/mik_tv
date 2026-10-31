import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatButtonModule } from '@angular/material/button';
import { CatalogApi } from '../core/catalog-api.service';
import { Feedback } from '../core/feedback.service';
import { AppType } from '../core/models';
@Component({standalone:true,imports:[ReactiveFormsModule,MatDialogModule,MatFormFieldModule,MatInputModule,MatSlideToggleModule,MatButtonModule],template:`
<div class="form-dialog"><h2 mat-dialog-title>{{data?'Редактировать приложение':'Новый тип приложения'}}</h2>
<mat-dialog-content><form [formGroup]="form" class="stack" (ngSubmit)="save()">
<mat-form-field appearance="outline"><mat-label>Код</mat-label><input matInput formControlName="code" required placeholder="cctv"></mat-form-field>
<mat-form-field appearance="outline"><mat-label>Название</mat-label><input matInput formControlName="name" required placeholder="Видеонаблюдение"></mat-form-field>
<mat-slide-toggle formControlName="enabled">Включён</mat-slide-toggle>
</form></mat-dialog-content>
<mat-dialog-actions align="end"><button mat-button (click)="ref.close()">Отмена</button><button mat-flat-button [disabled]="busy()||form.invalid" (click)="save()">Сохранить</button></mat-dialog-actions></div>
`})
export class AppTypeDialog {
  readonly data=inject<AppType|null>(MAT_DIALOG_DATA);readonly ref=inject(MatDialogRef<AppTypeDialog>);
  private fb=inject(FormBuilder);private api=inject(CatalogApi);private feedback=inject(Feedback);readonly busy=signal(false);
  readonly form=this.fb.nonNullable.group({code:[this.data?.code??'',[Validators.required,Validators.pattern(/^[a-z][a-z0-9_]+$/)]],name:[this.data?.name??'',Validators.required],enabled:[this.data?.enabled??true]});
  save(){if(this.form.invalid||this.busy())return;this.busy.set(true);
    const job=this.data?this.api.updateAppType(this.data.id,this.form.getRawValue()):this.api.createAppType(this.form.getRawValue());
    job.subscribe({next:r=>{this.feedback.ok('Тип приложения сохранён');this.ref.close(r);},error:e=>{this.busy.set(false);this.feedback.error(e);}});
  }
}
