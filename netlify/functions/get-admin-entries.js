// netlify/functions/get-admin-entries.js
const fetch = require('node-fetch');
const OWNER = process.env.GITHUB_OWNER;
const REPO = process.env.GITHUB_REPO;
const TOKEN = process.env.GITHUB_TOKEN;
const PATH = process.env.DATA_PATH || 'data/entries.json';
const MY_BRANCH = process.env.MY_BRANCH || 'master';
const ADMIN_PWD = process.env.ADMIN_PASSWORD;
const BASE = 'https://api.github.com';

async function getFile(){
  const url = `${BASE}/repos/${OWNER}/${REPO}/contents/${PATH}?ref=${MY_BRANCH}`;
  const r = await fetch(url, { headers:{ Authorization:`token ${TOKEN}`, Accept:'application/vnd.github.v3+json' }});
  if(r.status===404) return null;
  if(!r.ok) throw new Error('Error leyendo archivo: '+r.status);
  return r.json();
}
async function putFile(contentBase64, message, sha){
  const url = `${BASE}/repos/${OWNER}/${REPO}/contents/${PATH}`;
  const body = { message, content: contentBase64, branch: MY_BRANCH };
  if(sha) body.sha = sha;
  const r = await fetch(url, {
    method:'PUT',
    headers:{ Authorization:`token ${TOKEN}`, 'Content-Type':'application/json' },
    body: JSON.stringify(body)
  });
  if(!r.ok) {
    const txt = await r.text();
    throw new Error('Error guardando archivo: '+r.status+' '+txt);
  }
  return r.json();
}

function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }

function assignRecipients(entries){
  const n = entries.length;
  if(n===0) return entries;
  const numbers = entries.map(e=>e.generatedNumber);
  let perm = numbers.slice();
  for(let attempt=0; attempt<50; attempt++){
    shuffle(perm);
    let ok=true;
    for(let i=0;i<n;i++){
      if(perm[i]===numbers[i]){ ok=false; break; }
    }
    if(ok) break;
  }
  let allSelf = true;
  for(let i=0;i<n;i++) if(perm[i]!==numbers[i]) allSelf=false;
  if(allSelf && n>1){
    perm = numbers.slice(1).concat(numbers.slice(0,1));
  }
  return entries.map((e, idx)=> ({ ...e, assignedRecipient: perm[idx] }) );
}

exports.handler = async function(event){
  const pwd = event.headers['x-admin-password'] || event.headers['X-Admin-Password'];
  if(!pwd || pwd !== ADMIN_PWD) return { statusCode:401, body: 'Unauthorized' };

  try{
    const file = await getFile();
    let entries = [];
    let sha = null;
    if(file){
      const buff = Buffer.from(file.content, file.encoding);
      entries = JSON.parse(buff.toString());
      sha = file.sha;
    }

    if(event.httpMethod === 'GET'){
      return { statusCode:200, body: JSON.stringify(entries) };
    }

    if(event.httpMethod === 'POST'){
      const qs = event.queryStringParameters || {};
      const action = qs.action || '';

      if(action === 'regen'){
        entries = assignRecipients(entries);
        const contentBase64 = Buffer.from(JSON.stringify(entries, null, 2)).toString('base64');
        await putFile(contentBase64, 'Regenerate secret assignments', sha);
        return { statusCode:200, body: JSON.stringify({ ok:true }) };
      }

      if(action === 'delete'){
        const id = qs.id;
        entries = entries.filter(e => e.id !== id);
        const contentBase64 = Buffer.from(JSON.stringify(entries, null, 2)).toString('base64');
        await putFile(contentBase64, `Delete entry ${id}`, sha);
        return { statusCode:200, body: JSON.stringify({ ok:true }) };
      }

      if(action === 'edit'){
        const body = JSON.parse(event.body || "{}");
        entries = entries.map(e => e.id === body.id ? { ...e, name: body.name, gifts: body.gifts } : e);
        const contentBase64 = Buffer.from(JSON.stringify(entries, null, 2)).toString('base64');
        await putFile(contentBase64, `Edit entry ${body.id}`, sha);
        return { statusCode:200, body: JSON.stringify({ ok:true }) };
      }

      return { statusCode:400, body:'unknown action' };
    }

    return { statusCode:405, body: 'Method not allowed' };
  } catch(err){
    console.error(err);
    return { statusCode:500, body: String(err.message) };
  }
};
