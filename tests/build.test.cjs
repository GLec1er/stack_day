const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');

test('a clean checkout builds a self-contained Pages artifact without hosting credentials or writes outside the project',()=>{
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'stackday-build-'));
  try{
    const repo=path.join(tmp,'work','repo');fs.mkdirSync(repo,{recursive:true});
    for(const name of fs.readdirSync(path.join(__dirname,'..')).filter(n=>/\.(?:js|mjs|css|html)$/.test(n)))fs.copyFileSync(path.join(__dirname,'..',name),path.join(repo,name));
    const output=path.join(tmp,'outputs');fs.mkdirSync(output);fs.writeFileSync(path.join(output,'my-focus.html'),'existing personal file');
    const result=spawnSync(process.execPath,[path.join(repo,'build.mjs')],{cwd:tmp,encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    const html=fs.readFileSync(path.join(repo,'dist','index.html'),'utf8');
    assert.match(html,/<title>Stackday/);
    assert.doesNotMatch(html,/\/\*__[A-Z_]+__\*\//);
    assert.doesNotMatch(html,/<script[^>]+src=|<link[^>]+rel=["']stylesheet/);
    assert.deepEqual(fs.readdirSync(path.join(repo,'dist')).sort(),['.nojekyll','index.html']);
    assert.equal(fs.readFileSync(path.join(output,'my-focus.html'),'utf8'),'existing personal file');
  }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
