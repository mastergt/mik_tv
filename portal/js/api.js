(function (root) {
  'use strict';
  var cfg=root.IPTV_CONFIG, U=root.PortalUtil;
  function API() {this.token='';this.api=(cfg.API_BASE||'/api/v1').replace(/\/$/,'');}
  API.prototype.request=function(method,path,data,callback){
    var xhr=new XMLHttpRequest(), self=this, done=false;
    var url=this.api+path;
    var finish=function(err,val){ if(done)return;done=true;callback(err,val); };
    try{
      xhr.open(method,url,true);
      xhr.timeout=20000;
      xhr.setRequestHeader('Accept','application/json');
      if(data!==null)xhr.setRequestHeader('Content-Type','application/json');
      if(self.token)xhr.setRequestHeader('Authorization','Bearer '+self.token);
      xhr.onreadystatechange=function(){
        if(xhr.readyState!==4)return;
        var out=null;
        try{out=xhr.responseText?JSON.parse(xhr.responseText):{};}catch(e){return finish({status:xhr.status,message:'Некорректный JSON от сервера'});}
        if(xhr.status<200||xhr.status>=300)return finish({status:xhr.status,message:(out&&out.message) ? (typeof out.message==='string'?out.message:out.message.join('; ')) : ('HTTP '+xhr.status)});
        finish(null,out);
      };
      xhr.onerror=function(){finish({status:0,message:'Сервер недоступен'});};
      xhr.ontimeout=function(){finish({status:0,message:'Истекло время ожидания'});};
      xhr.send(data===null?null:JSON.stringify(data));
    }catch(e){finish({status:0,message:e.message||'Ошибка сети'});}
  };
  API.prototype.get=function(path,cb){this.request('GET',path,null,cb);};
  API.prototype.post=function(path,data,cb){this.request('POST',path,data,cb);};
  API.prototype.patch=function(path,data,cb){this.request('PATCH',path,data,cb);};
  API.prototype.del=function(path,cb){this.request('DELETE',path,null,cb);};
  root.PortalAPI=API;
}(window));
