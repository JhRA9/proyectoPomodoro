import {describe,it,expect} from 'vitest';
import {planningFixture} from './helpers/planningFixture.js';
import {exportProjectReview,reviewSelection,zipStored,EXPORT_LIMIT} from '../src/planning/reviewExport.js';
import {sha256} from '../src/utils/integrity.js';

// Independent reader of the documented ZIP stored-entry headers.
async function unzip(blob){const bytes=new Uint8Array(await blob.arrayBuffer()),view=new DataView(bytes.buffer),files=new Map();let offset=0;
  while(view.getUint32(offset,true)===0x04034b50){expect(view.getUint16(offset+8,true)).toBe(0);const length=view.getUint32(offset+18,true),nameLength=view.getUint16(offset+26,true),extra=view.getUint16(offset+28,true),start=offset+30+nameLength+extra;files.set(new TextDecoder().decode(bytes.slice(offset+30,offset+30+nameLength)),new Blob([bytes.slice(start,start+length)]));offset=start+length;}
  expect(view.getUint32(offset,true)).toBe(0x02014b50);expect(view.getUint32(bytes.length-22,true)).toBe(0x06054b50);return files;}
const options={includeAcademic:true,includeCode:true,includeImages:true,includeOriginals:true};
describe('review packages and original integrity',()=>{
  it('round trips unicode, hashes every content file and includes original bytes',async()=>{
    const f=planningFixture();f.add('items',f.item());const bytes=new Blob(['Documento sintético sin compresión ñ']);const key='a'.repeat(64);const file={name:'prueba.docx',taskId:'synthetic-task',key,path:'local/synthetic-task/'+key,sha256:await sha256(bytes),sizeBytes:bytes.size,contentType:'application/octet-stream',version:'v1'};
    f.state.exercises.push({id:'submission',projectId:'synthetic-cube',itemIds:['piece'],submissionVersions:[{version:1,at:f.at,payload:{files:[file]}}]});
    const store={list:async()=>[],downloadOriginal:async()=>bytes};const result=await exportProjectReview(f.state,'synthetic-cube',options,store);const files=await unzip(result.blob);
    expect(await files.get('originals/synthetic-task/'+key).text()).toBe(await bytes.text());
    const manifest=JSON.parse(await files.get('manifest.json').text());for(const entry of manifest.files){expect(await sha256(files.get(entry.name))).toBe(entry.sha256);expect(files.get(entry.name).size).toBe(entry.bytes);}
    expect(manifest.completeWithinSelection).toBe(true);
  });
  it('declares missing originals and privacy exclusions without claiming completeness',async()=>{
    const f=planningFixture();f.state.projects[0].description='sb_secret_'+'x'.repeat(30);f.state.exercises.push({id:'private',projectId:'synthetic-cube',code:'private code'});
    const result=await exportProjectReview(f.state,'synthetic-cube',{includeOriginals:true});const files=await unzip(result.blob);const json=await files.get('project.json').text();
    expect(json).not.toContain('sb_secret_');expect(json).not.toContain('private code');expect(result.manifest.completeWithinSelection).toBe(false);expect(result.manifest.includesAllProjectData).toBe(false);expect(result.manifest.omissions.length).toBeGreaterThan(0);
  });
  it('rejects oversized originals before downloading and cancels without creating a partial success',async()=>{
    const f=planningFixture();let downloads=0;const store={path:(id,key)=>id+'/'+key,list:async()=>[{key:'x',sizeBytes:EXPORT_LIMIT+1}],download:async()=>{downloads++;return new Blob();}};
    await expect(exportProjectReview(f.state,'synthetic-cube',options,store)).rejects.toThrow(/100 MiB/);expect(downloads).toBe(0);
    const abort=new AbortController();abort.abort();await expect(exportProjectReview(f.state,'synthetic-cube',{},null,abort.signal)).rejects.toThrow();
    await expect(zipStored([{name:'../outside',blob:new Blob(['bad'])}])).rejects.toThrow(/inseguro/);
  });
  it('includes dependencies and ancestors as context without importing another project',()=>{
    const f=planningFixture();f.add('items',f.item('root',{kind:'objective'}));f.add('items',f.item('a',{parentId:'root'}));f.add('items',f.item('b'));f.add('dependencies',{id:'dep',from:'b',to:'a',type:'blocking',critical:true,reason:'Prerequisito',sourceId:null,author:'Fixture'});
    const result=reviewSelection(f.state,'synthetic-cube',{itemId:'a'});expect(result.raw.contextIds.sort()).toEqual(['b','root']);expect(result.raw.content.items).toHaveLength(3);expect(result.raw.archive).toBeNull();
  });
});
