import {
  db,
  ref,
  get,
  push,
  set,
  onValue
} from "../../firebase/client.js";

const $ = (selector) => document.querySelector(selector);

const state = {
  settings: {},
  playlists: {},
  currentPlaylist: null,
  currentSong: null,
  selectedValue: null,
  requestKey: null
};

function esc(value = "") {
  return String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      })[character]
  );
}

async function loadInitial() {
  const snap = await get(ref(db, "/"));
  const data = snap.val() || {};

  state.settings = data.settings || {
    eventName: "Repertório da noite",
    intro:
      "Escolha uma playlist, encontre sua música favorita e envie seu pedido.",
    showLive: false,
    pixEnabled: true,
    pixKey: "",
    pixName: "Ailton Souza",
    pixCity: "Luziania"
  };

  state.playlists = data.playlists || {};

  applySettings();
  renderPlaylists();

  onValue(ref(db, "settings"), (snapshot) => {
    state.settings = snapshot.val() || state.settings;
    applySettings();
  });

  onValue(ref(db, "playlists"), (snapshot) => {
    state.playlists = snapshot.val() || {};
    renderPlaylists();
  });
}

function applySettings() {
  $("#eventName").textContent =
    state.settings.eventName || "Repertório da noite";

  $("#introText").textContent =
    state.settings.intro ||
    "Escolha uma playlist, encontre sua música favorita e envie seu pedido.";

  const live = Boolean(state.settings.showLive);

  $("#liveDot").classList.toggle("on", live);
  $("#liveText").textContent = live
    ? "AO VIVO — Pedidos abertos"
    : "Pedidos fechados";
}

function playlistEntries() {
  return Object.entries(state.playlists || {}).filter(
    ([, playlist]) => playlist && playlist.active
  );
}

function renderPlaylists() {
  const searchField = $("#playlistSearch");
  const playlistList = $("#playlistList");

  if (!playlistList) {
    return;
  }

  const term = (searchField?.value || "").trim().toLowerCase();

  const html = playlistEntries()
    .filter(([, playlist]) =>
      (playlist.name || "").toLowerCase().includes(term)
    )
    .map(([id, playlist]) => {
      const songsCount = Object.keys(playlist.songs || {}).length;

      const cover = playlist.coverUrl
        ? `<img src="${esc(playlist.coverUrl)}" alt="Capa da playlist ${esc(
            playlist.name
          )}">`
        : esc(playlist.icon || "🎵");

      return `
        <article class="playlist" data-id="${esc(id)}">
          <div class="cover">
            ${cover}
          </div>

          <div class="meta">
            <h3>${esc(playlist.name)}</h3>
            <span class="muted">${songsCount}/100 músicas</span>
          </div>

          <button class="btn btn-primary" type="button">
            Abrir
          </button>
        </article>
      `;
    })
    .join("");

  playlistList.innerHTML =
    html ||
    `
      <div class="card">
        <h3>Nenhuma playlist ativa</h3>
        <p class="muted">
          O cantor ainda não ativou uma playlist.
        </p>
      </div>
    `;

  document
    .querySelectorAll(".playlist[data-id]")
    .forEach((element) => {
      element.addEventListener("click", () => {
        openPlaylist(element.dataset.id);
      });
    });
}

function openPlaylist(id) {
  const playlist = state.playlists[id];

  if (!playlist) {
    alert("Essa playlist não foi encontrada.");
    return;
  }

  state.currentPlaylist = {
    id,
    ...playlist
  };

  $("#playlistView").hidden = true;
  $("#songView").hidden = false;
  $("#songTitle").textContent =
    state.currentPlaylist.name || "Playlist";

  renderSongs();
}

function songEntries() {
  return Object.entries(
    state.currentPlaylist?.songs || {}
  ).filter(([, song]) => song && song.active !== false);
}

function renderSongs() {
  const searchField = $("#songSearch");
  const songList = $("#songList");

  if (!songList) {
    return;
  }

  const term = (searchField?.value || "").trim().toLowerCase();

  const html = songEntries()
    .filter(([, song]) => {
      const searchableText =
        `${song.title || ""} ${song.artist || ""}`.toLowerCase();

      return searchableText.includes(term);
    })
    .map(([id, song]) => {
      const thumbnail = song.thumbnail
        ? `
          <img
            class="song-thumb"
            src="${esc(song.thumbnail)}"
            alt="Miniatura de ${esc(song.title)}"
            loading="lazy"
          >
        `
        : "";

      const favoriteTag = song.favorite
        ? '<span class="tag">★ Favorita do cantor</span>'
        : "";

      return `
        <article class="song">
          <div class="song-main">
            ${thumbnail}

            <div>
              <h4>${esc(song.title)}</h4>
              <p class="muted">${esc(song.artist)}</p>
              ${favoriteTag}
            </div>
          </div>

          <button
            class="btn btn-primary"
            type="button"
            data-song="${esc(id)}"
          >
            Pedir música
          </button>
        </article>
      `;
    })
    .join("");

  songList.innerHTML =
    html ||
    `
      <div class="card">
        <h3>Nenhuma música encontrada</h3>
      </div>
    `;

  document.querySelectorAll("[data-song]").forEach((button) => {
    button.addEventListener("click", () => {
      openRequest(button.dataset.song);
    });
  });
}

function openRequest(songId) {
  if (!state.settings.showLive) {
    alert("Os pedidos estão fechados neste momento.");
    return;
  }

  const song = state.currentPlaylist?.songs?.[songId];

  if (!song) {
    alert("Essa música não foi encontrada.");
    return;
  }

  state.currentSong = {
    id: songId,
    ...song
  };

  $("#chosenSong").textContent =
    state.currentSong.title || "";

  $("#chosenArtist").textContent =
    state.currentSong.artist || "";

  $("#requestModal").classList.add("open");
}

const playlistSearch = $("#playlistSearch");
const songSearch = $("#songSearch");
const backButton = $("#backBtn");
const requestForm = $("#requestForm");
const generatePixButton = $("#generatePix");
const copyPixButton = $("#copyPix");
const finishPixButton = $("#finishPix");
const skipSupportButton = $("#skipSupport");
const doneButton = $("#doneBtn");

if (playlistSearch) {
  playlistSearch.addEventListener("input", renderPlaylists);
}

if (songSearch) {
  songSearch.addEventListener("input", renderSongs);
}

if (backButton) {
  backButton.addEventListener("click", () => {
    $("#songView").hidden = true;
    $("#playlistView").hidden = false;
    state.currentPlaylist = null;
    state.currentSong = null;
  });
}

if (requestForm) {
  requestForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!state.currentPlaylist || !state.currentSong) {
      alert("Escolha uma música antes de enviar o pedido.");
      return;
    }

    const customerName =
      $("#customerName")?.value.trim() || "";

    if (!customerName) {
      alert("Informe seu nome.");
      return;
    }

    const submitButton = requestForm.querySelector(
      'button[type="submit"]'
    );

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Enviando...";
    }

    try {
      const requestRef = push(ref(db, "requests"));

      state.requestKey = requestRef.key;

      const requestData = {
        id: requestRef.key,
        playlistId: state.currentPlaylist.id,
        playlistName: state.currentPlaylist.name || "",
        songId: state.currentSong.id,
        song: state.currentSong.title || "",
        artist: state.currentSong.artist || "",
        thumbnail: state.currentSong.thumbnail || "",
        source: state.currentSong.source || "",
        sourceId: state.currentSong.sourceId || "",
        customerName,
        table: $("#customerTable")?.value.trim() || "",
        message: $("#customerMessage")?.value.trim() || "",
        status: "new",
        tipValue: 0,
        priority: false,
        createdAt: Date.now()
      };

      await set(requestRef, requestData);

      $("#requestModal").classList.remove("open");
      requestForm.reset();

      state.selectedValue = null;

      document
        .querySelectorAll(".value")
        .forEach((button) => button.classList.remove("active"));

      if (generatePixButton) {
        generatePixButton.disabled = true;
      }

      if (state.settings.pixEnabled) {
        $("#supportModal").classList.add("open");
      } else {
        showDone(
          "Seu pedido foi recebido pelo Ailton Souza."
        );
      }
    } catch (error) {
      console.error(error);
      alert(
        "Não foi possível enviar o pedido. Tente novamente."
      );
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = "Enviar pedido";
      }
    }
  });
}

document
  .querySelectorAll("[data-value]")
  .forEach((button) => {
    button.addEventListener("click", () => {
      document
        .querySelectorAll(".value")
        .forEach((item) => item.classList.remove("active"));

      button.classList.add("active");

      const rawValue = button.dataset.value;

      if (rawValue === "custom") {
        const customValue = prompt(
          "Digite o valor em reais:"
        );

        state.selectedValue = Number(
          String(customValue || "")
            .replace(/[^\d,.-]/g, "")
            .replace(",", ".")
        );
      } else {
        state.selectedValue = Number(rawValue);
      }

      if (generatePixButton) {
        generatePixButton.disabled = !(
          state.selectedValue > 0
        );
      }
    });
  });

if (generatePixButton) {
  generatePixButton.addEventListener("click", async () => {
    const value = Number(state.selectedValue || 0);

    if (!(value > 0) || !state.requestKey) {
      return;
    }

    generatePixButton.disabled = true;
    generatePixButton.textContent = "Gerando PIX...";

    try {
      await set(
        ref(
          db,
          `requests/${state.requestKey}/tipValue`
        ),
        value
      );

      await set(
        ref(
          db,
          `requests/${state.requestKey}/priority`
        ),
        value >= 20
      );

      $("#supportModal").classList.remove("open");

      $("#pixAmount").textContent =
        `Valor: R$ ${value
          .toFixed(2)
          .replace(".", ",")}`;

      const pixKey = state.settings.pixKey || "";
      const pixName =
        state.settings.pixName || "Ailton Souza";
      const pixCity =
        state.settings.pixCity || "Luziania";

      $("#pixPayload").value =
        `PIX|CHAVE:${pixKey}` +
        `|NOME:${pixName}` +
        `|CIDADE:${pixCity}` +
        `|VALOR:${value.toFixed(2)}` +
        `|REF:${state.requestKey}`;

      $("#pixModal").classList.add("open");
    } catch (error) {
      console.error(error);
      alert(
        "Não foi possível gerar o PIX. Tente novamente."
      );
    } finally {
      generatePixButton.disabled = false;
      generatePixButton.textContent = "Gerar PIX";
    }
  });
}

if (copyPixButton) {
  copyPixButton.addEventListener("click", async () => {
    const pixPayload = $("#pixPayload")?.value || "";

    try {
      await navigator.clipboard.writeText(pixPayload);
      copyPixButton.textContent = "Copiado!";
    } catch (error) {
      console.error(error);

      const pixField = $("#pixPayload");

      if (pixField) {
        pixField.select();
        document.execCommand("copy");
        copyPixButton.textContent = "Copiado!";
      }
    }
  });
}

if (finishPixButton) {
  finishPixButton.addEventListener("click", () => {
    $("#pixModal").classList.remove("open");

    showDone(
      "Seu pedido foi recebido. Obrigado por apoiar o artista."
    );
  });
}

if (skipSupportButton) {
  skipSupportButton.addEventListener("click", () => {
    $("#supportModal").classList.remove("open");

    showDone(
      "Seu pedido foi recebido pelo Ailton Souza."
    );
  });
}

if (doneButton) {
  doneButton.addEventListener("click", () => {
    $("#doneModal").classList.remove("open");
  });
}

function showDone(text) {
  $("#doneText").textContent = text;
  $("#doneModal").classList.add("open");
}

loadInitial().catch((error) => {
  console.error(error);

  const playlistList = $("#playlistList");

  if (playlistList) {
    playlistList.innerHTML = `
      <div class="card">
        <h3>Não foi possível carregar o repertório</h3>
        <p class="muted">${esc(error.message)}</p>
      </div>
    `;
  }
});
