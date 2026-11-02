import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { AuthService } from '../core/auth.service';

interface AdminUser {id:string;username:string;display_name:string;email:string|null;status:string;role:string;last_login_at:string|null}
@Component({standalone:true,imports:[CommonModule,FormsModule,MatButtonModule,MatFormFieldModule,MatInputModule,MatSelectModule,MatTableModule,MatSlideToggleModule],template:`
<section style="padding:25px;max-width:1100px">
<h2>Пользователи админки</h2>
<p>Суперадминистратор управляет всеми разделами и пользователями. Администратор управляет IPTV, но не может просматривать, создавать или изменять пользователей админки.</p>
<div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin:22px 0">
<button mat-flat-button (click)="creating.set(!creating())">{{creating()?'Закрыть':'Создать пользователя'}}</button>
<button mat-button (click)="load()">Обновить</button>
</div>
@if(creating()){
<form (ngSubmit)="create()" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;padding:20px;border:1px solid var(--border);border-radius:12px;margin-bottom:22px">
<mat-form-field><mat-label>Логин</mat-label><input matInput name="username" [(ngModel)]="form.username" required minlength="3"></mat-form-field>
<mat-form-field><mat-label>Имя</mat-label><input matInput name="display" [(ngModel)]="form.display_name" required></mat-form-field>
<mat-form-field><mat-label>Email (необязательно)</mat-label><input matInput name="email" [(ngModel)]="form.email" type="email"></mat-form-field>
<mat-form-field><mat-label>Пароль (от 12 символов)</mat-label><input matInput name="password" [(ngModel)]="form.password" type="password" required minlength="12"></mat-form-field>
<mat-form-field><mat-label>Права</mat-label><mat-select name="role" [(ngModel)]="form.role"><mat-option value="admin">Администратор</mat-option><mat-option value="superadmin">Суперадминистратор</mat-option></mat-select></mat-form-field>
<div style="display:flex;align-items:center"><button mat-flat-button type="submit" [disabled]="saving()">Создать и активировать</button></div>
</form>
}
@if(error()){<p style="color:#e05252">{{error()}}</p>}
@if(info()){<p>{{info()}}</p>}
<div style="overflow:auto"><table mat-table [dataSource]="users()" style="width:100%">
<ng-container matColumnDef="username"><th mat-header-cell *matHeaderCellDef>Логин</th><td mat-cell *matCellDef="let u">{{u.username}}</td></ng-container>
<ng-container matColumnDef="name"><th mat-header-cell *matHeaderCellDef>Имя</th><td mat-cell *matCellDef="let u">{{u.display_name}}</td></ng-container>
<ng-container matColumnDef="role"><th mat-header-cell *matHeaderCellDef>Роль</th><td mat-cell *matCellDef="let u">{{u.role==='superadmin'?'Суперадминистратор':u.role==='admin'?'Администратор':'Другая роль'}}</td></ng-container>
<ng-container matColumnDef="status"><th mat-header-cell *matHeaderCellDef>Статус</th><td mat-cell *matCellDef="let u">{{u.status==='active'?'Активен':u.status==='disabled'?'Отключён':'Ожидает'}}</td></ng-container>
<ng-container matColumnDef="actions"><th mat-header-cell *matHeaderCellDef>Действия</th><td mat-cell *matCellDef="let u"><button mat-button [disabled]="u.id===auth.me()?.user?.id" (click)="status(u)">{{u.status==='active'?'Отключить':'Активировать'}}</button></td></ng-container>
<tr mat-header-row *matHeaderRowDef="columns"></tr><tr mat-row *matRowDef="let row;columns:columns"></tr>
</table></div></section>
`})
export class AdminUsersComponent {
 private http=inject(HttpClient);readonly auth=inject(AuthService);
 readonly users=signal<AdminUser[]>([]);readonly creating=signal(false);readonly saving=signal(false);
 readonly error=signal('');readonly info=signal('');readonly columns=['username','name','role','status','actions'];
 form={username:'',display_name:'',email:'',password:'',role:'admin' as 'admin'|'superadmin'};
 constructor(){this.load();}
 load(){this.http.get<AdminUser[]>('/api/v1/users').subscribe({next:r=>this.users.set(r),error:e=>this.error.set(e.error?.message||'Ошибка загрузки')});}
 create(){this.error.set('');if(this.form.password.length<12)return this.error.set('Пароль должен содержать минимум 12 символов');
 this.saving.set(true);const payload={...this.form,email:this.form.email||undefined};
 this.http.post('/api/v1/users',payload).subscribe({next:()=>{this.saving.set(false);this.creating.set(false);this.form={username:'',display_name:'',email:'',password:'',role:'admin'};this.info.set('Пользователь создан и активирован');this.load();},error:e=>{this.saving.set(false);this.error.set(e.error?.message||'Ошибка создания');}});
 }
 status(u:AdminUser){const next=u.status==='active'?'disabled':'active';if(!confirm((next==='disabled'?'Отключить ':'Активировать ')+u.username+'?'))return;
 this.http.patch('/api/v1/users/'+u.id+'/status',{status:next}).subscribe({next:()=>this.load(),error:e=>this.error.set(e.error?.message||'Ошибка изменения статуса')});}
}
