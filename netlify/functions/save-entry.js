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

    // construir set de usados
    const used = new Set(entries.map(e => e.generatedNumber));
    const allNumbers = Array.from({length:50}, (_,i)=>i+1);
    const free = allNumbers.filter(n => !used.has(n));
    if(free.length === 0){
      return { statusCode:400, body:'No hay más números disponibles' };
    }
    const gen = free[Math.floor(Math.random() * free.length)];

    const newEntry = {
      id: Date.now() + Math.floor(Math.random()*1000),
      name,
      gifts,
      generatedNumber: gen,
      assignedRecipient: null,
      createdAt: new Date().toISOString()
    };
    entries.push(newEntry);

    const contentBase64 = Buffer.from(JSON.stringify(entries, null, 2)).toString('base64');
    await putFile(contentBase64, `Add entry ${name}`, sha);

    return { statusCode:200, body: JSON.stringify({ ok:true, generatedNumber: gen }) };
  } catch(err){
    console.error(err);
    return { statusCode:500, body: String(err.message) };
  }
};
