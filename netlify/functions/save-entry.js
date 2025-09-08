// netlify/functions/save-entry.js
const fetch = require('node-fetch');

const OWNER = process.env.GITHUB_OWNER;
const REPO = process.env.GITHUB_REPO;
const TOKEN = process.env.GITHUB_TOKEN;
const PATH = process.env.DATA_PATH || 'data/entries.json';
const MY_BRANCH = process.env.MY_BRANCH || 'master';
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
  const body = { message, content: contentBase64, MY_BRANCH: MY_BRANCH };
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

exports.handler = async function(event){
  if(event.httpMethod !== 'POST') return { statusCode: 405, body: 'Only POST' };
  let payload;
  try { payload = JSON.parse(event.body); } catch(e){ return { statusCode:400, body:'Bad JSON' }; }
  const { name, gifts } = payload;
  if(!name || !Array.isArray(gifts) || gifts.length===0) return { statusCode:400, body:'Faltan campos' };

  try {
    const file = await getFile();
    let entries = [];
    let sha = null;
    if(file){
      const buff = Buffer.from(file.content, file.encoding);
      entries = JSON.parse(buff.toString());
      sha = file.sha;
    }

    // build set of used generatedNumbers
    const used = new Set(entries.map(e=>e.generatedNumber));
    const maxParticipants = Math.max(entries.length + 1, 1);
    // try generate a unique number between 1 and entries.length+1 (keeps compact)
    let gen;
    for(let i=0;i<50;i++){
      const candidate = Math.floor(Math.random() * (entries.length + 1)) + 1;
      if(!used.has(candidate)){ gen = candidate; break; }
    }
    if(!gen){
      // fallback: find first free number
      for(let i=1;;i++){ if(!used.has(i)){ gen = i; break; } }
    }

    const newEntry = {
      id: Date.now() + Math.floor(Math.random()*1000),
      name,
      gifts,
      generatedNumber: gen,
      assignedRecipient: null, // secret mapping - only set via admin/regenerate
      createdAt: new Date().toISOString()
    };
    entries.push(newEntry);

    const contentBase64 = Buffer.from(JSON.stringify(entries, null, 2)).toString('base64');
    await putFile(contentBase64, `Add entry ${name}`, sha);

    return { statusCode:200, body: JSON.stringify({ ok:true }) };
  } catch(err){
    console.error(err);
    return { statusCode:500, body: String(err.message) };
  }
};
