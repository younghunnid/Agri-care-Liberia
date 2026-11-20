import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import type {Aggregates} from '../src/lib/insightsClient.ts';
import {ANCHOR_VIEWS,MINISTRY_VIEWS,isMinistryPath,ministryDestination,publishedRows,selectPublishedRows,publishedCsv} from '../src/lib/ministryWorkspace.ts';
import {MetricCard,PanelState,AccessibleBarChart,PublishedDataTable} from '../src/components/workspace/DashboardBits.tsx';
import {ExpectedActualChart} from '../src/components/ministry/ExpectedActualChart.tsx';
const html=(node:React.ReactNode)=>renderToStaticMarkup(node);
const fixture=():Aggregates=>{
 const harvest={rows:[{key:'Bong',label:'Bong',listings:3,farmers:3,totalKg:450,averagePriceLrdPerKg:65,sellerPhone:'PRIVATE',reference:'PRIVATE'}],other:{label:'Other (small groups combined)',listings:3,farmers:3,totalKg:150,averagePriceLrdPerKg:25},insufficient:false};
 const checks={rows:[{key:'rice',label:'Rice',checks:3,devices:3,green:0,yellow:1,red:2}],other:null,insufficient:false};
 const block={note:'App-entered, not official',asOf:'2026-11-20T12:00:00Z',harvest:{byCounty:harvest,byCrop:{...harvest,rows:[{key:'rice',label:'Rice',listings:4,farmers:3,totalKg:500,averagePriceLrdPerKg:70}]}},cropChecks:{byCrop:checks,byCounty:checks}};
 return {generatedAt:block.asOf,label:'Demo',privacy:{minGroup:3,note:'Existing suppression, rounding and publication rules'},containsSyntheticRecords:true,real:block,synthetic:{...block,note:'Invented',harvest:{...block.harvest,byCounty:{...harvest,rows:[{key:'Lofa',label:'Lofa',listings:30,farmers:6,totalKg:1500,averagePriceLrdPerKg:80}]}}},refresh:{minChange:3}};
};
test('eight canonical destinations and all legacy section anchors retain search/hash without redirect loops',()=>{
 assert.equal(MINISTRY_VIEWS.length,8);assert.equal(ministryDestination('/food-security','','?q=Rice'),'/ministry/food-security?q=Rice');assert.equal(ministryDestination('/ministry-analytics','','?source=synthetic'),'/ministry?source=synthetic');
 for(const [anchor,slug]of Object.entries(ANCHOR_VIEWS)){const result=ministryDestination('/ministry-analytics','#'+anchor,'?sampleCounty=Bong');assert.equal(result,'/ministry'+(slug?'/'+slug:'')+'?sampleCounty=Bong#'+anchor);assert.equal(ministryDestination('/ministry'+(slug?'/'+slug:''),'#'+anchor,'?sampleCounty=Bong'),null);}
 assert.equal(ministryDestination('/expert','#sec-disease'),null);for(const p of ['/ministry','/ministry/reports','/ministry-analytics','/food-security'])assert.equal(isMinistryPath(p),true);for(const p of ['/farmer','/admin','/ussd-demo'])assert.equal(isMinistryPath(p),false);
});
test('projection preserves source separation, precision, Other and excludes all unlisted private fields',()=>{
 const d=fixture();const before=JSON.stringify(d);const app=publishedRows(d,'real','harvest','county');const seeded=publishedRows(d,'synthetic','harvest','county');assert.equal(app.rows[0].totalKg,450);assert.equal(seeded.rows[0].totalKg,1500);assert.equal(app.rows.at(-1)?.other,true);assert.ok(!JSON.stringify(app).includes('PRIVATE'));assert.deepEqual(Object.keys(app.rows[0]).sort(),['averagePriceLrdPerKg','farmers','key','label','listings','totalKg']);assert.equal(JSON.stringify(d),before);
});
test('selectors narrow only already-published marginals; Other is never attributed to a selected county',()=>{
 const d=fixture();const rows=publishedRows(d,'real','harvest','county').rows;assert.equal(selectPublishedRows(rows,'Bong','').length,1);assert.equal(selectPublishedRows(rows,'rice','').length,0);assert.equal(selectPublishedRows(rows,'','bOnG')[0].key,'Bong');assert.equal(selectPublishedRows(rows,'','other')[0].other,true);assert.equal(selectPublishedRows(rows,'Bong','Other').length,0);assert.equal(publishedRows(d,'real','harvest','crop').rows[0].key,'rice');
});
test('suppressed data fails closed even if a malformed response contains underlying rows',()=>{
 const d=fixture();d.real.harvest.byCounty.insufficient=true;const r=publishedRows(d,'real','harvest','county');assert.deepEqual(r.rows,[]);assert.equal(r.insufficient,true);
});
test('crop check bands remain the exact published values and do not become diagnoses or totals',()=>{
 const r=publishedRows(fixture(),'real','checks','crop');assert.deepEqual(r.rows,[{key:'rice',label:'Rice',checks:3,devices:3,green:0,yellow:1,red:2}]);
});
test('CSV exports only allowed displayed metrics and includes source/scope/privacy; spreadsheet formulas escaped',()=>{
 const rows=publishedRows(fixture(),'real','harvest','county').rows;const csv=publishedCsv(rows,'harvest',{source:'App-entered',dimension:'county',asOf:'2026-11-20',scope:'=HYPERLINK("bad")',privacy:'3 contributors'});assert.ok(!csv.includes('PRIVATE'));assert.match(csv,/App-entered/);assert.match(csv,/3 contributors/);assert.match(csv,/'=HYPERLINK/);assert.match(csv,/Other \(small groups combined\)/);assert.ok(!csv.includes('reference'));
 const filtered=publishedCsv(selectPublishedRows(rows,'Bong',''),'harvest',{source:'App',dimension:'county',asOf:'now',scope:'Bong',privacy:'3'});assert.ok(!filtered.includes('Other (small groups combined)'));
});
test('metrics distinguish zero, unavailable and loading; suppressed state is not a fake zero',()=>{
 assert.match(html(<MetricCard label="Listings" value={0} note="Published" source="App"/>),/>0</);assert.match(html(<MetricCard label="Listings" value={null} note="No data" source="App"/>),/Unavailable/);assert.match(html(<MetricCard label="Listings" value={null} loading note="Waiting" source="App"/>),/Loading/);assert.match(html(<PanelState kind="suppressed" title="Not published">At least 3</PanelState>),/data-state="suppressed"/);
});
test('charts render zero as zero and use unique captions; values also remain available as text',()=>{
 const bars=[{id:'zero',label:'Zero',expected:0,actual:0,pct:0}];const h=html(<><ExpectedActualChart bars={bars} max={100} title="One"/><ExpectedActualChart bars={bars} max={100} title="Two"/></>);assert.match(h,/width:0%/);assert.ok(!h.includes('width:1%'));const ids=[...h.matchAll(/<figcaption id="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,2);const chart=html(<AccessibleBarChart title="Rounded kg" rows={[{label:'Bong',value:0}]} unit="kg"/>);assert.match(chart,/0 kg/);assert.match(chart,/width:0%/);
});
test('table has semantic caption, column/row headings, keyboard sort controls and useful empty state',()=>{
 const h=html(<PublishedDataTable caption="Published harvest" rows={[{label:'Bong',n:3}]} columns={[{key:'label',label:'County',value:r=>r.label},{key:'n',label:'Listings',value:r=>r.n,numeric:true}]}/>);assert.match(h,/<caption/);assert.match(h,/scope="row"/);assert.match(h,/aria-sort="none"/);assert.match(h,/tabindex="0"/);assert.match(html(<PublishedDataTable caption="None" rows={[]} columns={[]}/>),/No published rows match/);
});
