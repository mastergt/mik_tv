import { Injectable, inject, signal, computed } from '@angular/core';
import { CatalogApi } from './catalog-api.service';
import { AuthService } from './auth.service';
import { Provider } from './models';

@Injectable({providedIn:'root'})
export class ProviderContext {
  private api=inject(CatalogApi);
  private auth=inject(AuthService);
  readonly providers=signal<Provider[]>([]);
  readonly selectedId=signal<number|null>(null);
  readonly selected=computed(()=>this.providers().find(p=>p.id===this.selectedId())??null);
  readonly canGlobal=computed(()=>this.auth.can('streams.read')||this.auth.can('playlists.read')||this.auth.can('abonents.read')||this.auth.can('terminals.read'));
  load(){
    this.api.providers().subscribe({next:p=>{
      const accessible=this.validIds();
      const merged=[...p,...accessible.filter(id=>!p.some(x=>x.id===id)).map(id=>({id,name:`Провайдер #${id}`,slug:`provider-${id}`,enabled:true,timezone:'UTC',default_terminal_limit:0,default_concurrent_stream_limit:0,playback_history_enabled:false,stream_monitoring_enabled:false}))];
      this.providers.set(merged);
      const available=[...new Set([...accessible,...p.map(x=>x.id)])];
      if(!this.canGlobal()&&this.selectedId()===null&&available.length)this.selectedId.set(available[0]);
      else if(this.selectedId()!==null&&!available.includes(this.selectedId()!))this.selectedId.set(this.canGlobal()?null:available[0]??null);
    },error:()=>{
      // Provider list permission may not exist; scope may still expose provider IDs.
      const ids=this.validIds();
      this.providers.set(ids.map(id=>({id,name:`Провайдер #${id}`,slug:`provider-${id}`,enabled:true,timezone:'UTC',default_terminal_limit:0,default_concurrent_stream_limit:0,playback_history_enabled:false,stream_monitoring_enabled:false})));
      if(!this.canGlobal()&&ids.length)this.selectedId.set(ids[0]);
    }});
  }
  validIds(){
    const perms=this.auth.me()?.permissions??{};
    return [...new Set(Object.entries(perms).filter(([key])=>key.endsWith('.read')).flatMap(([,val])=>val.providers))].sort((a,b)=>a-b);
  }
}
