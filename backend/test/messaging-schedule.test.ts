import test from 'node:test';
import assert from 'node:assert/strict';
import {nextDaily} from '../src/messaging/messaging.service';

test('next daily time in Europe/Moscow is timezone-aware',()=>{
 const next=nextDaily(0,10,'Europe/Moscow',new Date('2026-10-30T06:30:00.000Z'));
 assert.equal(next.toISOString(),'2026-10-30T07:00:00.000Z');
});

test('next day skips duplicated local wall-clock time on DST fallback',()=>{
 // Europe/Berlin 2026-10-25 repeats local 02:30 at 00:30Z and 01:30Z.
 const next=nextDaily(30,2,'Europe/Berlin',new Date('2026-10-25T00:30:00.000Z'),true);
 assert.equal(next.toISOString(),'2026-10-26T01:30:00.000Z');
});

test('spring DST gap schedules next available day',()=>{
 // Local 02:30 does not exist in Berlin on 2026-03-29.
 const next=nextDaily(30,2,'Europe/Berlin',new Date('2026-03-28T23:00:00.000Z'));
 assert.equal(next.toISOString(),'2026-03-30T00:30:00.000Z');
});
