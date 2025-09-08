// netlify/functions/get-public-entries.js
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

exports.handler = async function(){
  try{
    const file = await getFile();
    if(!file) return { statusCode:200, body: JSON.stringify([]) };
    const buff = Buffer.from(file.content, file.encoding);
    const entries = JSON.parse(buff.toString());
    // expose only safe fields
    const publicEntries = entries.map(e=>({
      id: e.id,
      name: e.name,
      gifts: e.gifts,
      generatedNumber: e.generatedNumber,
      createdAt: e.createdAt
    }));
    return { statusCode:200, body: JSON.stringify(publicEntries) };
  } catch(err){
    console.error(err);
    return { statusCode:500, body: String(err.message) };
  }
};
