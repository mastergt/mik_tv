import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { XmltvParser, xmltvDate } from '../src/epg/xmltv';

test('XMLTV time zone offsets are converted to UTC',()=>{
  assert.equal(xmltvDate('20261030120000 +0300'),'2026-10-30T09:00:00.000Z');
  assert.equal(xmltvDate('20261030120000 -0300'),'2026-10-30T15:00:00.000Z');
  assert.equal(xmltvDate('20260230090000 +0300'),null);
});
test('Streaming XMLTV produces channels, programmes, age and descriptions',()=>{
  const xml=`<?xml version="1.0" encoding="utf-8"?>
  <tv><channel id="first.ru"><display-name lang="ru">Первый канал</display-name><icon src="https://cdn.example/logo.png"/></channel>
  <programme channel="first.ru" start="20261030120000 +0300" stop="20261030130000 +0300">
  <title lang="ru">Новости &amp; события</title><desc lang="ru">Описание передачи</desc><rating><value>16+</value></rating></programme></tv>`;
  const parser=new XmltvParser();
  for(let i=0;i<xml.length;i+=23)parser.write(xml.substring(i,i+23));
  parser.finish();const result=parser.take();
  assert.equal(result.channels.length,1);
  assert.equal(result.channels[0].display_name,'Первый канал');
  assert.equal(result.programmes.length,1);
  assert.equal(result.programmes[0].title,'Новости & события');
  assert.equal(result.programmes[0].description,'Описание передачи');
  assert.equal(result.programmes[0].starts_at,'2026-10-30T09:00:00.000Z');
  assert.equal(result.programmes[0].age_limit,16);
});
