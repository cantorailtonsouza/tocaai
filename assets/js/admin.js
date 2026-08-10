import {
  auth, db, onAuthStateChanged, signInWithEmailAndPassword, signOut,
  ref, get, set, update, push, remove, onValue
} from "../../firebase/client.js?v=20260810-0940";

const $ = s=>document.querySelector(s);
const YOUTUBE_SEARCH_API = "https://tocaai-spotify.cantorailtonsouza.workers.dev/search";
const VALID_TABS = ["playlistsTab", "requestsTab", "shareTab", "configTab"];
const SAVED_TAB = sessionStorage.getItem("tocaaiAdminTab");
const state = {
  settings:{},
  playlists:{},
  requests:{},
  selectedPlaylistId:null,
  requestHours:1,
  youtubeResults:[],
  activeTab:VALID_TABS.includes(SAVED_TAB) ? SAVED_TAB : "playlistsTab"
};
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

function activateTab(tabId){
  const safeTab=VALID_TABS.includes(tabId)?tabId:"playlistsTab";
  state.activeTab=safeTab;
  sessionStorage.setItem("tocaaiAdminTab",safeTab);
  document.querySelectorAll("main>section").forEach(section=>{
    section.hidden=section.id!==safeTab;
  });
  document.querySelectorAll(".bottom-nav button").forEach(button=>{
    const active=button.dataset.tab===safeTab;
    button.classList.toggle("active",active);
    button.setAttribute("aria-current",active?"page":"false");
  });
}

document.querySelectorAll(".bottom-nav button").forEach(button=>{
  button.onclick=()=>activateTab(button.dataset.tab);
});

activateTab(state.activeTab);

function renderPlaylists(){
  const term=($("#adminPlaylistSearch").value||"").toLowerCase();
  const entries=Object.entries(state.playlists).filter(([,p])=>(p?.name||"").toLowerCase().includes(term));
  $("#playlistCount").textContent=`${entries.length} playlists`;
  $("#adminPlaylists").innerHTML=entries.map(([id,p])=>{
    const songs=Object.values(p.songs||{});
    const count=songs.length;
    const pct=Math.min(100,count);
    const latestSong=songs
      .filter(song=>song?.thumbnail)
      .sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0))[0];
    const coverImage=p.coverUrl||latestSong?.thumbnail||"";
    const cover=coverImage
      ? `<img src="${esc(coverImage)}" alt="Capa da playlist ${esc(p.name||"")}">`
      : (p.icon||"🎵");
    return `<article class="playlist" data-open="${id}">
      <div class="cover">${cover}</div>
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
function elapsedTime(timestamp){
  const seconds=Math.max(0,Math.floor((Date.now()-Number(timestamp||0))/1000));
  if(seconds<60) return "agora";
  const minutes=Math.floor(seconds/60);
  if(minutes<60) return `há ${minutes}min`;
  const hours=Math.floor(minutes/60);
  if(hours<24) return `há ${hours}h`;
  const days=Math.floor(hours/24);
  return `há ${days}d`;
}

function renderRequests(){
  const cutoff=Date.now()-state.requestHours*3600000;
  const showStartedAt=Number(state.settings.showStartedAt||0);
  const sessionEntries=Object.entries(state.requests)
    .filter(([,request])=>!showStartedAt||(request?.createdAt||0)>=showStartedAt)
    .sort((a,b)=>(a[1]?.createdAt||0)-(b[1]?.createdAt||0));
  const arrivalOrder=new Map(
    sessionEntries.map(([id],index)=>[id,index+1])
  );
  const entries=sessionEntries
    .filter(([,request])=>(request?.createdAt||0)>=cutoff)
    .sort((a,b)=>{
      const aFinished=["played","rejected"].includes(a[1].status);
      const bFinished=["played","rejected"].includes(b[1].status);
      if(aFinished!==bFinished) return Number(aFinished)-Number(bFinished);

      if(!aFinished&&!bFinished){
        const priorityDifference=
          Number(b[1].tipValue||0)-Number(a[1].tipValue||0);

        if(priorityDifference!==0) return priorityDifference;
      }

      return (a[1].createdAt||0)-(b[1].createdAt||0);
    });

  const queue=entries.filter(([,request])=>!["played","rejected"].includes(request.status));
  const tips=entries.reduce((sum,[,request])=>sum+Number(request.tipValue||0),0);
  const counts={};
  entries.forEach(([,request])=>counts[request.song]=(counts[request.song]||0)+1);
  const top=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]?.[0]||"—";
  const statusLabels={new:"Novo",accepted:"Aceito",playing:"Tocando",played:"Tocada",rejected:"Recusada"};

  $("#statRequests").textContent=entries.length;
  $("#statQueue").textContent=queue.length;
  $("#statTips").textContent=`R$ ${tips.toFixed(0)}`;
  $("#statTop").textContent=top;

  $("#requestsList").innerHTML=entries.map(([id,request])=>{
    const finished=["played","rejected"].includes(request.status);
    const order=arrivalOrder.get(id)||"—";
    const title=[request.song,request.artist].filter(Boolean).join(" — ");
    const priorityValue=Number(request.tipValue||0);
    const priorityBadge=!finished&&priorityValue>0
      ? `<span class="priority-badge" aria-label="Prioridade de ${priorityValue.toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}"><span aria-hidden="true">◆</span> Prioridade R$ ${priorityValue.toFixed(0)}</span>`
      : "";
    return `<details class="request request-card request-card-reference ${finished?"is-finished":""} ${priorityValue>0?"has-priority":""}">
      <summary class="request-summary">
        <span class="request-music-icon" aria-hidden="true"><b>♫</b><small>#${order}</small></span>
        <span class="request-summary-text">
          <strong>${esc(title||"Música sem título")}</strong>
          <small>◷ ${esc(elapsedTime(request.createdAt))}</small>
          ${priorityBadge}
        </span>
        <span class="tag request-status">${esc(statusLabels[request.status]||"Novo")}</span>
      </summary>
      <div class="request-details">
        <p class="request-info-row">
          <span aria-hidden="true">♙</span>
          <span>Pedido por <strong>${esc(request.customerName||"Cliente")}</strong>${request.table?` • Mesa ${esc(request.table)}`:""}</span>
        </p>
        ${request.message?`<p class="request-info-row request-message"><span aria-hidden="true">◯</span><span>Mensagem: ${esc(request.message)}</span></p>`:""}
        ${priorityValue>0?`<span class="priority-detail">◆ Contribuição selecionada: R$ ${priorityValue.toFixed(2).replace(".",",")}</span>`:""}
        <div class="request-actions" aria-label="Finalizar pedido">
          <button class="btn btn-primary action-played" type="button" data-status="${id}:played">Tocar</button>
          <button class="btn btn-dark action-rejected" type="button" data-status="${id}:rejected">Recusar</button>
        </div>
      </div>
    </details>`;
  }).join("")||`<div class="card"><h3>Nenhum pedido neste período</h3></div>`;

  document.querySelectorAll("[data-status]").forEach(button=>{
    button.onclick=async()=>{
      const [id,status]=button.dataset.status.split(":");
      button.disabled=true;
      button.textContent="Salvando...";
      try{
        await update(ref(db,`requests/${id}`),{status,completedAt:Date.now()});
      }catch(error){
        console.error("Erro ao atualizar pedido:",error);
        button.disabled=false;
        button.textContent=status==="played"?"Tocar":"Recusar";
        alert("Não foi possível atualizar o pedido. Tente novamente.");
      }
    };
  });
}
function fillSettings(){
  $("#cfgEvent").value=state.settings.eventName||"Repertório da noite";
  $("#cfgIntro").value=state.settings.intro||"Escolha uma playlist, encontre sua música favorita e envie seu pedido.";

  $("#cfgPixKeyType").value=state.settings.pixKeyType||"random";
  $("#cfgPixKey").value=state.settings.pixKey||"";
  $("#cfgPixName").value=state.settings.pixName||"Ailton Souza";
  $("#cfgPixCity").value=state.settings.pixCity||"Luziania";

  $("#cfgPixEnabled").checked=state.settings.pixEnabled!==false;
  $("#cfgShowLive").checked=!!state.settings.showLive;
  $("#cfgShareLink").value=state.settings.shareLink||"https://ailtonsouza.com.br/tocaai";

  $("#shareLink").value=state.settings.shareLink||"https://ailtonsouza.com.br/tocaai";
  const showLive=!!state.settings.showLive;
  $("#liveBadge").textContent=showLive?"● AO VIVO":"● FECHADO";
  $("#liveBadge").classList.toggle("green",showLive);
  $("#quickLiveToggle").classList.toggle("on",showLive);
  $("#quickLiveToggle").setAttribute("aria-checked",String(showLive));
}
$("#quickLiveToggle").onclick=async()=>{
  const opening=!state.settings.showLive;
  await update(ref(db,"settings"),{
    showLive:opening,
    ...(opening
      ? {showStartedAt:Date.now(),showEndedAt:null}
      : {showEndedAt:Date.now()}),
    updatedAt:Date.now()
  });
};

$("#saveSettings").onclick=async()=>{
  const pixKeyType=$("#cfgPixKeyType").value;
  const pixKey=$("#cfgPixKey").value.trim();

  if($("#cfgPixEnabled").checked&&!pixKey){
    alert("Digite uma chave Pix antes de salvar.");
    $("#cfgPixKey").focus();
    return;
  }

  const nextShowLive=$("#cfgShowLive").checked;
  const openingShow=nextShowLive&&!state.settings.showLive;
  const closingShow=!nextShowLive&&!!state.settings.showLive;

  await set(ref(db,"settings"),{
    ...state.settings,
    eventName:$("#cfgEvent").value.trim(),
    intro:$("#cfgIntro").value.trim(),
    pixKeyType,
    pixKey,
    pixName:$("#cfgPixName").value.trim(),
    pixCity:$("#cfgPixCity").value.trim(),
    pixEnabled:$("#cfgPixEnabled").checked,
    showLive:nextShowLive,
    showStartedAt:openingShow?Date.now():(state.settings.showStartedAt||null),
    showEndedAt:closingShow?Date.now():(state.settings.showEndedAt||null),
    shareLink:$("#cfgShareLink").value.trim(),
    updatedAt:Date.now()
  });

  alert("Configurações salvas.");
};
$("#copyLink").onclick=async()=>{await navigator.clipboard.writeText($("#shareLink").value);$("#copyLink").textContent="Copiado!";};
$("#shareBtn").onclick=async()=>{const url=$("#shareLink").value;if(navigator.share)await navigator.share({title:"Toca Aí • Ailton Souza",url});else{await navigator.clipboard.writeText(url);alert("Link copiado!");}};
