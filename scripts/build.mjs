import { access, cp, mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const output = new URL('../dist/',import.meta.url);
const root = new URL('../',import.meta.url);
const paths = ['.nojekyll','index.html','404.html','robots.txt','sitemap.xml','assets','demos','kk','AKMAVREN-GitHub-Pages.zip'];
const scripts= (await readdir(new URL('assets/qyr/',root))).filter(file=>file.endsWith('.js'));
for(const file of scripts) {
  const check=spawnSync(process.execPath,['--check',new URL('assets/qyr/'+file,root).pathname],{stdio:'inherit'});
  if(check.status!==0) process.exit(1);
}
await rm(output,{recursive:true,force:true});
await mkdir(output,{recursive:true});
for(const path of paths) {
  const source=new URL(path,root);
  await access(source);
  await cp(source,new URL(path,output),{recursive:true});
}
const publicBase=new URL('https://example.test/portfolioakm.github.io/');
const entries=await readdir(output,{recursive:true});
for(const path of entries.filter(file=>file.endsWith('.html'))) {
  const source=await readFile(new URL(path,output),'utf8');
  const page=new URL(path,publicBase);
  for(const match of source.matchAll(/\b(?:href|src)=(["'])(.*?)\1/g)) {
    const target=new URL(match[2],page);
    if(target.origin!==publicBase.origin) continue;
    if(!target.pathname.startsWith(publicBase.pathname)) throw new Error(path+': '+match[2]);
    let local=target.pathname.slice(publicBase.pathname.length);
    if(!local || local.endsWith('/')) local+='index.html';
    try { await access(new URL(local,output)); }
    catch { throw new Error(path+': '+match[2]); }
  }
}
console.log('Static GitHub Pages build and local document links verified in dist/');
