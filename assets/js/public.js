import { db, ref, get, push, set, onValue } from "../../firebase/client.js";

const $ = (s) => document.querySelector(s);
const state = { settings: {}, playlists: {}, currentPlaylist: null, currentSong: null, selectedValue: null, requestKey: null };

function esc(value=""){return String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}

async function loadInitial(){
  const snap = await get(ref(db, "/"));
  const data = snap.val() || {};
  state.settings = data/settings || {
    eventName:"Repertório da noite",
    intro:"Escolha uma playlist, encontre sua música favorita e envie seu pedido.",
    showLive:false,
    pixEnabled:true,
    pixKey:"",
    pixName:"Ailton Souza",
    pixCity:"Luziania"
  };
  state.playlists = data.playlists || {};
  applySettings();
  renderPlaylists();

  onValue(ref(db,"settings"), s=>{
    state.settings = s.val() || state.settings;
    applySettings();
  });
  onValue(ref(db,"playlists"), s=>{
    state.playlists = s.val() || {};
    renderPlaylists();
  });
}

function applySettings(){
  $("#eventName").textContent = state.settings.eventName || "Repertório da noite";
  $("#introText").textContent = state.settings.intro || "Escolha uma playlist, encontre sua música favorita e envie seu pedido.";
  const live = !!state.settings.showLive;
  $("#liveDot").classList.toggle("on", live);
  $("#liveText").textContent = live ? "AO VIVO — Pedidos abertos" : "Pedidos fechados";
}

function playlistEntries(){
  return Object.entries(state.playlists || {}).filter(([,p])=>p && p.active);
}

function renderPlaylists(){
  const term = ($("#playlistSearch")?.value || "").toLowerCase();
  $("#playlistList").innerHTML = playlistEntries()
    .filter(([,p])=>(p.name||"").toLowerCase().includes(term))
    .map(([id,p])=>`
      <article class="playlist" data-id="${id}">
        <div class="cover">${p.coverUrl?`<img src="${esc(p.coverUrl)}" alt="">`:(p.icon||"🎵")}</div>
        <div class="meta"><h3>${esc(p.name)}</h3><span class="muted">${Object.keys(p.songs||{}).length}/100 músicas</span></div>
        <button class="btn btn-primary">Abrir</button>
      </article>`).join("") || `<div class="card"><h3>Nenhuma playlist ativa</h3><p class="muted">O cantor ainda não ativou uma playlist.</p></div>`;
  document.querySelectorAll(".playlist[data-id]").forEach(el=>el.onclick=()=>openPlaylist(el.dataset.id));
}

function openPlaylist(id){
  state.currentPlaylist = { id, ...state.playlists[id] };
  $("#playlistView").hidden = true;
  $("#songView").hidden = false;
  $("#songTitle").textContent = state.currentPlaylist.name || "Playlist";
  renderSongs();
}

function songEntries(){
  return Object.entries(state.currentPlaylist?.songs || {}).filter(([,s])=>s && s.active !== false);
}
function renderSongs(){
  const term = ($("#songSearch")?.value || "").toLowerCase();
  $("#songList").innerHTML = songEntries()
    .filter(([,s])=>`${s.title||""} ${s.artist||""}`.toLowerCase().includes(term))
    .map(([id,s])=>`
      <article class="song">
        <div class="song-main">${s.thumbnail?`<img class="song-thumb" src="${esc(s.thumbnail)}" alt="">`:''}<div><h4>${esc(s.title)}</h4><p class="muted">${esc(s.artist)}</p>${s.favorite?'<span class="tag">★ Favorita do cantor</span>':''}</div></div>
        <button class="btn btn-primary" data-song="${id}">Pedir música</button>
      </article>`).join("") || `<div class="card"><h3>Nenhuma música encontrada</h3></div>`;
  document.querySelectorAll("[data-song]").forEach(b=>b.onclick=()=>openRequest(b.dataset.song));
}

function openRequest(songId){
  if(!state.settings.showLive){
    alert("Os pedidos estão fechados neste momento.");
    return;
  }
  state.currentSong = { id:songId, ...state.currentPlaylist.songs[songId] };
  $("#chosenSong").textContent = state.currentSong.title || "";
  $("#chosenArtist").textContent = state.currentSong.artist || "";
  $("#requestModal").classList.add("open");
}

$("#playlistSearch").oninput = renderPlaylists;
$("#songSearch").oninput = renderSongs;
$("#backBtn").onclick = ()=>{$("#songView").hidden=true;$("#playlistView").hidden=false};

$("#requestForm").onsubmit = async (e)=>{
  e.preventDefault();
  const requestRef = push(ref(db,"requests"));
  state.requestKey = requestRef.key;
  const request = {
    id: requestRef.key,
    playlistId: state.currentPlaylist.id,
    playlistName: state.currentPlaylist.name,
    songId: state.currentSong.id,
    song: state.currentSong.title,
    artist: state.currentSong.artist,
    customerName: $("#customerName").value.trim(),
    table: $("#customerTable").value.trim(),
    message: $("#customerMessage").value.trim(),
    status: "new",
    tipValue: 0,
    priority: false,
    createdAt: Date.now()
  };
  await set(requestRef, request);
  $("#requestModal").classList.remove("open");
  $("#requestForm").reset();
  if(state.settings.pixEnabled) $("#supportModal").classList.add("open");
  else showDone("Seu pedido foi recebido pelo Ailton Souza.");
};

document.querySelectorAll("[data-value]").forEach(b=>b.onclick=()=>{
  document.querySelectorAll(".value").forEach(x=>x.classList.remove("active"));
  b.classList.add("active");
  const raw=b.dataset.value;
  if(raw==="custom"){
    const custom=prompt("Digite o valor em reais:");
    state.selectedValue = Number(String(custom||"").replace(",","."));
  } else state.selectedValue = Number(raw);
  $("#generatePix").disabled = !(state.selectedValue>0);
});

$("#generatePix").onclick = async ()=>{
  const v = Number(state.selectedValue||0);
  if(!(v>0)) return;
  await set(ref(db,`requests/${state.requestKey}/tipValue`), v);
  await set(ref(db,`requests/${state.requestKey}/priority`), v>=20);
  $("#supportModal").classList.remove("open");
  $("#pixAmount").textContent = `Valor: R$ ${v.toFixed(2).replace(".",",")}`;
  const key = state.settings.pixKey || "";
  $("#pixPayload").value = `PIX|CHAVE:${key}|NOME:${state.settings.pixName||"Ailton Souza"}|CIDADE:${state.settings.pixCity||"Luziania"}|VALOR:${v.toFixed(2)}|REF:${state.requestKey}`;
  $("#pixModal").classList.add("open");
};

$("#copyPix").onclick = async ()=>{
  await navigator.clipboard.writeText($("#pixPayload").value);
  $("#copyPix").textContent="Copiado!";
};
$("#finishPix").onclick = ()=>{$("#pixModal").classList.remove("open");showDone("Seu pedido foi recebido. Obrigado por apoiar o artista.");};
$("#skipSupport").onclick = ()=>{$("#supportModal").classList.remove("open");showDone("Seu pedido foi recebido pelo Ailton Souza.");};
$("#doneBtn").onclick = ()=>$("#doneModal").classList.remove("open");
function showDone(text){$("#doneText").textContent=text;$("#doneModal").classList.add("open");}

loadInitial().catch(err=>{
  console.error(err);
  $("#playlistList").innerHTML=`<div class="card"><h3>Não foi possível carregar o repertório</h3><p class="muted">${esc(err.message)}</p></div>`;
});
