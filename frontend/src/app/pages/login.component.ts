import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../core/auth.service';
import { ThemeService } from '../core/theme.service';
@Component({selector:'app-login',standalone:true,
  imports:[ReactiveFormsModule,MatButtonModule,MatInputModule,MatFormFieldModule,MatIconModule,MatProgressSpinnerModule],
  template:`
  <div class="login-screen">
    <section class="hero-panel">
      <div class="hero-brand"><div class="logo-box"><span class="material-symbols-outlined">live_tv</span></div><div>IPTV <b>Control</b></div></div>
      <div class="hero-content">
        <div class="hero-tag"><span class="shine-dot"></span> Платформа нового поколения</div>
        <h1>Управлять контентом.<br><span>Создавать впечатления.</span></h1>
        <p>Каналы, плейлисты, провайдеры и клиентские устройства — в едином пространстве управления.</p>
        <div class="hero-art">
          <div class="art-header"><div class="art-dots"><i></i><i></i><i></i></div><span>КАТАЛОГ КОНТЕНТА</span><span class="art-badge">● LIVE</span></div>
          <div class="art-body">
            <div class="art-side"><div></div><div></div><div></div><div></div></div>
            <div class="art-main"><div class="art-metrics"><div><small>ВЕЩАНИЕ</small><b>24 / 7</b></div><div><small>ПРОВАЙДЕРЫ</small><b>∞</b></div></div><div class="art-lines"><i></i><i></i><i></i><i></i></div></div>
          </div>
        </div>
      </div>
      <div class="hero-footer">IPTV PLATFORM <span>—</span> ИНФРАСТРУКТУРА ТЕЛЕВИДЕНИЯ</div>
    </section>
    <section class="form-panel">
      <div class="login-top"><span class="env-indicator"><i></i> ADMIN CONSOLE</span><button mat-icon-button aria-label="Сменить тему" (click)="theme.toggle()"><span class="material-symbols-outlined">{{theme.dark()?'light_mode':'dark_mode'}}</span></button></div>
      <div class="login-wrap">
        <div class="login-eyebrow">ДОБРО ПОЖАЛОВАТЬ</div>
        <h2>Вход в систему</h2>
        <p class="login-desc">Введите данные администратора, чтобы продолжить работу.</p>
        @if(pending()){<div class="error-note" style="margin-bottom:20px">Ваша учётная запись ожидает назначения прав администратором.</div>}
        <form [formGroup]="form" (ngSubmit)="submit()">
          <label class="field-name" for="username">Имя пользователя</label>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <span matPrefix class="material-symbols-outlined field-icon">person</span>
            <input matInput id="username" autocomplete="username" formControlName="username" placeholder="Ваш логин" />
          </mat-form-field>
          <label class="field-name" for="password">Пароль</label>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <span matPrefix class="material-symbols-outlined field-icon">lock</span>
            <input matInput id="password" [type]="showPassword()?'text':'password'" autocomplete="current-password" formControlName="password" placeholder="Введите пароль" />
            <button mat-icon-button matSuffix type="button" [attr.aria-label]="showPassword()?'Скрыть пароль':'Показать пароль'" (click)="showPassword.set(!showPassword())"><span class="material-symbols-outlined">{{showPassword()?'visibility_off':'visibility'}}</span></button>
          </mat-form-field>
          @if(error()){<div class="error-message"><span class="material-symbols-outlined">error</span>{{error()}}</div>}
          <button mat-flat-button class="submit" type="submit" [disabled]="form.invalid||busy()">
            @if(busy()){<mat-spinner diameter="22" />}
            @else { Войти в панель <span class="material-symbols-outlined">arrow_forward</span> }
          </button>
        </form>
        <div class="sso-divider"><span>или</span></div>
        <button mat-stroked-button type="button" class="sso-button" (click)="ssoShown.set(!ssoShown())"><span class="material-symbols-outlined">verified_user</span> Вход через OAuth2 / OIDC</button>
        @if(ssoShown()){
          <div class="sso-entry"><label class="field-name" for="oidc-code">Код настроенного OIDC-провайдера</label>
            <input id="oidc-code" type="text" [value]="ssoCode()" (input)="ssoCode.set($any($event.target).value)" placeholder="Например, corp" />
            <button mat-flat-button type="button" [disabled]="!validSso()" (click)="startSso()">Продолжить через SSO</button>
          </div>
        }
        <div class="login-tip"><span class="material-symbols-outlined">shield_lock</span><span>Защищённый доступ только для уполномоченных сотрудников</span></div>
      </div>
      <div class="login-bottom">© 2026 IPTV Control <span>Версия 0.2.0</span></div>
    </section>
  </div>
  `,
  styles:[`
    .login-screen{display:grid;grid-template-columns:1.04fr 1fr;min-height:100vh}
    .hero-panel{position:relative;display:flex;flex-direction:column;overflow:hidden;padding:45px clamp(25px,4.5vw,75px) 34px;color:#fff;background:linear-gradient(137deg,#103b99 0%,#1e65dc 48%,#387df0 100%)}
    .hero-panel:before{position:absolute;content:'';width:780px;height:780px;border:1px solid rgba(255,255,255,.16);border-radius:50%;top:30%;left:-45%;box-shadow:0 0 0 120px rgba(255,255,255,.018),0 0 0 230px rgba(255,255,255,.012)}
    .hero-panel:after{content:'';position:absolute;width:500px;height:500px;right:-300px;top:-200px;background:#92bcff;filter:blur(180px);opacity:.25}
    .hero-brand{display:flex;align-items:center;gap:14px;font-size:23px;font-weight:500;letter-spacing:-.06em;position:relative;z-index:1}.hero-brand b{font-weight:800}
    .logo-box{height:48px;width:48px;display:grid;place-items:center;border-radius:14px;background:#fff;color:#2167e4}.logo-box .material-symbols-outlined{font-size:27px}
    .hero-content{margin:auto 0;max-width:640px;position:relative;z-index:1;padding-top:20px}
    .hero-tag{display:inline-flex;align-items:center;gap:9px;font-size:12px;letter-spacing:.06em;font-weight:700;border:1px solid rgba(255,255,255,.24);border-radius:99px;padding:10px 15px;background:rgba(255,255,255,.08)}
    .shine-dot{width:8px;height:8px;border-radius:50%;background:#a4fcdf;box-shadow:0 0 0 4px rgba(164,252,223,.15)}
    h1{font-size:clamp(38px,4.2vw,65px);line-height:1.18;letter-spacing:-.065em;font-weight:800;margin:26px 0 20px}
    h1 span{color:#bcd7ff}p{font-size:17px;line-height:1.85;color:#e6efff;max-width:505px}
    .hero-art{margin-top:55px;width:min(500px,100%);background:rgba(255,255,255,.95);color:#172b4e;border-radius:20px;box-shadow:0 30px 70px rgba(10,32,87,.26);overflow:hidden;transform:rotate(-3deg)}
    .art-header{height:45px;background:#eff4fc;display:flex;align-items:center;justify-content:space-between;padding:0 17px;font-size:9px;letter-spacing:.15em;color:#6a83a6;font-weight:800}
    .art-dots{display:flex;gap:5px}.art-dots i{height:7px;width:7px;border-radius:50%;background:#a8bfd8}.art-dots i:first-child{background:#fa8e8e}.art-badge{color:#168c66;letter-spacing:.09em}
    .art-body{display:flex;height:185px}.art-side{width:76px;background:#f6f9fe;padding:20px;display:flex;flex-direction:column;gap:15px}.art-side div{height:9px;border-radius:4px;background:#d7e4f7}
    .art-main{flex:1;padding:24px}.art-metrics{display:flex;gap:12px}.art-metrics div{background:#edf4ff;flex:1;border-radius:11px;padding:12px 17px;display:flex;flex-direction:column;gap:4px}.art-metrics small{font-size:8px;color:#6584b5;letter-spacing:.1em;font-weight:800}.art-metrics b{font-size:25px;color:#2364c8}.art-lines{display:flex;flex-direction:column;gap:9px;margin-top:22px}.art-lines i{height:10px;background:#e4ecf8;border-radius:5px}.art-lines i:nth-child(2){width:81%}.art-lines i:nth-child(3){width:62%}.art-lines i:nth-child(4){width:74%}
    .hero-footer{position:relative;z-index:1;letter-spacing:.17em;font-size:10px;font-weight:750;color:#cbdfff}.hero-footer span{margin:0 8px}
    .form-panel{display:flex;flex-direction:column;padding:35px clamp(25px,5.1vw,90px);background:var(--surface)}
    .login-top{display:flex;align-items:center;justify-content:flex-end;gap:17px;color:var(--muted)}
    .env-indicator{display:flex;align-items:center;gap:7px;font-size:11px;font-weight:800;letter-spacing:.1em}.env-indicator i{height:7px;width:7px;border-radius:50%;background:#35b589}
    .login-wrap{width:min(440px,100%);margin:auto;}
    .login-eyebrow{font-size:11px;color:var(--accent);font-weight:800;letter-spacing:.16em;margin-bottom:12px}
    h2{font-size:42px;font-weight:800;letter-spacing:-.065em;line-height:1.2;margin:0 0 12px}
    .login-desc{font-size:16px;line-height:1.7;color:var(--muted);margin:0 0 34px}
    .field-name{display:block;font-size:14px;font-weight:800;margin:0 0 10px}
    mat-form-field{margin-bottom:23px}.field-icon{color:#8b9bb6;margin:0 9px 0 15px;font-size:22px}
    .submit{height:56px;width:100%;border-radius:13px;margin-top:6px;font-size:16px;font-weight:800;display:flex;align-items:center;justify-content:center;gap:12px}
    .submit .material-symbols-outlined{font-size:22px}
    .error-message{display:flex;align-items:center;gap:8px;margin-bottom:15px;color:var(--danger);font-size:14px}
    .sso-divider{display:flex;align-items:center;gap:14px;text-align:center;font-size:13px;color:var(--muted);margin:25px 0 18px}.sso-divider:before,.sso-divider:after{content:'';flex:1;height:1px;background:var(--border)}
    .sso-button{width:100%;height:48px;border-radius:12px;display:flex;align-items:center;gap:9px}.sso-button .material-symbols-outlined{font-size:20px}
    .sso-entry{background:var(--muted-panel);padding:16px;margin-top:13px;border-radius:14px;display:flex;flex-direction:column;gap:10px}.sso-entry input{height:44px;border:1px solid var(--border);border-radius:9px;background:var(--surface);color:var(--text);padding:0 12px;outline:none;font-size:15px}.sso-entry button{height:42px}
    .login-tip{margin-top:29px;display:flex;align-items:center;gap:10px;font-size:12px;color:var(--muted);line-height:1.6}.login-tip .material-symbols-outlined{font-size:22px}
    .login-bottom{display:flex;justify-content:space-between;color:var(--muted);font-size:11px;letter-spacing:.02em}
    @media(max-width:1050px){.login-screen{grid-template-columns:1fr}.hero-panel{display:none}.form-panel{min-height:100vh}.login-wrap{padding:40px 0}.login-bottom{margin-top:40px}}
    @media(max-width:490px){h2{font-size:35px}.form-panel{padding:18px 21px}}
  `]
})
export class LoginComponent {
  private fb=inject(FormBuilder);private auth=inject(AuthService);private router=inject(Router);
  readonly theme=inject(ThemeService);
  readonly form=this.fb.nonNullable.group({username:['',[Validators.required]],password:['',[Validators.required]]});
  readonly busy=signal(false);readonly error=signal('');readonly showPassword=signal(false);
  readonly pending=signal(new URLSearchParams(location.search).get('login')==='pending');
  readonly ssoShown=signal(false);readonly ssoCode=signal('');
  validSso(){return /^[a-z][a-z0-9_-]{1,48}$/.test(this.ssoCode().trim());}
  startSso(){if(this.validSso())location.assign(`/api/v1/auth/oidc/${encodeURIComponent(this.ssoCode().trim())}/start`);}
  submit(){
    if(this.form.invalid||this.busy())return;
    this.busy.set(true);this.error.set('');
    this.auth.signin(this.form.getRawValue().username,this.form.getRawValue().password).subscribe({
      next:()=>{this.busy.set(false);void this.router.navigateByUrl('/');},
      error:()=>{this.busy.set(false);this.error.set('Неверный логин или пароль, либо учётная запись отключена.');}
    });
  }
}
