import type {Aggregates, CheckRow, HarvestRow, Table} from './insightsClient';

export const MINISTRY_VIEWS = [
  {slug:'',label:'Overview'}, {slug:'food-security',label:'Food Security'}, {slug:'crop-monitoring',label:'Crop Monitoring'},
  {slug:'harvest',label:'Harvest & Marketplace'}, {slug:'extension',label:'Extension Services'}, {slug:'counties',label:'County Analytics'},
  {slug:'reports',label:'Reports'}, {slug:'data-quality',label:'Data Quality'},
] as const;
export const isMinistryPath=(p:string)=>p==='/ministry'||p.startsWith('/ministry/')||p==='/ministry-analytics'||p==='/food-security';
export const ANCHOR_VIEWS: Record<string,string>={'sec-overview':'','sec-live':'harvest','sec-production':'food-security','sec-fsi':'food-security','sec-weather':'food-security','sec-disease':'crop-monitoring','sec-campaigns':'extension','sec-privacy':'data-quality'};
export function ministryDestination(path:string,hash:string,search=''):string|null {
  const anchor=hash.replace(/^#/,'');
  if(path==='/ministry-analytics'||path==='/food-security'||(path==='/ministry'&&anchor in ANCHOR_VIEWS&&ANCHOR_VIEWS[anchor]!=='')){
    const view=ANCHOR_VIEWS[anchor]??(path==='/food-security'?'food-security':'');
    return '/ministry'+(view?'/'+view:'')+search+hash;
  }
  return null;
}
export type PublishedKind='harvest'|'checks';
export type PublishedDimension='county'|'crop';
export type PublishedSource='real'|'synthetic';
export interface PublishedRow {key:string;label:string;listings?:number;farmers?:number;totalKg?:number;averagePriceLrdPerKg?:number;checks?:number;devices?:number;green?:number;yellow?:number;red?:number;other?:boolean}
/** Explicit projection: no new server field or individual record can enter a chart/export. */
export function publishedRows(data:Aggregates,source:PublishedSource,kind:PublishedKind,dimension:PublishedDimension):{rows:PublishedRow[];insufficient:boolean;asOf:string;note:string} {
  const block=data[source];
  const table:Table<HarvestRow>|Table<CheckRow>=kind==='harvest'?block.harvest[dimension==='county'?'byCounty':'byCrop']:block.cropChecks[dimension==='county'?'byCounty':'byCrop'];
  if(table.insufficient)return {rows:[],insufficient:true,asOf:block.asOf,note:block.note};
  const project=(r:HarvestRow|CheckRow|NonNullable<typeof table.other>,other=false):PublishedRow=>kind==='harvest'?{
    key:other?'__other':(r as HarvestRow).key,label:r.label,listings:(r as HarvestRow).listings,farmers:(r as HarvestRow).farmers,totalKg:(r as HarvestRow).totalKg,averagePriceLrdPerKg:(r as HarvestRow).averagePriceLrdPerKg,...(other?{other:true}:{}),
  }:{key:other?'__other':(r as CheckRow).key,label:r.label,checks:(r as CheckRow).checks,devices:(r as CheckRow).devices,green:(r as CheckRow).green,yellow:(r as CheckRow).yellow,red:(r as CheckRow).red,...(other?{other:true}:{})};
  return {rows:[...table.rows.map(r=>project(r)),...(table.other?[project(table.other,true)]:[])],insufficient:false,asOf:block.asOf,note:block.note};
}
export function selectPublishedRows(rows:PublishedRow[],group:string,search:string):PublishedRow[]{
  const q=search.trim().toLocaleLowerCase();return rows.filter(r=>(!group||(!r.other&&r.key===group))&&(!q||r.label.toLocaleLowerCase().includes(q)));
}
export const HARVEST_COLUMNS=[['label','Published group'],['listings','Listings'],['farmers','Contributors in group'],['totalKg','Offered kg (rounded)'],['averagePriceLrdPerKg','Asking L$/kg (rounded)']] as const;
export const CHECK_COLUMNS=[['label','Published group'],['checks','Checks'],['devices','Contributors in group'],['green','Green'],['yellow','Yellow'],['red','Red']] as const;
/** Escape every cell, including user-entered search text in the scope metadata. */
function csvCell(v:unknown):string {let s=String(v??'');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
export function publishedCsv(rows:PublishedRow[],kind:PublishedKind,metadata:{source:string;dimension:string;asOf:string;scope:string;privacy:string}):string {
  const columns=kind==='harvest'?HARVEST_COLUMNS:CHECK_COLUMNS;
  const body=[['Dataset',metadata.source],['Dimension',metadata.dimension],['Published as of',metadata.asOf],['Selection',metadata.scope],['Privacy',metadata.privacy],['Notice','Published aggregates only; not official statistics. Missing/suppressed groups are not zero.'],[],columns.map(c=>c[1]),...rows.map(r=>columns.map(([key])=>r[key as keyof PublishedRow]??''))];
  return body.map(line=>line.map(csvCell).join(',')).join('\r\n');
}
