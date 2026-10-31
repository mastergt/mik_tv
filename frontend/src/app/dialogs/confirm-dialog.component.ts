import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
@Component({standalone:true,imports:[MatDialogModule,MatButtonModule],template:`
  <div style="padding:7px 9px;width:min(420px,85vw)">
    <div style="background:var(--danger-bg);color:var(--danger);width:52px;height:52px;border-radius:16px;display:grid;place-items:center;margin:0 0 16px"><span class="material-symbols-outlined" style="font-size:27px">delete_forever</span></div>
    <h2 mat-dialog-title style="font-size:23px;font-weight:800;padding:0;margin:0 0 7px">{{data.title}}</h2>
    <mat-dialog-content style="padding:0;font-size:15px;color:var(--muted)">{{data.text}}</mat-dialog-content>
    <mat-dialog-actions align="end" style="padding:24px 0 0;gap:9px">
      <button mat-stroked-button (click)="ref.close(false)">Отмена</button>
      <button mat-flat-button (click)="ref.close(true)">{{data.action||'Удалить'}}</button>
    </mat-dialog-actions>
  </div>
`})
export class ConfirmDialog {
  readonly data=inject<{title:string;text:string;action?:string}>(MAT_DIALOG_DATA);
  readonly ref=inject(MatDialogRef<ConfirmDialog>);
}
