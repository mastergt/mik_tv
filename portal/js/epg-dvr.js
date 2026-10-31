/* mik_tv: lightweight EPG timeline and DVR interval helpers. ES5 only. */
(function(root){
  'use strict';
  var U=root.PortalUtil, E={},HOUR=3600000;
  function ms(v){var d=U.date(v);return d?d.getTime():NaN;}
  E.archiveBounds=function(program,now){
    if(!program)return null;
    var start=ms(program.starts_at),end=ms(program.ends_at);
    if(!isFinite(start)||!isFinite(end)||end<=start)return null;
    // The backend rejects future DVR ends. Allow replay from the start of an on-air programme.
    end=Math.min(end,now-5000);
    if(end-start<15000)return null;
    // Client API limits a single DVR request to 12 hours.
    end=Math.min(end,start+12*HOUR);
    return {start:start,end:end};
  };
  E.seekCursor=function(session,step){
    if(!session)return null;
    var max=session.end-15000;
    if(max<session.start)return null;
    var next=Math.min(max,Math.max(session.start,session.cursor+step*1000));
    return next===session.cursor?null:next;
  };
  E.day=function(v){var d=U.date(v);return d && d.toLocaleDateString?d.toLocaleDateString('ru-RU'):'—';};
  E.time=function(v){return U.hm(v);};
  E.renderDetails=function(program,now){
    var title=U.el('epg-selected-title'),desc=U.el('epg-description'),status=U.el('epg-availability');
    if(!program){U.text(title,'Нет данных');U.text(desc,'Телепрограмма для этого канала пока не загружена');U.text(status,'');return;}
    U.text(title,U.hm(program.starts_at)+' – '+U.hm(program.ends_at)+'  '+(program.title||'Без названия'));
    U.text(desc,(program.description||'').replace(/\s+/g,' ').slice(0,200));
    var b=E.archiveBounds(program,now),start=ms(program.starts_at),end=ms(program.ends_at);
    var state=b?(end>now?'С начала эфира · запросить архив':'Прошедшая передача · запросить архив'):
      start>now?'Передача ещё не началась':'Архив этой передачи недоступен для запроса';
    U.text(status,state);
  };
  E.renderTimeline=function(programs,selected,now){
    var ticks=U.el('epg-ticks'),track=U.el('epg-timeline'),p=programs[selected],i,t,span,first,last,firstHour=NaN;
    U.clear(ticks);U.clear(track);
    if(!p)return;
    first=ms(p.starts_at);if(!isFinite(first))return;
    // Six hours around the selected programme; do not render thousands of EPG records.
    firstHour=Math.floor(first/HOUR)*HOUR-HOUR;
    last=firstHour+6*HOUR;
    for(i=0;i<=6;i++){
      t=U.create('span','epg-tick',U.hm(firstHour+i*HOUR));
      t.style.left=String((i/6)*100)+'%';ticks.appendChild(t);
    }
    var count=0,begin,end,left,right,bar,cls;
    for(i=Math.max(0,selected-50);i<Math.min(programs.length,selected+51);i++){
      if(count>=40)break;
      span=programs[i];begin=ms(span.starts_at);end=ms(span.ends_at);
      if(!isFinite(begin)||!isFinite(end)||end<=begin||begin>=last||end<=firstHour)continue;
      left=100*Math.max(0,begin-firstHour)/(last-firstHour);
      right=100*Math.min(last,end)/(last-firstHour);
      cls='epg-block'+(i===selected?' selected':'')+(end<=now?' past':begin<=now?' onair':'');
      bar=U.create('div',cls);bar.style.left=left+'%';bar.style.width=Math.max(.35,right-left)+'%';
      bar.setAttribute('data-epg',String(i));bar.title=span.title||'';
      // No innerHTML or animation; highlight the selected programme only.
      if(right-left>11)bar.appendChild(U.create('span','epg-block-label',span.title||''));
      track.appendChild(bar);count++;
    }
    if(now>=firstHour&&now<=last){
      t=U.create('div','epg-now-line');t.style.left=(100*(now-firstHour)/(last-firstHour))+'%';track.appendChild(t);
    }
  };
  E.renderDVR=function(session,paused){
    var visible=!!session;U.show('dvr-controls',visible);
    if(!visible)return;
    U.text(U.el('dvr-title'),session.title||'Архив');
    U.text(U.el('dvr-time'),'Начало фрагмента '+U.hm(session.cursor)+' · до '+U.hm(session.end));
    var percent=Math.max(0,Math.min(100,100*(session.cursor-session.start)/(session.end-session.start)));
    U.el('dvr-progress').style.width=String(percent)+'%';
    U.text(U.el('dvr-pause'),paused?'▶ Продолжить':'Ⅱ Пауза');
  };
  root.PortalEPG=E;
}(window));
