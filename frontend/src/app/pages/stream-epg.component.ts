import { Component, DestroyRef, Input, inject, signal, effect } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { EpgApi, EpgChannelSearch, EpgStreamAssignment, EpgProgramme } from '../core/epg-api.service';
import { ProviderContext } from '../core/provider-context.service';
import { AuthService } from '../core/auth.service';
import { Feedback } from '../core/feedback.service';
import { Subject, of } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, catchError } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({selector:'app-stream-epg',standalone:true,
  imports:[DatePipe,FormsModule,MatAutocompleteModule,MatFormFieldModule,MatInputModule,MatButtonModule,MatCheckboxModule,MatProgressBarModule],
  template:`
  <section class="surface epg-box">
    <header class="epg-head">
      <div class="icon-box"><span class="material-symbols-outlined">calendar_month</span></div>
      <div class="head-copy"><h2>Телепрограмма EPG</h2><p>Ручное сопоставление по названию или XMLTV ID. Никаких автоматических назначений.</p></div>
      <button mat-stroked-button (click)="reload()" [disabled]="busy()">Обновить</button>
    </header>
    @if(loading()){<mat-progress-bar mode="indeterminate" />}
    @if(assignment(); as a){
      <div class="current">
        <div class="logo-box">
          @if(logoUrl(a.logo_key); as url){<img [src]="url" alt="Логотип канала" />}
          @else{<span class="material-symbols-outlined">image</span>}
        </div>
        <div class="current-copy">
          <span class="eyebrow">ТЕКУЩЕЕ СООТВЕТСТВИЕ</span>
          <strong>{{a.mapping?.display_name || a.mapping?.external_channel_id || 'Не выбрано'}}</strong>
          @if(a.mapping){<small>{{a.mapping.source_name}} · XMLTV ID: {{a.mapping.external_channel_id}}</small>}
          @else{<small>Выберите канал из загруженного XMLTV.</small>}
        </div>
        @if(a.mapping && canRemove(a.mapping.provider_id)){
          <button mat-stroked-button (click)="remove()" [disabled]="busy()">Отвязать</button>
        }
      </div>
    }
    @if(canRead() && canWrite()){
      <div class="editor">
        <mat-form-field appearance="outline" class="search-field" subscriptSizing="dynamic">
          <mat-label>Найти EPG по названию или XMLTV ID</mat-label>
          <span matPrefix class="material-symbols-outlined search-icon">search</span>
          <input matInput [(ngModel)]="searchText" (ngModelChange)="onSearch($event)"
                 [matAutocomplete]="epgAuto" placeholder="Введите минимум 2 символа" />
          <mat-autocomplete #epgAuto="matAutocomplete" (optionSelected)="select($event)">
            @for(option of results();track option.id){
              <mat-option [value]="option.id">
                <div class="option-row"><span class="material-symbols-outlined">{{option.icon_url?'image':'tv'}}</span>
                  <div><strong>{{option.display_name || option.external_channel_id}}</strong>
                    <small>{{option.source_name}} · {{option.external_channel_id}}</small></div></div>
              </mat-option>
            }
          </mat-autocomplete>
        </mat-form-field>
        @if(searching()){<span class="status">Ищу каналы…</span>}
        @if(searchText.trim().length>=2 && !results().length && !searching() && !selected()){
          <span class="status">Совпадений нет. Уточните название или XMLTV ID.</span>
        }
        @if(selected(); as option){
          <div class="chosen">
            <div><span class="eyebrow">ВЫБРАНО В XMLTV</span><strong>{{option.display_name}}</strong>
              <small>{{option.source_name}} · ID {{option.external_channel_id}}</small>
              @if(option.icon_url){<small>Логотип есть в XMLTV. Скопируем и сохраним на этом сервере.</small>}
            </div>
            <button mat-stroked-button (click)="clearSelection()">Изменить</button>
          </div>
          @if(option.icon_url && canUpdateLogo()){
            <mat-checkbox [(ngModel)]="fetchLogo">Скачать логотип EPG и хранить локально
              @if(assignment()?.logo_key){(заменит текущий логотип)}
            </mat-checkbox>
          }
          <div class="save-line"><button mat-flat-button class="primary-btn" [disabled]="busy()" (click)="save()">
            {{busy()?'Сохранение…':'Сохранить сопоставление'}}
          </button></div>
        }
      </div>
    }
    @if(assignment()?.mapping){
      <div class="guide">
        <div class="guide-head"><div><h3>Программа передач</h3><p>Текущая, следующая и расписание на выбранную дату</p></div>
          <div class="guide-actions"><input type="date" aria-label="Дата программы" [(ngModel)]="day" (change)="loadProgrammes()" />
            <button mat-stroked-button (click)="loadProgrammes()">Обновить</button></div>
        </div>
        @if(programmeLoading()){<mat-progress-bar mode="indeterminate" />}
        @if(currentProgramme();as p){<div class="onair"><span class="material-symbols-outlined">play_circle</span>
          <div><small>СЕЙЧАС В ЭФИРЕ</small><strong>{{p.title || 'Без названия'}}</strong></div>
          <span>{{p.starts_at | date:'HH:mm'}}–{{p.ends_at | date:'HH:mm'}}</span>
        </div>}
        @if(nextProgramme();as p){<div class="next"><span>Далее в {{p.starts_at | date:'HH:mm'}}</span><strong>{{p.title || 'Без названия'}}</strong></div>}
        <div class="programme-list">
          @for(p of programmes();track p.id){
            <div class="programme"><div class="time"><b>{{p.starts_at|date:'HH:mm'}}</b><small>{{p.ends_at|date:'HH:mm'}}</small></div>
              <div><strong>{{p.title||'Без названия'}}</strong>@if(p.description){<p>{{p.description}}</p>}</div>
            </div>
          }@empty{<div class="empty-program">На эту дату нет передач. Проверьте сопоставление и импорт XMLTV.</div>}
        </div>
      </div>
    }
  </section>
  `,styles:[`
    .epg-box{margin-top:26px;padding:25px;border-radius:20px}.epg-head{display:flex;align-items:center;gap:16px;flex-wrap:wrap}
    .icon-box{width:49px;height:49px;background:var(--accent-light);color:var(--accent);border-radius:13px;display:grid;place-items:center}
    .icon-box span{font-size:28px}.head-copy{flex:1;min-width:220px}.head-copy h2{font-size:22px;margin:0 0 4px;font-weight:800}
    .head-copy p{margin:0;color:var(--muted);font-size:15px}.current{display:flex;align-items:center;gap:17px;background:var(--muted-panel);border-radius:15px;padding:18px;margin:24px 0;flex-wrap:wrap}
    .logo-box{width:82px;height:64px;background:var(--surface);border:1px solid var(--border);border-radius:12px;display:grid;place-items:center;flex:none;overflow:hidden}
    .logo-box img{width:100%;height:100%;object-fit:contain}.logo-box span{color:var(--muted);font-size:29px}.current-copy{flex:1;display:grid;gap:5px;min-width:180px}.current-copy strong{font-size:19px}.current-copy small,.chosen small{font-size:14px;color:var(--muted)}
    .eyebrow{font-size:12px;letter-spacing:.08em;color:var(--accent);font-weight:800}.editor{padding:6px 0 15px;display:flex;flex-direction:column;gap:14px}.search-field{width:100%}.search-icon{margin-left:10px;margin-right:8px;color:var(--muted)}
    .option-row{display:flex;align-items:center;gap:13px;min-height:57px}.option-row .material-symbols-outlined{color:var(--accent)}.option-row div{display:grid;gap:2px}.option-row strong{font-size:16px}.option-row small{font-size:12px;color:var(--muted)}
    .chosen{background:var(--muted-panel);padding:18px;border:1px solid var(--border);border-radius:13px;display:flex;align-items:center;justify-content:space-between;gap:12px}.chosen>div{display:grid;gap:5px}.chosen strong{font-size:19px}.save-line{display:flex;justify-content:flex-end}.save-line button{min-height:45px}
    .status{font-size:14px;color:var(--muted)}.guide{margin-top:20px;border-top:1px solid var(--border);padding-top:25px}.guide-head{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center}.guide h3{font-size:21px;font-weight:800;margin:0 0 5px}.guide p{margin:0;color:var(--muted);font-size:14px}.guide-actions{display:flex;gap:9px}.guide-actions input{font:inherit;font-size:16px;color:var(--text);background:var(--surface);border:1px solid var(--border);border-radius:9px;padding:10px}
    .onair{display:flex;align-items:center;gap:14px;padding:18px;margin:20px 0 10px;border:1px solid var(--border);background:var(--accent-light);border-radius:15px}.onair .material-symbols-outlined{color:var(--accent);font-size:31px}.onair>div{flex:1;display:grid;gap:3px}.onair small{font-size:12px;color:var(--accent);font-weight:800}.onair strong{font-size:18px}.onair>span:last-child{font-size:15px;white-space:nowrap}
    .next{display:flex;gap:12px;padding:13px 5px;align-items:center}.next span{font-size:14px;color:var(--muted)}.next strong{font-size:16px}.programme-list{max-height:490px;overflow-y:auto}.programme{display:flex;gap:18px;border-bottom:1px solid var(--border);padding:16px 6px}.time{min-width:66px;display:grid;align-content:start;gap:4px}.time b{font-size:17px}.time small{font-size:13px;color:var(--muted)}.programme>div:nth-child(2){flex:1}.programme strong{font-size:16px}.programme p{font-size:14px;margin-top:5px;max-height:70px;overflow:hidden}.empty-program{padding:23px;color:var(--muted);font-size:15px}
    @media(max-width:700px){.epg-box{padding:17px}.guide-actions{width:100%;flex-wrap:wrap}.chosen{flex-direction:column;align-items:stretch}.onair{flex-wrap:wrap}}
  `]})
export class StreamEpgComponent {
  @Input({required:true}) streamId!:string;
  private readonly destroyRef=inject(DestroyRef);
  private readonly api=inject(EpgApi);
  private readonly context=inject(ProviderContext);
  private readonly auth=inject(AuthService);
  private readonly feedback=inject(Feedback);
  private readonly search$=new Subject<string>();
  readonly assignment=signal<EpgStreamAssignment|null>(null);
  readonly results=signal<EpgChannelSearch[]>([]);
  readonly selected=signal<EpgChannelSearch|null>(null);
  readonly programmes=signal<EpgProgramme[]>([]);
  readonly loading=signal(false);readonly searching=signal(false);readonly busy=signal(false);readonly programmeLoading=signal(false);
  searchText='';fetchLogo=true;
  day=[new Date().getFullYear(),String(new Date().getMonth()+1).padStart(2,'0'),String(new Date().getDate()).padStart(2,'0')].join('-');
  constructor(){
    this.search$.pipe(debounceTime(300),distinctUntilChanged(),switchMap(q=>{
      if(q.trim().length<2){this.searching.set(false);return of([] as EpgChannelSearch[]);}
      this.searching.set(true);
      return this.api.searchChannels(q,this.context.selectedId()??undefined).pipe(catchError(e=>{
        this.feedback.error(e);return of([] as EpgChannelSearch[]);
      }));
    }),takeUntilDestroyed(this.destroyRef)).subscribe(items=>{this.searching.set(false);this.results.set(items);});
    effect(()=>{this.context.selectedId();this.reload();});
  }
  canRead(){return this.auth.can('epg.read',this.context.selectedId());}
  canWrite(){return this.auth.can('epg.write',this.context.selectedId());}
  canUpdateLogo(){return this.auth.can('streams.write',this.context.selectedId());}
  canRemove(providerId:number|null){return this.auth.can('epg.write',providerId);}
  logoUrl(key:string|null){
    const name=key?.startsWith('epg-logos/')?key.slice('epg-logos/'.length):null;
    return name && /^[a-f0-9]{64}\.(png|jpg|gif|webp)$/.test(name)?`/api/v1/epg/logos/${name}`:null;
  }
  reload(){if(!this.canRead())return;
    this.clearSelection();this.loading.set(true);
    this.api.streamAssignment(this.streamId,this.context.selectedId()??undefined).subscribe({
      next:r=>{this.assignment.set(r);this.loading.set(false);if(r.mapping)this.loadProgrammes();else this.programmes.set([]);},
      error:e=>{this.loading.set(false);this.feedback.error(e);}
    });
  }
  onSearch(value:string){this.selected.set(null);this.search$.next(value);}
  select(event:MatAutocompleteSelectedEvent){
    const item=this.results().find(x=>x.id===event.option.value);
    if(!item)return;
    this.selected.set(item);this.searchText=item.display_name||item.external_channel_id;
    this.fetchLogo=!!item.icon_url && !this.assignment()?.logo_key;
    this.results.set([]);this.search$.next('');
  }
  clearSelection(){this.selected.set(null);this.searchText='';this.results.set([]);this.search$.next('');}
  save(){const selected=this.selected();if(!selected||this.busy())return;
    this.busy.set(true);
    const providerId=this.context.selectedId();
    this.api.setMapping({stream_id:this.streamId,epg_channel_id:selected.id,provider_id:providerId,priority:10}).subscribe({
      next:()=>{
        if(this.fetchLogo && selected.icon_url && this.canUpdateLogo()){
          this.api.importLogo(this.streamId,selected.id,providerId).subscribe({
            next:()=>{this.busy.set(false);this.feedback.ok('EPG и локальный логотип сохранены');this.reload();},
            error:e=>{this.busy.set(false);this.feedback.error(e,'EPG сохранён, но логотип не загружен');this.reload();}
          });
        }else{this.busy.set(false);this.feedback.ok('EPG сопоставлен с каналом');this.reload();}
      },error:e=>{this.busy.set(false);this.feedback.error(e)}
    });
  }
  remove(){const mapping=this.assignment()?.mapping;if(!mapping||this.busy()||!this.canRemove(mapping.provider_id))return;
    if(!confirm('Убрать EPG-сопоставление для этого канала? Локально сохранённый логотип останется.'))return;
    this.busy.set(true);this.api.removeMapping(mapping.id).subscribe({
      next:()=>{this.busy.set(false);this.feedback.ok('EPG отвязан');this.reload();},
      error:e=>{this.busy.set(false);this.feedback.error(e)}
    });
  }
  loadProgrammes(){if(!this.assignment()?.mapping)return;
    const start=new Date(this.day+'T00:00:00');if(!Number.isFinite(start.getTime()))return;
    const end=new Date(start.getTime()+86400000);
    this.programmeLoading.set(true);
    this.api.programmes(this.streamId,this.context.selectedId()??undefined,start.toISOString(),end.toISOString())
      .subscribe({next:rows=>{this.programmes.set(rows);this.programmeLoading.set(false);},error:e=>{this.programmeLoading.set(false);this.feedback.error(e)}});
  }
  currentProgramme(){const now=Date.now();return this.programmes().find(p=>new Date(p.starts_at).getTime()<=now&&(!p.ends_at||new Date(p.ends_at).getTime()>now))??null;}
  nextProgramme(){const now=Date.now();return this.programmes().find(p=>new Date(p.starts_at).getTime()>now)??null;}
}
