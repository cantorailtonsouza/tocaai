import {
  auth, db, onAuthStateChanged, signInWithEmailAndPassword, signOut,
  ref, get, set, update, push, remove, onValue
} from "../../firebase/client.js";

const $ = s=>document.querySelector(s);
const YOUTUBE_SEARCH_API = "https://tocaai-spotify.cantorailtonsouza.workers.dev/search";
const state = { settings:{}, playlists:{}, requests:{}, selectedPlaylistId:null, requestHours:1, youtubeResults:[] };
function esc(v=""){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}

$("#loginForm").onsubmit = async e=>{
  e.preventDefault();
  $("#loginButton").disabled=true;$("#loginButton").textContent="Entrando...";$("#loginError").textContent="";
  try{await signInWithEmailAndPassword(auth,$("#loginEmail").value.trim(),$("#loginPassword").value);}
  catch(err){$("#loginError").textContent = err.code==="auth/invalid-credential"?"E-mail ou senha incorretos.":err.message;}
  finally{$("#loginButton").disabled=false;$("#loginButton").textContent="Entrar";}
};
$("#logoutBtn").onclick=()=>signOut(auth);
$("#openPublic").onclick=()=>window.open("../","_blank");

onAuthStateChanged(auth, user=>{
  $("#loginView").hidden=!!user;$("#panelView").hidden=!user;
  if(user) startPanel();
});

function startPanel(){
  onValue(ref(db,"settings"),s=>{state.settings=s.val()||{};fillSettings();});
  onValue(ref(db,"playlists"),s=>{state.playlists=s.val()||{};renderPlaylists();renderSongs();});
  onValue(ref(db,"requests"),s=>{state.requests=s.val()||{};renderRequests();});
}

document.querySelectorAll(".bottom-nav button").forEach(b=>b.onclick=()=>{
  document.querySelectorAll("main>section").forEach(s=>s.hidden=true);
  $("#"+b.dataset.tab).hidden=false;
  document.querySelectorAll(".bottom-nav button").forEach(x=>x.classList.remove("active"));
  b.classList.add("active");
});

function renderPlaylists(){
  const term=($("#adminPlaylistSearch").value||"").toLowerCase();
  const entries=Object.entries(state.playlists).filter(([,p])=>(p?.name||"").toLowerCase().includes(term));
  $("#playlistCount").textContent=`${entries.length} playlists`;
  $("#adminPlaylists").innerHTML=entries.map(([id,p])=>{
    const count=Object.keys(p.songs||{}).length;
    const pct=Math.min(100,count);
    return `<article class="playlist" data-open="${id}">
      <div class="cover">${p.coverUrl?`<img src="${esc(p.coverUrl)}" alt="">`:(p.icon||"🎵")}</div>
      <div class="meta"><h3>${esc(p.name)}</h3><span class="muted">${count}/100 músicas</span><div class="progress"><span style="width:${pct}%"></span></div></div>
      <button class="toggle ${p.active?"on":""}" data-toggle="${id}"></button>
      <button class="btn btn-ghost" data-edit="${id}">Editar</button>
      <button class="btn btn-danger" data-delete="${id}">🗑</button>
    </article>`;
  }).join("") || `<div class="card"><h3>Nenhuma playlist</h3></div>`;
  document.querySelectorAll("[data-open]").forEach(el=>el.onclick=e=>{
    if(e.target.closest("[data-toggle],[data-edit],[data-delete]")) return;
    openSongs(el.dataset.open);
  });
  document.querySelectorAll("[data-toggle]").forEach(b=>b.onclick=()=>set(ref(db,`playlists/${b.dataset.toggle}/active`),!b.classList.contains("on")));
  document.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>openPlaylistForm(b.dataset.edit));
  document.querySelectorAll("[data-delete]").forEach(b=>b.onclick=async()=>{if(confirm("Excluir esta playlist?"))await remove(ref(db,`playlists/${b.dataset.delete}`));});
}
$("#adminPlaylistSearch").oninput=renderPlaylists;
$("#newPlaylistBtn").onclick=()=>openPlaylistForm();
function openPlaylistForm(id=""){
  const p=id?state.playlists[id]:{};
  $("#playlistModalTitle").textContent=id?"Editar playlist":"Nova playlist";
  $("#playlistId").value=id;$("#playlistName").value=p.name||"";$("#playlistIcon").value=p.icon||"🎵";$("#playlistCoverUrl").value=p.coverUrl||"";$("#playlistActive").checked=id?p.active!==false:true;
  $("#playlistModal").classList.add("open");
}
$("#closePlaylistModal").onclick=()=>$("#playlistModal").classList.remove("open");
$("#playlistForm").onsubmit=async e=>{
  e.preventDefault();
  const id=$("#playlistId").value||push(ref(db,"playlists")).key;
  const current=state.playlists[id]||{};
  await set(ref(db,`playlists/${id}`),{...current,name:$("#playlistName").value.trim(),icon:$("#playlistIcon").value.trim()||"🎵",coverUrl:$("#playlistCoverUrl").value.trim(),active:$("#playlistActive").checked,updatedAt:Date.now(),createdAt:current.createdAt||Date.now()});
  $("#playlistModal").classList.remove("open");
};

function openSongs(id){state.selectedPlaylistId=id;$("#songsModalTitle").textContent=state.playlists[id]?.name||"";renderSongs();$("#songsModal").classList.add("open");}
$("#closeSongsModal").onclick=()=>$("#songsModal").classList.remove("open");
function renderSongs(){
  if(!state.selectedPlaylistId)return;
  const p=state.playlists[state.selectedPlaylistId]||{};const songs=p.songs||{};const entries=Object.entries(songs);
  $("#songsCount").textContent=`${entries.length}/100 músicas`;
  $("#newSongBtn").disabled=entries.length>=100;
  $("#adminSongs").innerHTML=entries.map(([id,s])=>`<article class="song"><div class="song-main">${s.thumbnail?`<img class="song-thumb" src="${esc(s.thumbnail)}" alt="">`:''}<div><h4>${esc(s.title)}</h4><p class="muted">${esc(s.artist)}</p>${s.favorite?'<span class="tag">★ Favorita</span>':''}</div></div><button class="btn btn-danger" data-remove-song="${id}">Remover</button></article>`).join("")||`<div class="card"><h3>Nenhuma música nesta playlist</h3></div>`;
  document.querySelectorAll("[data-remove-song]").forEach(b=>b.onclick=()=>remove(ref(db,`playlists/${state.selectedPlaylistId}/songs/${b.dataset.removeSong}`)));
}
$("#newSongBtn").onclick=()=>{
  const count=Object.keys(state.playlists[state.selectedPlaylistId]?.songs||{}).length;
  if(count>=100)return alert("Limite de 100 músicas atingido.");
  $("#songForm").reset();
  $("#youtubeSearchForm").reset();
  $("#youtubeResults").innerHTML="";
  $("#youtubeSearchStatus").textContent="Pesquise pelo nome da música ou do artista.";
  state.youtubeResults=[];
  $("#songModal").classList.add("open");
  setTimeout(()=>$("#youtubeSearchInput").focus(),80);
};
$("#closeSongModal").onclick=()=>$("#songModal").classList.remove("open");

$("#youtubeSearchForm").onsubmit=async e=>{
  e.preventDefault();
  const term=$("#youtubeSearchInput").value.trim();
  if(term.length<2)return;
  const button=$("#youtubeSearchBtn");
  button.disabled=true;button.textContent="Pesquisando...";
  $("#youtubeSearchStatus").textContent="Buscando resultados...";
  $("#youtubeResults").innerHTML="";
  try{
    const response=await fetch(`${YOUTUBE_SEARCH_API}?q=${encodeURIComponent(term)}`);
    const data=await response.json();
    if(!response.ok||!data.success)throw new Error(data.details||data.error||"Falha na pesquisa.");
    state.youtubeResults=Array.isArray(data.tracks)?data.tracks:[];
    renderYoutubeResults();
    $("#youtubeSearchStatus").textContent=state.youtubeResults.length?`${state.youtubeResults.length} resultados encontrados.`:"Nenhum resultado encontrado.";
  }catch(err){
    console.error(err);
    $("#youtubeSearchStatus").textContent=`Erro: ${err.message}`;
    $("#youtubeResults").innerHTML='<div class="card"><strong>Não foi possível pesquisar agora.</strong><p class="muted">Tente novamente ou use o cadastro manual.</p></div>';
  }finally{button.disabled=false;button.textContent="Pesquisar";}
};

function renderYoutubeResults(){
  $("#youtubeResults").innerHTML=state.youtubeResults.map((track,index)=>`<article class="search-result"><img src="${esc(track.thumbnail||'')}" alt=""><div><h4>${esc(track.title||'Sem título')}</h4><p class="muted">${esc(track.artist||track.channelTitle||'Artista não identificado')}</p></div><button class="btn btn-primary" data-add-youtube="${index}">+ Adicionar</button></article>`).join("");
  document.querySelectorAll("[data-add-youtube]").forEach(button=>button.onclick=()=>addYoutubeSong(Number(button.dataset.addYoutube),button));
}

async function addYoutubeSong(index,button){
  const songs=state.playlists[state.selectedPlaylistId]?.songs||{};
  if(Object.keys(songs).length>=100)return alert("Limite de 100 músicas atingido.");
  const track=state.youtubeResults[index];
  if(!track)return;
  const duplicate=Object.values(songs).some(s=>s.sourceId&&s.sourceId===track.sourceId);
  if(duplicate)return alert("Essa música já está na playlist.");
  button.disabled=true;button.textContent="Adicionando...";
  try{
    const id=push(ref(db,`playlists/${state.selectedPlaylistId}/songs`)).key;
    await set(ref(db,`playlists/${state.selectedPlaylistId}/songs/${id}`),{
      title:track.title||track.originalTitle||"Música",
      artist:track.artist||track.channelTitle||"Artista não identificado",
      thumbnail:track.thumbnail||"",
      source:track.source||"youtube",
      sourceId:track.sourceId||"",
      sourceUrl:track.youtubeUrl||"",
      favorite:false,
      active:true,
      createdAt:Date.now()
    });
    button.textContent="Adicionada ✓";
  }catch(err){console.error(err);button.disabled=false;button.textContent="+ Adicionar";alert("Não foi possível adicionar a música.");}
}

$("#songForm").onsubmit=async e=>{
  e.preventDefault();
  const songs=state.playlists[state.selectedPlaylistId]?.songs||{};
  if(Object.keys(songs).length>=100)return alert("Limite de 100 músicas atingido.");
  const id=push(ref(db,`playlists/${state.selectedPlaylistId}/songs`)).key;
  await set(ref(db,`playlists/${state.selectedPlaylistId}/songs/${id}`),{title:$("#songName").value.trim(),artist:$("#songArtist").value.trim(),thumbnail:"",source:"manual",sourceId:"",favorite:$("#songFavorite").checked,active:true,createdAt:Date.now()});
  $("#songForm").reset();
  alert("Música adicionada.");
};

document.querySelectorAll("[data-hours]").forEach(b=>b.onclick=()=>{
  state.requestHours=Number(b.dataset.hours);document.querySelectorAll("[data-hours]").forEach(x=>x.classList.remove("active"));b.classList.add("active");renderRequests();
});
function renderRequests(){
  const cutoff=Date.now()-state.requestHours*3600000;
  const entries=Object.entries(state.requests).filter(([,r])=>(r?.createdAt||0)>=cutoff).sort((a,b)=>(b[1].priority-a[1].priority)||((a[1].createdAt||0)-(b[1].createdAt||0)));
  const queue=entries.filter(([,r])=>!["played","rejected"].includes(r.status));
  const tips=entries.reduce((s,[,r])=>s+Number(r.tipValue||0),0);
  const counts={};entries.forEach(([,r])=>counts[r.song]=(counts[r.song]||0)+1);const top=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]?.[0]||"—";
  $("#statRequests").textContent=entries.length;$("#statQueue").textContent=queue.length;$("#statTips").textContent=`R$ ${tips.toFixed(0)}`;$("#statTop").textContent=top;
  $("#requestsList").innerHTML=entries.map(([id,r])=>`<article class="request">
    <div class="meta">${r.priority?'<span class="tag">★ Prioritário</span>':''}<h3>${esc(r.song)}</h3><p class="muted">${esc(r.artist)}</p><p><strong>${esc(r.customerName)}</strong>${r.table?` • Mesa ${esc(r.table)}`:""}</p>${r.message?`<p>“${esc(r.message)}”</p>`:""}<span class="tag">${esc(r.status||"new")}</span>
      <div class="request-actions"><button class="pill" data-status="${id}:accepted">Aceitar</button><button class="pill" data-status="${id}:playing">Tocando</button><button class="pill" data-status="${id}:played">Tocada</button><button class="pill" data-status="${id}:rejected">Recusar</button></div>
    </div></article>`).join("")||`<div class="card"><h3>Nenhum pedido neste período</h3></div>`;
  document.querySelectorAll("[data-status]").forEach(b=>b.onclick=()=>{const [id,status]=b.dataset.status.split(":");set(ref(db,`requests/${id}/status`),status);});
}

function fillSettings(){
  $("#cfgEvent").value=state.settings.eventName||"Repertório da noite";$("#cfgIntro").value=state.settings.intro||"Escolha uma playlist, encontre sua música favorita e envie seu pedido.";
  $("#cfgPixKey").value=state.settings.pixKey||"";$("#cfgPixName").value=state.settings.pixName||"Ailton Souza";$("#cfgPixCity").value=state.settings.pixCity||"Luziania";
  $("#cfgPixEnabled").checked=state.settings.pixEnabled!==false;$("#cfgShowLive").checked=!!state.settings.showLive;$("#cfgShareLink").value=state.settings.shareLink||"https://ailtonsouza.com.br/tocaai";
  $("#shareLink").value=state.settings.shareLink||"https://ailtonsouza.com.br/tocaai";
  $("#liveBadge").textContent=state.settings.showLive?"● AO VIVO":"● FECHADO";
}
$("#saveSettings").onclick=async()=>{
  await set(ref(db,"settings"),{...state.settings,eventName:$("#cfgEvent").value.trim(),intro:$("#cfgIntro").value.trim(),pixKey:$("#cfgPixKey").value.trim(),pixName:$("#cfgPixName").value.trim(),pixCity:$("#cfgPixCity").value.trim(),pixEnabled:$("#cfgPixEnabled").checked,showLive:$("#cfgShowLive").checked,shareLink:$("#cfgShareLink").value.trim(),updatedAt:Date.now()});
  alert("Configurações salvas.");
};
$("#copyLink").onclick=async()=>{await navigator.clipboard.writeText($("#shareLink").value);$("#copyLink").textContent="Copiado!";};
$("#shareBtn").onclick=async()=>{const url=$("#shareLink").value;if(navigator.share)await navigator.share({title:"Toca Aí • Ailton Souza",url});else{await navigator.clipboard.writeText(url);alert("Link copiado!");}};
