import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoom,joinRoom,updateFocus,setVoyage,resetRoomsForTest} from '../src/rooms.js';
test('players share room state, focus events affect hull, voyage can start',()=>{resetRoomsForTest();const first=createRoom('A','s1');const code=first.code;joinRoom(code,'B','s2');assert.equal(updateFocus(code,'s2',{status:'warning'}).players.length,2);const damaged=updateFocus(code,'s2',{status:'distracted'});assert.equal(damaged.hull,90);assert.equal(setVoyage(code,true).started,true);resetRoomsForTest();});
test('unknown room cannot be joined',()=>{resetRoomsForTest();assert.throws(()=>joinRoom('NOPE','A','s1'),/not found/);});
