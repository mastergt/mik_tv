import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatButtonModule } from '@angular/material/button';
import { CatalogApi } from '../core/catalog-api.service';
import { Feedback } from '../core/feedback.service';
import { Provider } from '../core/models';
@Component({standalone:true,imports:[ReactiveFormsModule,MatDialogModule,MatFormFieldModule,MatInputModule,MatSlideToggleModule,MatButtonModule],template:`
<div class="form-dialog">
  <h2 mat-dialog-title>{{data?.id?'Настройки провайдера':'Новый провайдер'}}</h2>
  <mat-dialog-content>
    <div class="dialog-intro">Основные параметры и ограничения подключения устройств.</div>
    <div class="span-two" style="padding:12px 0 20px"><strong>Логотип провайдера</strong><p>PNG с прозрачным фоном, рекомендуется 512 × 512 px. Допускается 128–1024 px, до 500 КБ. Изображение отображается целиком без обрезки.</p>
      @if (logoUrl()) { <img [src]="logoUrl()" alt="Логотип провайдера" style="display:block;max-width:140px;max-height:100px;object-fit:contain;margin:8px 0"> }
      @if (data?.id) { <input type="file" accept="image/png" (change)="uploadLogo($event)"><button mat-button type="button" (click)="removeLogo()">Удалить логотип</button> }
      @else { <p>Создайте провайдера, чтобы загрузить логотип.</p> }
    </div>
    <form [formGroup]="form" class="form-grid" id="provider-form" (ngSubmit)="save()">
      <mat-form-field appearance="outline"><mat-label>Наименование</mat-label><input matInput formControlName="name" required placeholder="Например, Мегалинк"></mat-form-field>
      <mat-form-field appearance="outline"><mat-label>Код (slug)</mat-label><input matInput formControlName="slug" required placeholder="mlink"></mat-form-field>
      <mat-form-field appearance="outline"><mat-label>Часовой пояс</mat-label><input matInput formControlName="timezone" placeholder="Europe/Moscow"></mat-form-field>
      <div></div>
      <mat-form-field appearance="outline"><mat-label>Максимум терминалов</mat-label><input matInput type="number" min="0" formControlName="default_terminal_limit"><mat-hint>0 — без ограничения</mat-hint></mat-form-field>
      <mat-form-field appearance="outline"><mat-label>Одновременных просмотров</mat-label><input matInput type="number" min="0" formControlName="default_concurrent_stream_limit"><mat-hint>0 — без ограничения</mat-hint></mat-form-field>
      <div class="span-two"><mat-form-field appearance="outline" style="width:100%"><mat-label>IP-подсети провайдера (IPv4 / IPv6 CIDR)</mat-label>
        <textarea matInput rows="5" formControlName="networks_text" placeholder="198.51.100.0/24&#10;2001:db8:1234::/48"></textarea>
        <mat-hint>По одной подсети на строку. Допускаются адреса /32 и /128. Самое точное совпадение имеет приоритет.</mat-hint>
      </mat-form-field></div>
      <div class="span-two toggle-row">
        <mat-slide-toggle formControlName="enabled">Провайдер активен</mat-slide-toggle>
        <mat-slide-toggle formControlName="playback_history_enabled">История просмотров</mat-slide-toggle>
        <mat-slide-toggle formControlName="stream_monitoring_enabled">Мониторинг потоков</mat-slide-toggle>
        <mat-slide-toggle formControlName="is_default">Провайдер по умолчанию (для неизвестных IP)</mat-slide-toggle>
        <p style="width:100%;font-size:13px;color:var(--muted)">По умолчанию может быть выбран только один провайдер. Если ни один не выбран и IP не совпал, клиент получит «Провайдер не найден».</p>
      </div>
    </form>
  </mat-dialog-content>
  <mat-dialog-actions align="end">
    <button mat-button (click)="ref.close()">Отмена</button>
    <button mat-flat-button [disabled]="form.invalid||busy()" (click)="save()">{{busy()?'Сохраняем…':'Сохранить'}}</button>
  </mat-dialog-actions>
</div>
`})
export class ProviderDialog {
  readonly data=inject<Provider|null>(MAT_DIALOG_DATA);readonly ref=inject(MatDialogRef<ProviderDialog>);
  private fb=inject(FormBuilder);private api=inject(CatalogApi);private feedback=inject(Feedback);
  readonly busy=signal(false);
  readonly logoUrl=signal<string|null>(this.data?.logo_url??null);
  readonly form=this.fb.nonNullable.group({
    name:[this.data?.name??'',Validators.required],slug:[this.data?.slug??'',[Validators.required,Validators.pattern(/^[a-z][a-z0-9_-]+$/)]],
    timezone:[this.data?.timezone??'Europe/Moscow',Validators.required],
    default_terminal_limit:[this.data?.default_terminal_limit??3,[Validators.min(0)]],
    default_concurrent_stream_limit:[this.data?.default_concurrent_stream_limit??2,[Validators.min(0)]],
    enabled:[this.data?.enabled??true],playback_history_enabled:[this.data?.playback_history_enabled??false],
    stream_monitoring_enabled:[this.data?.stream_monitoring_enabled??false],
    is_default:[this.data?.is_default??false],
    networks_text:[(this.data?.networks??[]).join('\n')]
  });
  uploadLogo(event:Event) {
    const input=event.target as HTMLInputElement;const file=input.files?.[0];if(!file||!this.data?.id)return;
    if(file.type!=='image/png'||file.size>500*1024){this.feedback.error({message:'Только PNG до 500 КБ'});return;}
    const reader=new FileReader();reader.onload=()=>{
      const base64=String(reader.result).split(',')[1];
      this.api.uploadProviderLogo(this.data!.id,base64).subscribe({next:r=>{this.logoUrl.set(r.logo_url+'?v='+Date.now());this.feedback.ok('Логотип загружен');},error:e=>this.feedback.error(e)});
    };reader.readAsDataURL(file);
  }
  removeLogo(){if(!this.data?.id)return;this.api.removeProviderLogo(this.data.id).subscribe({next:()=>{this.logoUrl.set(null);this.feedback.ok('Логотип удалён');},error:e=>this.feedback.error(e)});}
  save(){if(this.form.invalid||this.busy())return;this.busy.set(true);
    const {networks_text,...values}=this.form.getRawValue();
    const payload={...values,networks:networks_text.split(/[\r\n,;]+/).map(s=>s.trim()).filter(Boolean)};
    const request=this.data?.id?this.api.updateProvider(this.data.id,payload):this.api.createProvider(payload);
    request.subscribe({next:r=>{this.feedback.ok('Провайдер сохранён');this.ref.close(r);},error:e=>{this.busy.set(false);this.feedback.error(e);}});
  }
}
