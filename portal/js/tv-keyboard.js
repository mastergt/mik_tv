/* mik_tv: remote-operated on-screen keyboard. ES5, no dependencies. */
(function(root){
  'use strict';
  var U=root.PortalUtil;
  function Keyboard(){
    this.active=false;this.target=null;this.language='ru';this.upper=false;
    this.row=0;this.col=0;this.rows=[];this.keys=[];
    this.onNext=null;this.onSubmit=null;this.onClose=null;
  }
  Keyboard.prototype.characters=function(){
    if(this.language==='ru')return [
      '\u0439\u0446\u0443\u043a\u0435\u043d\u0433\u0448\u0449\u0437\u0445\u044a'.split(''),
      '\u0444\u044b\u0432\u0430\u043f\u0440\u043e\u043b\u0434\u0436\u044d'.split(''),
      '\u044f\u0447\u0441\u043c\u0438\u0442\u044c\u0431\u044e.,'.split('')];
    return ['qwertyuiop'.split(''),'asdfghjkl'.split(''),'zxcvbnm.,-'.split('')];
  };
  Keyboard.prototype.layout=function(){
    var rows=this.characters(),i,j;
    for(i=0;i<rows.length;i++)for(j=0;j<rows[i].length;j++)
      if(this.upper)rows[i][j]=rows[i][j].toUpperCase();
    rows.push('1234567890'.split(''));
    rows.push([{id:'lang',text:this.language==='ru'?'EN':'RU'},
      {id:'shift',text:this.upper?'abc':'ABC'},
      {id:'space',text:'\u041f\u0440\u043e\u0431\u0435\u043b'},
      {id:'delete',text:'\u232b'},
      {id:'clear',text:'\u0421\u0442\u0435\u0440\u0435\u0442\u044c'},
      {id:'next',text:'\u0414\u0430\u043b\u0435\u0435'},
      {id:'enter',text:'OK'},
      {id:'close',text:'\u041d\u0430\u0437\u0430\u0434'}]);
    return rows;
  };
  Keyboard.prototype.open=function(field){
    if(!field || typeof field.value!=='string')return false;
    this.target=field;this.active=true;this.row=0;this.col=0;
    this.render();U.show('tv-keyboard',true);this.setAppState(true);this.status();
    return true;
  };
  Keyboard.prototype.setAppState=function(active){
    var app=U.el('app');if(!app)return;
    app.className=app.className.replace(/\s*tv-keyboard-on\b/g,'')+(active?' tv-keyboard-on':'');
  };
  Keyboard.prototype.close=function(){
    if(!this.active)return;
    this.active=false;U.show('tv-keyboard',false);this.setAppState(false);
    if(this.onClose)this.onClose();
  };
  Keyboard.prototype.status=function(){
    var field=this.target,value=field?field.value:'',label=field&&field.type==='password'?'\u041f\u0430\u0440\u043e\u043b\u044c':'\u041b\u043e\u0433\u0438\u043d';
    // Never mirror a password in plaintext outside its password input.
    if(field && field.type==='password')value=Array(Math.min(value.length,20)+1).join('\u2022');
    U.text(U.el('tv-keyboard-field'),label+': '+value);
  };
  Keyboard.prototype.render=function(){
    var wrap=U.el('tv-keyboard-rows');if(!wrap)return;
    var self=this,i,j,row,button,def,txt;
    this.rows=this.layout();this.keys=[];U.clear(wrap);
    for(i=0;i<this.rows.length;i++){
      row=U.create('div','tv-key-row');this.keys[i]=[];
      for(j=0;j<this.rows[i].length;j++){
        def=this.rows[i][j];txt=typeof def==='string'?def:def.text;
        button=U.create('button','tv-key'+(typeof def==='string'?'':' tv-key-action'),txt);
        button.type='button';button.setAttribute('data-row',String(i));button.setAttribute('data-col',String(j));
        row.appendChild(button);this.keys[i].push(button);
      }
      wrap.appendChild(row);
    }
    this.highlight();
    if(!this.bound){
      this.bound=true;
      U.on(wrap,'click',function(ev){
        var node=ev.target||ev.srcElement;
        while(node&&node!==wrap&&(!node.getAttribute||node.getAttribute('data-row')===null))node=node.parentNode;
        if(node&&node!==wrap){self.select(Number(node.getAttribute('data-row')),Number(node.getAttribute('data-col')));self.activate();}
      });
    }
  };
  Keyboard.prototype.highlight=function(){
    var i,j,k;for(i=0;i<this.keys.length;i++)for(j=0;j<this.keys[i].length;j++){
      k=this.keys[i][j];k.className=k.className.replace(/\s*tv-key-selected\b/g,'');
      if(i===this.row&&j===this.col)k.className+=' tv-key-selected';
    }
  };
  Keyboard.prototype.select=function(row,col){
    if(row<0||row>=this.rows.length)return;
    this.row=row;this.col=Math.max(0,Math.min(col,this.rows[row].length-1));this.highlight();
  };
  Keyboard.prototype.insert=function(value){
    var el=this.target;if(!el)return;
    var limit=Number(el.maxLength)||1024;
    if(limit<0||limit>1024)limit=1024;
    if(el.value.length+value.length>limit)return;
    el.value+=value;this.status();
  };
  Keyboard.prototype.erase=function(){if(this.target){this.target.value=this.target.value.slice(0,-1);this.status();}};
  Keyboard.prototype.activate=function(){
    var def=this.rows[this.row][this.col],id=typeof def==='string'?'char':def.id;
    if(id==='char')this.insert(def);
    else if(id==='space')this.insert(' ');
    else if(id==='delete')this.erase();
    else if(id==='clear'){if(this.target)this.target.value='';this.status();}
    else if(id==='shift'){this.upper=!this.upper;this.render();}
    else if(id==='lang'){this.language=this.language==='ru'?'en':'ru';this.render();}
    else if(id==='next'){if(this.onNext)this.onNext();}
    else if(id==='enter'){this.close();if(this.onSubmit)this.onSubmit();}
    else if(id==='close')this.close();
  };
  Keyboard.prototype.keyDown=function(code){
    if(!this.active)return false;
    if(code===27||code===461||code===10009){this.close();return true;}
    if(code===8){this.erase();return true;}
    if(code===37){this.select(this.row,(this.col+this.rows[this.row].length-1)%this.rows[this.row].length);return true;}
    if(code===39){this.select(this.row,(this.col+1)%this.rows[this.row].length);return true;}
    if(code===38){this.select((this.row+this.rows.length-1)%this.rows.length,this.col);return true;}
    if(code===40){this.select((this.row+1)%this.rows.length,this.col);return true;}
    if(code===13){this.activate();return true;}
    if(code>=48&&code<=57){this.insert(String(code-48));return true;}
    if(code>=96&&code<=105){this.insert(String(code-96));return true;}
    // Let physical letter keys edit the focused input normally.
    return false;
  };
  root.PortalKeyboard=Keyboard;
}(window));
