import { SaxesParser } from 'saxes';

export type XmlChannel = {external_channel_id:string; display_name:string|null; icon_url:string|null};
export type XmlProgramme = { external_channel_id:string; starts_at:string; ends_at:string|null; language_code:'ru'|'en'|'und'; title:string|null; description:string|null; age_limit:number|null };

export function xmltvDate(raw:string|undefined):string|null {
  if (!raw) return null;
  const m=/^(\d{4})(\d\d)(\d\d)(\d\d)?(\d\d)?(\d\d)?(?:\s*([+-])(\d\d)(\d\d))?/.exec(raw.trim());
  if(!m) return null;
  const [,y,mo,d,h='00',mi='00',s='00',sign,oh,om]=m;
  const year=+y,month=+mo,day=+d,hour=+h,min=+mi,sec=+s;
  if(month<1||month>12||day<1||day>31||hour>23||min>59||sec>59)return null;
  const utc=Date.UTC(year,month-1,day,hour,min,sec);
  const verify=new Date(utc);
  if(verify.getUTCFullYear()!==year||verify.getUTCMonth()!==month-1||verify.getUTCDate()!==day)return null;
  const offset=oh===undefined?0:(+oh*60 + +om)*(sign==='-'?-1:1);
  if(oh!==undefined&&(Number(oh)>23||Number(om)>59))return null;
  return new Date(utc-offset*60000).toISOString();
}

function lang(raw:string|undefined):'ru'|'en'|'und' {
  if(/^ru(s)?(?:[-_].*)?$/i.test(raw||''))return 'ru';
  if(/^en(g)?(?:[-_].*)?$/i.test(raw||''))return 'en';
  return 'und';
}
function bestText(items: {value:string; lang:'ru'|'en'|'und'}[]):{value:string;lang:'ru'|'en'|'und'}|null {
  return items.find(x=>x.lang==='ru')??items.find(x=>x.lang==='en')??items[0]??null;
}

/** SAX, no DOM. Call write() with streaming chunks and take() to drain bounded results. */
export class XmltvParser {
  private readonly sax = new SaxesParser({xmlns:false});
  private channel: {id:string; names:{value:string;lang:'ru'|'en'|'und'}[]; icon:string|null}|null=null;
  private programme: {channel:string;start:string;stop:string|null;titles:{value:string;lang:'ru'|'en'|'und'}[];descs:{value:string;lang:'ru'|'en'|'und'}[];age:number|null}|null=null;
  private stack:string[]=[];
  private capture = '';
  private captureLang:'ru'|'en'|'und'='und';
  private channels:XmlChannel[]=[];
  private programmes:XmlProgramme[]=[];
  constructor(){
    this.sax.on('opentag', tag=>{
      const name=tag.name.toLowerCase();this.stack.push(name);
      const attr=(key:string)=>typeof tag.attributes[key]==='string'?String(tag.attributes[key]):undefined;
      if(name==='channel' && this.stack.length===2){this.channel={id:attr('id')??'',names:[],icon:null};}
      if(name==='programme' && this.stack.length===2){this.programme={channel:attr('channel')??'',start:attr('start')??'',stop:attr('stop')??null,titles:[],descs:[],age:null};}
      if(name==='icon'&&this.channel&&this.stack[this.stack.length-2]==='channel')this.channel.icon=attr('src')??null;
      if(['title','desc','display-name','value'].includes(name)){this.capture='';this.captureLang=lang(attr('lang'));}
    });
    const onText=(s:string)=>{const last=this.stack[this.stack.length-1];if(['title','desc','display-name','value'].includes(last))this.capture+=s;};
    this.sax.on('text',onText);this.sax.on('cdata',onText);
    this.sax.on('closetag',tag=>{
      const name=tag.name.toLowerCase(); const parent=this.stack[this.stack.length-2];
      const value=this.capture.trim();
      if(this.channel && parent==='channel' && name==='display-name' && value)this.channel.names.push({value,lang:this.captureLang});
      if(this.programme){
        if(parent==='programme' && name==='title' && value)this.programme.titles.push({value,lang:this.captureLang});
        if(parent==='programme' && name==='desc' && value)this.programme.descs.push({value,lang:this.captureLang});
        if(parent==='rating' && name==='value' && /\b(\d{1,2})\s*\+?/.test(value))this.programme.age=Number(RegExp.$1);
      }
      if(name==='channel'&&this.channel){
        if(this.channel.id){this.channels.push({external_channel_id:this.channel.id,display_name:bestText(this.channel.names)?.value??this.channel.id,icon_url:this.channel.icon});}
        this.channel=null;
      }
      if(name==='programme'&&this.programme){
        const p=this.programme;const start=xmltvDate(p.start),stop=xmltvDate(p.stop??undefined);
        if(p.channel&&start&&(!stop||stop>start)){
          const title=bestText(p.titles);const description=p.descs.find(d=>d.lang===title?.lang)??bestText(p.descs);
          this.programmes.push({external_channel_id:p.channel,starts_at:start,ends_at:stop,language_code:title?.lang??'und',title:title?.value??null,description:description?.value??null,age_limit:p.age!==null&&p.age<=21?p.age:null});
        }
        this.programme=null;
      }
      this.stack.pop();
      if(['title','desc','display-name','value'].includes(name))this.capture='';
    });
  }
  write(chunk:string){this.sax.write(chunk);}
  finish(){this.sax.close();}
  take(){const channels=this.channels,programmes=this.programmes;this.channels=[];this.programmes=[];return {channels,programmes};}
}
