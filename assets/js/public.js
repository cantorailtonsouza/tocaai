import {
  db,
  ref,
  get,
  push,
  set,
  onValue
} from "../../firebase/client.js";

const $ = (selector) =>
  document.querySelector(selector);

const DEFAULT_SETTINGS = {
  eventName: "Repertório da noite",

  intro:
    "Escolha uma playlist, encontre sua música favorita e envie seu pedido.",

  showLive: false,

  pixEnabled: true,

  // Continua salvo para uso interno do painel.
  pixKeyType: "random",

  pixKey: "",

  pixName: "Ailton Jesus de Souza",

  pixCity: "Luziania"
};

const state = {
  settings: {
    ...DEFAULT_SETTINGS
  },

  playlists: {},

  currentPlaylist: null,

  currentSong: null,

  selectedValue: null,

  requestKey: null,

  pendingRequest: null,

  requestCommitted: false
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


/* =====================================================
   CARREGAMENTO INICIAL
===================================================== */

async function loadInitial() {
  const [
    settingsSnapshot,
    playlistsSnapshot
  ] = await Promise.all([
    get(ref(db, "settings")),
    get(ref(db, "playlists"))
  ]);

  state.settings = {
    ...DEFAULT_SETTINGS,
    ...(settingsSnapshot.val() || {})
  };

  state.playlists =
    playlistsSnapshot.val() || {};

  applySettings();

  renderPlaylists();

  onValue(
    ref(db, "settings"),

    (snapshot) => {
      state.settings = {
        ...DEFAULT_SETTINGS,
        ...(snapshot.val() || {})
      };

      applySettings();
    },

    (error) => {
      console.error(
        "Erro ao acompanhar configurações:",
        error
      );
    }
  );

  onValue(
    ref(db, "playlists"),

    (snapshot) => {
      state.playlists =
        snapshot.val() || {};

      if (state.currentPlaylist?.id) {
        const updatedPlaylist =
          state.playlists[
            state.currentPlaylist.id
          ];

        if (updatedPlaylist) {
          state.currentPlaylist = {
            id: state.currentPlaylist.id,
            ...updatedPlaylist
          };

          renderSongs();
        } else {
          closePlaylist();
        }
      }

      renderPlaylists();
    },

    (error) => {
      console.error(
        "Erro ao acompanhar playlists:",
        error
      );
    }
  );
}


/* =====================================================
   CONFIGURAÇÕES PÚBLICAS
===================================================== */

function applySettings() {
  const eventName =
    $("#eventName");

  const introText =
    $("#introText");

  const liveDot =
    $("#liveDot");

  const liveText =
    $("#liveText");

  const supportReceiver =
    $("#supportPixReceiver");

  const pixReceiver =
    $("#pixReceiverName");

  const pixName =
    state.settings.pixName ||
    DEFAULT_SETTINGS.pixName;

  if (eventName) {
    eventName.textContent =
      state.settings.eventName ||
      DEFAULT_SETTINGS.eventName;
  }

  if (introText) {
    introText.textContent =
      state.settings.intro ||
      DEFAULT_SETTINGS.intro;
  }

  if (supportReceiver) {
    supportReceiver.textContent =
      pixName;
  }

  if (pixReceiver) {
    pixReceiver.textContent =
      pixName;
  }

  const live =
    Boolean(
      state.settings.showLive
    );

  if (liveDot) {
    liveDot.classList.toggle(
      "on",
      live
    );
  }

  if (liveText) {
    liveText.textContent = live
      ? "AO VIVO — Pedidos abertos"
      : "Pedidos fechados";
  }
}


/* =====================================================
   PLAYLISTS
===================================================== */

function playlistEntries() {
  return Object.entries(
    state.playlists || {}
  ).filter(
    ([, playlist]) =>
      playlist &&
      playlist.active === true
  );
}

function renderPlaylists() {
  const searchField =
    $("#playlistSearch");

  const playlistList =
    $("#playlistList");

  if (!playlistList) {
    return;
  }

  const term =
    (
      searchField?.value || ""
    )
      .trim()
      .toLowerCase();

  const playlists =
    playlistEntries().filter(
      ([, playlist]) =>
        (
          playlist.name || ""
        )
          .toLowerCase()
          .includes(term)
    );

  playlistList.innerHTML =
    playlists
      .map(
        ([id, playlist]) => {
          const songs =
            Object.values(
              playlist.songs || {}
            );

          const songsCount =
            songs.length;

          /*
           * Encontra a música mais recente
           * que possua uma miniatura.
           */
          const latestSong =
            songs
              .filter(
                (song) =>
                  song &&
                  song.thumbnail
              )
              .sort(
                (
                  songA,
                  songB
                ) =>
                  Number(
                    songB.createdAt ||
                      0
                  ) -
                  Number(
                    songA.createdAt ||
                      0
                  )
              )[0];

          /*
           * Prioridade da capa:
           * 1. Capa manual da playlist;
           * 2. Miniatura da última música;
           * 3. Ícone da playlist.
           */
          const coverImage =
            playlist.coverUrl ||
            latestSong?.thumbnail ||
            "";

          const cover =
            coverImage
              ? `
                <img
                  src="${esc(
                    coverImage
                  )}"
                  alt="Capa da playlist ${esc(
                    playlist.name ||
                      ""
                  )}"
                  loading="lazy"
                >
              `
              : esc(
                  playlist.icon ||
                    "🎵"
                );

          return `
            <article
              class="playlist"
              data-id="${esc(id)}"
              tabindex="0"
              role="button"
              aria-label="Abrir playlist ${esc(
                playlist.name ||
                  ""
              )}"
            >

              <div class="cover">
                ${cover}
              </div>

              <div class="meta">

                <h3>
                  ${esc(
                    playlist.name ||
                      "Playlist"
                  )}
                </h3>

                <span class="muted">
                  ${songsCount}/100 músicas
                </span>

              </div>

              <button
                class="btn btn-primary"
                type="button"
                data-open-playlist="${esc(
                  id
                )}"
              >
                Abrir
              </button>

            </article>
          `;
        }
      )
      .join("") ||
    `
      <div class="card">

        <h3>
          Nenhuma playlist ativa
        </h3>

        <p class="muted">
          O cantor ainda não ativou uma playlist.
        </p>

      </div>
    `;

  document
    .querySelectorAll(
      ".playlist[data-id]"
    )
    .forEach((element) => {
      const open = () => {
        openPlaylist(
          element.dataset.id
        );
      };

      element.addEventListener(
        "click",
        open
      );

      element.addEventListener(
        "keydown",

        (event) => {
          if (
            event.key === "Enter" ||
            event.key === " "
          ) {
            event.preventDefault();

            open();
          }
        }
      );
    });
}

function openPlaylist(id) {
  const playlist =
    state.playlists[id];

  if (
    !playlist ||
    playlist.active !== true
  ) {
    alert(
      "Essa playlist não está disponível neste momento."
    );

    return;
  }

  state.currentPlaylist = {
    id,
    ...playlist
  };

  state.currentSong = null;

  const playlistView =
    $("#playlistView");

  const songView =
    $("#songView");

  const songTitle =
    $("#songTitle");

  const songSearch =
    $("#songSearch");

  if (playlistView) {
    playlistView.hidden = true;
  }

  if (songView) {
    songView.hidden = false;
  }

  if (songTitle) {
    songTitle.textContent =
      state.currentPlaylist.name ||
      "Playlist";
  }

  if (songSearch) {
    songSearch.value = "";
  }

  renderSongs();

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

function closePlaylist() {
  const playlistView =
    $("#playlistView");

  const songView =
    $("#songView");

  if (songView) {
    songView.hidden = true;
  }

  if (playlistView) {
    playlistView.hidden = false;
  }

  state.currentPlaylist = null;

  state.currentSong = null;
}


/* =====================================================
   MÚSICAS
===================================================== */

function songEntries() {
  return Object.entries(
    state.currentPlaylist
      ?.songs || {}
  ).filter(
    ([, song]) =>
      song &&
      song.active !== false
  );
}

function renderSongs() {
  const searchField =
    $("#songSearch");

  const songList =
    $("#songList");

  if (!songList) {
    return;
  }

  const term =
    (
      searchField?.value || ""
    )
      .trim()
      .toLowerCase();

  const songs =
    songEntries().filter(
      ([, song]) => {
        const searchableText =
          [
            song.title || "",
            song.artist || ""
          ]
            .join(" ")
            .toLowerCase();

        return searchableText.includes(
          term
        );
      }
    );

  songList.innerHTML =
    songs
      .map(
        ([id, song]) => {
          const thumbnail =
            song.thumbnail
              ? `
                <img
                  class="song-thumb"
                  src="${esc(
                    song.thumbnail
                  )}"
                  alt="Miniatura de ${esc(
                    song.title ||
                      ""
                  )}"
                  loading="lazy"
                >
              `
              : `
                <div
                  class="song-thumb song-thumb-placeholder"
                  aria-hidden="true"
                >
                  🎵
                </div>
              `;

          const favoriteTag =
            song.favorite
              ? `
                <span class="tag">
                  ★ Favorita do cantor
                </span>
              `
              : "";

          return `
            <article class="song">

              <div class="song-main">

                ${thumbnail}

                <div>

                  <h4>
                    ${esc(
                      song.title ||
                        "Música sem título"
                    )}
                  </h4>

                  <p class="muted">
                    ${esc(
                      song.artist ||
                        "Artista não informado"
                    )}
                  </p>

                  ${favoriteTag}

                </div>

              </div>

              <button
                class="btn btn-primary"
                type="button"
                data-song="${esc(
                  id
                )}"
              >
                Pedir música
              </button>

            </article>
          `;
        }
      )
      .join("") ||
    `
      <div class="card">

        <h3>
          Nenhuma música encontrada
        </h3>

        <p class="muted">
          Tente pesquisar usando outro nome.
        </p>

      </div>
    `;

  document
    .querySelectorAll(
      "[data-song]"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",

        () => {
          openRequest(
            button.dataset.song
          );
        }
      );
    });
}


/* =====================================================
   ABRIR PEDIDO
===================================================== */

function openRequest(songId) {
  if (
    !state.settings.showLive
  ) {
    alert(
      "Os pedidos estão fechados neste momento."
    );

    return;
  }

  const song =
    state.currentPlaylist
      ?.songs?.[songId];

  if (
    !song ||
    song.active === false
  ) {
    alert(
      "Essa música não está disponível."
    );

    return;
  }

  state.currentSong = {
    id: songId,
    ...song
  };

  const chosenSong =
    $("#chosenSong");

  const chosenArtist =
    $("#chosenArtist");

  const requestModal =
    $("#requestModal");

  if (chosenSong) {
    chosenSong.textContent =
      state.currentSong.title ||
      "";
  }

  if (chosenArtist) {
    chosenArtist.textContent =
      state.currentSong.artist ||
      "";
  }

  if (requestModal) {
    requestModal.classList.add(
      "open"
    );
  }
}


/* =====================================================
   ELEMENTOS
===================================================== */

const playlistSearch =
  $("#playlistSearch");

const songSearch =
  $("#songSearch");

const backButton =
  $("#backBtn");

const requestForm =
  $("#requestForm");

const generatePixButton =
  $("#generatePix");

const copyPixButton =
  $("#copyPix");

const finishPixButton =
  $("#finishPix");

const skipSupportButton =
  $("#skipSupport");

const doneButton =
  $("#doneBtn");


/* =====================================================
   PESQUISAS
===================================================== */

if (playlistSearch) {
  playlistSearch.addEventListener(
    "input",
    renderPlaylists
  );
}

if (songSearch) {
  songSearch.addEventListener(
    "input",
    renderSongs
  );
}

if (backButton) {
  backButton.addEventListener(
    "click",
    closePlaylist
  );
}


/* =====================================================
   ENVIO DO PEDIDO
===================================================== */

if (requestForm) {
  requestForm.addEventListener(
    "submit",

    async (event) => {
      event.preventDefault();

      if (
        !state.currentPlaylist ||
        !state.currentSong
      ) {
        alert(
          "Escolha uma música antes de enviar o pedido."
        );

        return;
      }

      const customerName =
        $("#customerName")
          ?.value.trim() ||
        "";

      if (!customerName) {
        alert(
          "Informe seu nome."
        );

        $("#customerName")?.focus();

        return;
      }

      const submitButton =
        requestForm.querySelector(
          'button[type="submit"]'
        );

      if (submitButton) {
        submitButton.disabled = true;

        submitButton.textContent =
          "Enviando...";
      }

      try {
        const requestReference =
          push(
            ref(
              db,
              "requests"
            )
          );

        state.requestKey =
          requestReference.key;

        const requestData = {
          id:
            requestReference.key,

          playlistId:
            state.currentPlaylist.id,

          playlistName:
            state.currentPlaylist
              .name || "",

          songId:
            state.currentSong.id,

          song:
            state.currentSong
              .title || "",

          artist:
            state.currentSong
              .artist || "",

          thumbnail:
            state.currentSong
              .thumbnail || "",

          source:
            state.currentSong
              .source || "",

          sourceId:
            state.currentSong
              .sourceId || "",

          customerName,

          table:
            $("#customerTable")
              ?.value.trim() ||
            "",

          message:
            $("#customerMessage")
              ?.value.trim() ||
            "",

          status: "new",

          tipValue: 0,

          priority: false,

          createdAt:
            Date.now()
        };

        /*
         * O pedido fica preparado no aparelho até a pessoa
         * copiar o Pix ou escolher seguir sem apoio. Assim a
         * prioridade já nasce junto com o pedido e respeita
         * as regras de segurança do Firebase.
         */
        state.pendingRequest =
          requestData;

        state.requestCommitted =
          false;

        $("#requestModal")
          ?.classList.remove(
            "open"
          );

        requestForm.reset();

        state.selectedValue =
          null;

        document
          .querySelectorAll(
            ".value"
          )
          .forEach((button) => {
            button.classList.remove(
              "active"
            );
          });

        if (generatePixButton) {
          generatePixButton.disabled =
            true;
        }

        if (
          state.settings.pixEnabled
        ) {
          $("#supportModal")
            ?.classList.add(
              "open"
            );
        } else {
          await commitPendingRequest(0);

          showDone(
            "Seu pedido foi recebido pelo Ailton Souza."
          );
        }
      } catch (error) {
        console.error(
          "Erro ao enviar pedido:",
          error
        );

        alert(
          "Não foi possível enviar o pedido. Tente novamente."
        );
      } finally {
        if (submitButton) {
          submitButton.disabled =
            false;

          submitButton.textContent =
            "Enviar pedido";
        }
      }
    }
  );
}


/* =====================================================
   VALORES DO APOIO
===================================================== */

document
  .querySelectorAll(
    "[data-value]"
  )
  .forEach((button) => {
    button.addEventListener(
      "click",

      () => {
        document
          .querySelectorAll(
            ".value"
          )
          .forEach((item) => {
            item.classList.remove(
              "active"
            );
          });

        button.classList.add(
          "active"
        );

        const rawValue =
          button.dataset.value;

        if (
          rawValue === "custom"
        ) {
          const customValue =
            prompt(
              "Digite o valor em reais:"
            );

          state.selectedValue =
            Number(
              String(
                customValue || ""
              )
                .replace(
                  /[^\d,.-]/g,
                  ""
                )
                .replace(
                  ",",
                  "."
                )
            );
        } else {
          state.selectedValue =
            Number(rawValue);
        }

        if (
          !Number.isFinite(
            state.selectedValue
          ) ||
          state.selectedValue <=
            0
        ) {
          state.selectedValue =
            null;

          button.classList.remove(
            "active"
          );
        }

        if (generatePixButton) {
          generatePixButton.disabled =
            !(
              state.selectedValue >
              0
            );
        }
      }
    );
  });


/* =====================================================
   GERAR PIX
===================================================== */

function pixNormalizeText(value, maxLength) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 .\-/]/g, "")
    .trim()
    .slice(0, maxLength);
}

function pixField(id, value) {
  const textValue = String(value);
  return id + String(textValue.length).padStart(2, "0") + textValue;
}

function pixCrc16(payload) {
  let crc = 0xffff;

  for (let index = 0; index < payload.length; index += 1) {
    crc ^= payload.charCodeAt(index) << 8;

    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000)
        ? ((crc << 1) ^ 0x1021) & 0xffff
        : (crc << 1) & 0xffff;
    }
  }

  return crc
    .toString(16)
    .toUpperCase()
    .padStart(4, "0");
}

function buildPixPayload({
  key,
  name,
  city,
  amount,
  txid
}) {
  const pixKey = String(key || "").trim();

  if (!pixKey) {
    throw new Error("A chave Pix não foi configurada.");
  }

  const merchantAccount =
    pixField("00", "br.gov.bcb.pix") +
    pixField("01", pixKey);

  const additionalData =
    pixField(
      "05",
      pixNormalizeText(txid, 25) || "***"
    );

  const payloadWithoutCrc =
    pixField("00", "01") +
    pixField("01", "11") +
    pixField("26", merchantAccount) +
    pixField("52", "0000") +
    pixField("53", "986") +
    pixField("54", Number(amount).toFixed(2)) +
    pixField("58", "BR") +
    pixField("59", pixNormalizeText(name, 25)) +
    pixField("60", pixNormalizeText(city, 15)) +
    pixField("62", additionalData) +
    "6304";

  return payloadWithoutCrc + pixCrc16(payloadWithoutCrc);
}

if (generatePixButton) {
  generatePixButton.addEventListener(
    "click",

    async () => {
      const value =
        Number(
          state.selectedValue ||
            0
        );

      if (
        !(value > 0) ||
        !state.requestKey
      ) {
        return;
      }

      generatePixButton.disabled =
        true;

      generatePixButton.textContent =
        "Gerando PIX...";

      try {
        const pixKey =
          state.settings.pixKey ||
          "";

        const pixName =
          state.settings.pixName ||
          "Ailton Jesus de Souza";

        const pixCity =
          state.settings.pixCity ||
          "Luziania";

        const payload = buildPixPayload({
          key: pixKey,
          name: pixName,
          city: pixCity,
          amount: value,
          // QR estático: "***" é o TXID padrão aceito pelos bancos.
          // A chave interna do Firebase contém hífens e não é um TXID Pix válido.
          txid: "***"
        });

        $("#supportModal")
          ?.classList.remove(
            "open"
          );

        const pixAmount =
          $("#pixAmount");

        if (pixAmount) {
          pixAmount.textContent =
            `Valor: R$ ${value
              .toFixed(2)
              .replace(
                ".",
                ","
              )}`;
        }

        const pixPayload =
          $("#pixPayload");

        if (pixPayload) {
          pixPayload.value =
            payload;
        }

        if (copyPixButton) {
          copyPixButton.textContent =
            "Copiar Pix e ativar prioridade";
        }

        const supportReceiver =
          $("#supportPixReceiver");

        const pixReceiver =
          $("#pixReceiverName");

        if (supportReceiver) {
          supportReceiver.textContent =
            pixName;
        }

        if (pixReceiver) {
          pixReceiver.textContent =
            pixName;
        }

        $("#pixModal")
          ?.classList.add(
            "open"
          );
      } catch (error) {
        console.error(
          "Erro ao gerar PIX:",
          error
        );

        alert(
          "Não foi possível gerar o PIX. O pedido já foi enviado normalmente."
        );
      } finally {
        generatePixButton.disabled =
          false;

        generatePixButton.textContent =
          "Gerar Pix";
      }
    }
  );
}


/* =====================================================
   REGISTRAR PEDIDO E PRIORIDADE
===================================================== */

async function commitPendingRequest(tipValue = 0) {
  if (state.requestCommitted) {
    return;
  }

  if (!state.requestKey || !state.pendingRequest) {
    throw new Error("Não há pedido pendente para registrar.");
  }

  const value =
    Number.isFinite(Number(tipValue)) && Number(tipValue) > 0
      ? Number(tipValue)
      : 0;

  await set(
    ref(db, `requests/${state.requestKey}`),
    {
      ...state.pendingRequest,
      tipValue: value,
      priority: value > 0,
      priorityActivatedAt:
        value > 0 ? Date.now() : null
    }
  );

  state.requestCommitted = true;
}


/* =====================================================
   COPIAR PIX
===================================================== */

if (copyPixButton) {
  copyPixButton.addEventListener(
    "click",

    async () => {
      const pixField =
        $("#pixPayload");

      const pixPayload =
        pixField?.value || "";

      if (!pixPayload) {
        return;
      }

      try {
        await navigator.clipboard
          .writeText(
            pixPayload
          );

        await commitPendingRequest(
          state.selectedValue
        );

        copyPixButton.textContent =
          "Copiado! • Prioridade ativada";
      } catch (error) {
        console.error(
          "Erro ao copiar PIX:",
          error
        );

        if (pixField) {
          pixField.focus();

          pixField.select();

          const copied =
            document.execCommand(
              "copy"
            );

          if (!copied) {
            throw new Error(
              "O navegador não confirmou a cópia do Pix."
            );
          }

          await commitPendingRequest(
            state.selectedValue
          );

          copyPixButton.textContent =
            "Copiado! • Prioridade ativada";
        }
      }
    }
  );
}


/* =====================================================
   FINALIZAR
===================================================== */

if (finishPixButton) {
  finishPixButton.addEventListener(
    "click",

    async () => {
      try {
        await commitPendingRequest(0);
      } catch (error) {
        console.error("Erro ao finalizar pedido:", error);
        alert("Não foi possível registrar o pedido. Tente novamente.");
        return;
      }

      $("#pixModal")
        ?.classList.remove(
          "open"
        );

      showDone(
        "Seu pedido foi recebido. Obrigado por apoiar o artista."
      );
    }
  );
}

if (skipSupportButton) {
  skipSupportButton.addEventListener(
    "click",

    async () => {
      try {
        await commitPendingRequest(0);
      } catch (error) {
        console.error("Erro ao registrar pedido sem apoio:", error);
        alert("Não foi possível registrar o pedido. Tente novamente.");
        return;
      }

      $("#supportModal")
        ?.classList.remove(
          "open"
        );

      showDone(
        "Seu pedido foi recebido pelo Ailton Souza."
      );
    }
  );
}

if (doneButton) {
  doneButton.addEventListener(
    "click",

    () => {
      $("#doneModal")
        ?.classList.remove(
          "open"
        );
    }
  );
}

function showDone(text) {
  const doneText =
    $("#doneText");

  const doneModal =
    $("#doneModal");

  if (doneText) {
    doneText.textContent =
      text;
  }

  if (doneModal) {
    doneModal.classList.add(
      "open"
    );
  }
}


/* =====================================================
   INICIAR
===================================================== */

loadInitial().catch(
  (error) => {
    console.error(
      "Erro ao carregar repertório:",
      error
    );

    const playlistList =
      $("#playlistList");

    if (playlistList) {
      playlistList.innerHTML = `
        <div class="card">

          <h3>
            Não foi possível carregar o repertório
          </h3>

          <p class="muted">
            ${esc(
              error.message
            )}
          </p>

        </div>
      `;
    }
  }
);
