import { Injectable, signal } from '@angular/core';
@Injectable({providedIn:'root'})
export class ThemeService {
  readonly dark = signal(localStorage.getItem('iptv-admin-theme')==='dark');
  constructor(){ this.apply(); }
  toggle(){ this.dark.update(v=>!v); localStorage.setItem('iptv-admin-theme',this.dark()?'dark':'light'); this.apply(); }
  private apply(){ document.documentElement.classList.toggle('dark',this.dark()); }
}
