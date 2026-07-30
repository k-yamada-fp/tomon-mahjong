const DEFAULT_PARTICIPANTS = ["小林秀利", "中川隆嗣", "川上明則", "上和野秀夫", "長野英樹", "玉井幸一郎", "山内隆", "古谷正芳", "古賀哲平", "山田浩平", "山口直樹", "山下章則", "鴫原敬幸", "小林隆太", "坂本章彦", "土部　秀則", "小倉豪太郎", "大沼瑞生", "大島花", "赤瀬公平"];
const DEFAULT_ROUNDS = {"1": [{"table": 1, "players": ["鴫原敬幸", "中川隆嗣", "大島花", "赤瀬公平"]}, {"table": 2, "players": ["山田浩平", "古谷正芳", "小林秀利", "山内隆"]}, {"table": 3, "players": ["長野英樹", "上和野秀夫", "川上明則", "小林隆太"]}, {"table": 4, "players": ["土部　秀則", "古賀哲平", "山口直樹", "山下章則"]}, {"table": 5, "players": ["玉井幸一郎", "坂本章彦", "小倉豪太郎", "大沼瑞生"]}], "2": [{"table": 1, "players": ["坂本章彦", "山口直樹", "赤瀬公平", "小林秀利"]}, {"table": 2, "players": ["大島花", "小林隆太", "山下章則", "古谷正芳"]}, {"table": 3, "players": ["小倉豪太郎", "鴫原敬幸", "土部　秀則", "長野英樹"]}, {"table": 4, "players": ["大沼瑞生", "山田浩平", "古賀哲平", "上和野秀夫"]}, {"table": 5, "players": ["山内隆", "川上明則", "玉井幸一郎", "中川隆嗣"]}], "3": [{"table": 1, "players": ["山下章則", "赤瀬公平", "山田浩平", "小倉豪太郎"]}, {"table": 2, "players": ["古賀哲平", "山内隆", "長野英樹", "坂本章彦"]}, {"table": 3, "players": ["山口直樹", "大島花", "上和野秀夫", "玉井幸一郎"]}, {"table": 4, "players": ["古谷正芳", "大沼瑞生", "鴫原敬幸", "川上明則"]}, {"table": 5, "players": ["小林隆太", "小林秀利", "中川隆嗣", "土部　秀則"]}], "4": [{"table": 1, "players": ["赤瀬公平", "玉井幸一郎", "小林隆太", "古賀哲平"]}, {"table": 2, "players": ["上和野秀夫", "山下章則", "山内隆", "鴫原敬幸"]}, {"table": 3, "players": ["川上明則", "土部　秀則", "坂本章彦", "山田浩平"]}, {"table": 4, "players": ["中川隆嗣", "小倉豪太郎", "古谷正芳", "山口直樹"]}, {"table": 5, "players": ["小林秀利", "長野英樹", "大沼瑞生", "大島花"]}]};

const STORAGE_KEY = "mahjongTournamentPrototype.v11";
const SUPABASE_URL = "https://nxctkqhbwzctwesugyzr.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_wOcvu_fogdwTIJnzaoqMkA_lPtmpxnJ";
const TOURNAMENT_ID = "tomon-mahjong-2026-08-01";
const SUPABASE_TABLE = "tournament_states";

const ADMIN_PASSWORD = "ftomon";
const ADMIN_SESSION_KEY = "mahjongAdminUnlocked.v1";
const SEATS = ["東", "南", "西", "北"];
const TABLE_LABELS = ["A", "B", "C", "D", "E"];

function tableLabel(tableNumber) {
  return `${TABLE_LABELS[Number(tableNumber) - 1] || tableNumber}卓`;
}

function isAdminUnlocked() {
  return sessionStorage.getItem(ADMIN_SESSION_KEY) === "1";
}


function freshState() {
  const participants = DEFAULT_PARTICIPANTS.map((name, i) => ({ id: i + 1, name }));
  const nameToId = Object.fromEntries(participants.map(p => [p.name, p.id]));
  const rounds = {};
  for (let r = 1; r <= 6; r++) {
    rounds[r] = [];
    for (let t = 1; t <= 5; t++) {
      const source = DEFAULT_ROUNDS[String(r)]?.[t - 1]?.players || [];
      rounds[r].push({
        table: t,
        players: source.map(name => nameToId[name] || null),
        scores: [null, null, null, null],
        generatedFromRank: null
      });
    }
  }
  return {
    tournamentName: "2026年8月1日（土）第6回稲門会麻雀大会",
    participants,
    rounds,
    currentRound: 1,
    activeTab: "matchups",
    resultSort: "rank",
    seatPolicy: {
      5: "east_first",
      6: "east_first"
    },
    updatedAt: null
  };
}

let state = loadState();
let supabaseClient = null;
let remoteSaveTimer = null;
let isApplyingRemoteState = false;
let lastRemoteUpdatedAt = null;


function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return freshState();
    const parsed = JSON.parse(raw);
    if (!parsed.seatPolicy) parsed.seatPolicy = { 5: "east_first", 6: "east_first" };
    if (!parsed.seatPolicy[5]) parsed.seatPolicy[5] = "east_first";
    if (!parsed.seatPolicy[6]) parsed.seatPolicy[6] = "east_first";
    if (parsed.activeTab === "master" && !isAdminUnlocked()) parsed.activeTab = "matchups";
    return parsed;
  } catch (e) {
    console.warn("保存データを読み込めませんでした。", e);
    return freshState();
  }
}

function setConnectionStatus(message, type = "neutral") {
  const el = document.querySelector("#connection-status");
  if (!el) return;
  el.textContent = message;
  el.dataset.type = type;
}

function buildSharedState() {
  return {
    tournamentName: state.tournamentName,
    participants: state.participants,
    rounds: state.rounds,
    seatPolicy: state.seatPolicy,
    updatedAt: state.updatedAt
  };
}

function mergeSharedState(shared) {
  if (!shared || typeof shared !== "object") return;

  if (typeof shared.tournamentName === "string") state.tournamentName = shared.tournamentName;
  if (Array.isArray(shared.participants)) state.participants = shared.participants;
  if (shared.rounds && typeof shared.rounds === "object") state.rounds = shared.rounds;
  if (shared.seatPolicy && typeof shared.seatPolicy === "object") state.seatPolicy = shared.seatPolicy;
  if (shared.updatedAt) state.updatedAt = shared.updatedAt;

  participantDraft = null;
  participantDraftDirty = false;
}

async function initializeSupabase() {
  try {
    if (!window.supabase?.createClient) {
      throw new Error("Supabaseライブラリを読み込めませんでした。");
    }

    supabaseClient = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_PUBLISHABLE_KEY
    );

    setConnectionStatus("共有データを読込中…", "loading");
    await loadRemoteState();
  } catch (error) {
    console.error(error);
    setConnectionStatus("共有接続に失敗・この端末内で保存", "error");
    render();
  }
}

async function loadRemoteState() {
  const { data, error } = await supabaseClient
    .from(SUPABASE_TABLE)
    .select("data, updated_at")
    .eq("tournament_id", TOURNAMENT_ID)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    await saveRemoteState(true);
    setConnectionStatus("共有保存を開始しました", "success");
    render();
    return;
  }

  isApplyingRemoteState = true;
  mergeSharedState(data.data);
  lastRemoteUpdatedAt = data.updated_at || null;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  isApplyingRemoteState = false;

  setConnectionStatus("共有データを読込済み", "success");
  render();
}

function scheduleRemoteSave() {
  if (!supabaseClient || isApplyingRemoteState) return;

  clearTimeout(remoteSaveTimer);
  setConnectionStatus("共有保存中…", "loading");

  remoteSaveTimer = setTimeout(() => {
    saveRemoteState(false).catch(error => {
      console.error(error);
      setConnectionStatus("共有保存に失敗・端末内には保存済み", "error");
    });
  }, 250);
}

async function saveRemoteState(isInitial = false) {
  if (!supabaseClient) return;

  const payload = buildSharedState();
  const { data, error } = await supabaseClient
    .from(SUPABASE_TABLE)
    .upsert({
      tournament_id: TOURNAMENT_ID,
      data: payload,
      updated_at: new Date().toISOString()
    }, {
      onConflict: "tournament_id"
    })
    .select("updated_at")
    .single();

  if (error) throw error;

  lastRemoteUpdatedAt = data?.updated_at || null;
  setConnectionStatus(
    isInitial ? "共有保存を開始しました" : "共有保存済み",
    "success"
  );
}

async function refreshFromSharedData() {
  if (!supabaseClient) {
    alert("共有データへ接続できていません。");
    return;
  }

  const ok = confirm("共有データを再読み込みします。この端末で未共有の変更がある場合は上書きされます。よろしいですか？");
  if (!ok) return;

  try {
    setConnectionStatus("共有データを再読込中…", "loading");
    await loadRemoteState();
  } catch (error) {
    console.error(error);
    setConnectionStatus("共有データの再読込に失敗", "error");
    alert("共有データを再読み込みできませんでした。");
  }
}

function startSharedPolling() {
  setInterval(async () => {
    if (!supabaseClient || document.hidden || participantDraftDirty) return;

    try {
      const { data, error } = await supabaseClient
        .from(SUPABASE_TABLE)
        .select("data, updated_at")
        .eq("tournament_id", TOURNAMENT_ID)
        .maybeSingle();

      if (error || !data) return;
      if (!lastRemoteUpdatedAt || data.updated_at > lastRemoteUpdatedAt) {
        isApplyingRemoteState = true;
        mergeSharedState(data.data);
        lastRemoteUpdatedAt = data.updated_at;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        isApplyingRemoteState = false;
        setConnectionStatus("最新データへ更新しました", "success");
        render();
      }
    } catch (error) {
      console.warn("共有データの自動確認に失敗しました。", error);
    }
  }, 5000);
}

function saveState() {
  state.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  updateSaveStatus();
  scheduleRemoteSave();
}

function participantById(id) {
  return state.participants.find(p => p.id === Number(id));
}

function displayName(id) {
  return participantById(id)?.name || "未設定";
}

function updateSaveStatus() {
  const el = document.querySelector("#save-status");
  if (!el) return;
  if (!state.updatedAt) {
    el.textContent = "未保存";
    return;
  }
  const d = new Date(state.updatedAt);
  el.textContent = `端末内保存 ${d.toLocaleTimeString("ja-JP", {hour:"2-digit", minute:"2-digit"})}`;
}

function render() {
  document.querySelector("#home-title").addEventListener("click", () => {
  if (state.activeTab === "master" && participantDraftDirty) {
    const leave = confirm("参加者マスタに未反映の変更があります。破棄してトップへ戻りますか？");
    if (!leave) return;
    discardParticipantDraft();
  }
  state.activeTab = "matchups";
  saveState();
  render();
});

document.querySelectorAll("[data-tab]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === state.activeTab);
  });
  document.querySelectorAll(".view").forEach(v => v.hidden = true);
  document.querySelector(`#view-${state.activeTab}`).hidden = false;

  renderRoundTabs();
  renderMatchups();
  renderParticipants();
  renderResults();
  updateSaveStatus();
}

function renderRoundTabs() {
  const holder = document.querySelector("#round-tabs");
  holder.innerHTML = "";
  for (let r = 1; r <= 6; r++) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "round-tab" + (state.currentRound === r ? " active" : "");
    btn.textContent = `第${r}回戦`;
    btn.addEventListener("click", () => {
      state.currentRound = r;
      saveState();
      render();
    });
    holder.appendChild(btn);
  }
}

function roundComplete(round) {
  return state.rounds[round].every(table =>
    table.players.every(Boolean) &&
    table.scores.every(v => typeof v === "number" && Number.isFinite(v))
  );
}

function roundHasAnyScore(round) {
  return state.rounds[round].some(table =>
    table.scores.some(v => typeof v === "number" && Number.isFinite(v))
  );
}

function hasAnyScoreThrough(roundLimit) {
  for (let r = 1; r <= roundLimit; r++) {
    if (roundHasAnyScore(r)) return true;
  }
  return false;
}

function getCompletedRound() {
  let completed = 0;
  for (let r = 1; r <= 6; r++) {
    if (roundComplete(r)) completed = r;
    else break;
  }
  return completed;
}

function renderMatchups() {
  const r = state.currentRound;
  const meta = document.querySelector("#round-meta");
  const complete = roundComplete(r);
  meta.innerHTML = `
    <span class="status ${complete ? "done" : ""}">${complete ? "全卓入力済み" : "入力途中"}</span>
    <span>第${r}回戦・5卓</span>
  `;

  const actions = document.querySelector("#round-actions");
  actions.innerHTML = "";

  const grid = document.querySelector("#table-grid");
  grid.innerHTML = "";
  state.rounds[r].forEach((table, tableIndex) => {
    const card = document.createElement("article");
    card.className = "table-card";
    const scoreTotal = table.scores.every(v => typeof v === "number")
      ? table.scores.reduce((a,b) => a+b, 0)
      : null;

    card.innerHTML = `
      <div class="table-card-head">
        <div>
          <span class="eyebrow">第${r}回戦</span>
          <h3>${tableLabel(table.table)}</h3>
        </div>
        <button class="edit-button" data-edit="${tableIndex}">編集</button>
      </div>
      <div class="seat-list">
        ${SEATS.map((seat, i) => `
          <div class="seat-row">
            <span class="seat">${seat}</span>
            <span class="player">${displayName(table.players[i])}</span>
            <span class="score ${table.scores[i] > 0 ? "plus" : table.scores[i] < 0 ? "minus" : ""}">
              ${table.scores[i] === null ? "—" : formatScore(table.scores[i])}
            </span>
          </div>
        `).join("")}
      </div>
      <div class="table-total ${scoreTotal !== null && Math.abs(scoreTotal) > 0.05 ? "warning" : ""}">
        合計：${scoreTotal === null ? "—" : formatScore(scoreTotal)}
      </div>
    `;
    card.querySelector("[data-edit]").addEventListener("click", () => openScoreModal(r, tableIndex));
    grid.appendChild(card);
  });
}


function aggregateThrough(roundLimit) {
  const map = new Map(state.participants.map(p => [p.id, {
    id: p.id, name: p.name, rounds: Array(6).fill(null), total: 0
  }]));
  for (let r = 1; r <= roundLimit; r++) {
    state.rounds[r].forEach(table => {
      table.players.forEach((pid, i) => {
        if (!pid || !map.has(pid)) return;
        const score = table.scores[i];
        if (typeof score === "number" && Number.isFinite(score)) {
          map.get(pid).rounds[r - 1] = score;
          map.get(pid).total += score;
        }
      });
    });
  }
  return [...map.values()];
}

function rankedThrough(roundLimit) {
  return aggregateThrough(roundLimit).sort((a,b) => {
    if (b.total !== a.total) return b.total - a.total;
    return a.id - b.id;
  }).map((row, i) => ({...row, rank: i + 1}));
}

function generateRankRound(round) {
  const sourceRound = round - 1;
  const canGenerate = round === 5 ? hasAnyScoreThrough(4) : roundHasAnyScore(5);

  if (!canGenerate) {
    alert(round === 5
      ? "第1～4回戦の得点を1つ以上入力してください。"
      : "第5回戦の得点を1つ以上入力してください。");
    return;
  }

  const hasScores = roundHasAnyScore(round);
  if (hasScores) {
    alert(`第${round}回戦には得点が入力されているため、組み合わせを再反映できません。`);
    return;
  }

  const alreadyGenerated = state.rounds[round].some(table => table.players.some(Boolean));
  if (alreadyGenerated) {
    const ok = confirm(`第${round}回戦の組み合わせを、現在順位で上書きします。よろしいですか？`);
    if (!ok) return;
  }

  const ranked = rankedThrough(sourceRound);

  for (let t = 0; t < 5; t++) {
    const group = ranked.slice(t * 4, t * 4 + 4);
    const displayOrder = state.seatPolicy[round] === "north_first"
      ? [...group].reverse()
      : group;

    state.rounds[round][t].players = displayOrder.map(x => x.id);
    state.rounds[round][t].scores = [null, null, null, null];
    state.rounds[round][t].generatedFromRank = displayOrder.map(x => x.rank);
  }

  saveState();
  render();
}

function applySeatPolicy(round, policy) {
  if (round !== 5 && round !== 6) return;
  if (!state.seatPolicy) state.seatPolicy = { 5: "east_first", 6: "east_first" };

  if (roundHasAnyScore(round)) {
    alert(`第${round}回戦には得点が入力されているため、席順設定を変更できません。`);
    render();
    return;
  }

  state.seatPolicy[round] = policy;
  saveState();
  render();
}

function openScoreModal(round, tableIndex) {
  const table = state.rounds[round][tableIndex];
  const modal = document.querySelector("#score-modal");
  document.querySelector("#modal-title").textContent = `第${round}回戦・${tableLabel(table.table)}`;
  const body = document.querySelector("#score-form-body");
  body.innerHTML = "";

  table.players.forEach((pid, i) => {
    const row = document.createElement("div");
    row.className = "modal-score-row";
    row.innerHTML = `
      <div class="modal-player">
        <span class="seat">${SEATS[i]}</span>
        <span>${displayName(pid)}</span>
      </div>
      <input type="number" step="0.1" inputmode="decimal"
        value="${table.scores[i] ?? ""}" data-score-index="${i}" placeholder="0.0">
    `;
    body.appendChild(row);
  });

  const totalEl = document.querySelector("#modal-total");
  const updateTotal = () => {
    const values = [...body.querySelectorAll("input")].map(input =>
      input.value.trim() === "" ? null : Number(input.value)
    );
    const valid = values.every(v => typeof v === "number" && Number.isFinite(v));
    const total = valid ? values.reduce((a,b) => a+b, 0) : null;
    totalEl.textContent = `合計：${total === null ? "—" : formatScore(total)}`;
    totalEl.classList.toggle("warning", total !== null && Math.abs(total) > 0.05);
  };
  body.querySelectorAll("input").forEach(input => input.addEventListener("input", updateTotal));
  updateTotal();

  document.querySelector("#score-clear").onclick = () => {
    body.querySelectorAll("input").forEach(input => {
      input.value = "";
    });
    updateTotal();
    const firstInput = body.querySelector("input");
    if (firstInput) firstInput.focus();
  };

  document.querySelector("#score-save").onclick = () => {
    const values = [...body.querySelectorAll("input")].map(input =>
      input.value.trim() === "" ? null : Number(input.value)
    );
    if (values.some(v => v === null || !Number.isFinite(v))) {
      alert("4人分の得点を入力してください。");
      return;
    }
    const total = values.reduce((a,b) => a+b, 0);
    if (Math.abs(total) > 0.05) {
      const ok = confirm(`4人の合計が ${formatScore(total)} です。このまま保存しますか？`);
      if (!ok) return;
    }
    table.scores = values;
    saveState();
    modal.close();
    render();
  };
  modal.showModal();
}

let participantDraft = null;
let participantDraftDirty = false;

function ensureParticipantDraft() {
  if (!participantDraft) {
    participantDraft = state.participants.map(p => ({ ...p }));
    participantDraftDirty = false;
  }
}

function discardParticipantDraft() {
  participantDraft = state.participants.map(p => ({ ...p }));
  participantDraftDirty = false;
}

function renderParticipants() {
  ensureParticipantDraft();

  const tbody = document.querySelector("#participant-body");
  tbody.innerHTML = "";

  participantDraft.forEach((p, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${p.id}</td>
      <td><input type="text" value="${escapeHtml(p.name)}" data-participant="${i}"></td>
    `;

    tr.querySelector("input").addEventListener("input", e => {
      participantDraft[i].name = e.target.value;
      participantDraftDirty = participantDraft.some((draft, index) =>
        draft.name !== state.participants[index].name
      );
      updateParticipantApplyState();
    });

    tbody.appendChild(tr);
  });

  updateParticipantApplyState();
  renderSetupRounds();
}

function updateParticipantApplyState() {
  const button = document.querySelector("#apply-participant-changes");
  const notice = document.querySelector("#participant-change-status");
  if (!button || !notice) return;

  button.disabled = !participantDraftDirty;
  notice.textContent = participantDraftDirty
    ? "未反映の変更があります"
    : "変更はありません";
  notice.classList.toggle("has-changes", participantDraftDirty);
}

function applyParticipantChanges() {
  ensureParticipantDraft();

  const emptyName = participantDraft.find(p => !p.name.trim());
  if (emptyName) {
    alert(`参加者${String(emptyName.id).padStart(2, "0")}の氏名が空欄です。`);
    return;
  }

  const duplicateNames = participantDraft
    .map(p => p.name.trim())
    .filter((name, index, names) => names.indexOf(name) !== index);

  if (duplicateNames.length) {
    const ok = confirm(`同じ氏名が含まれています（${[...new Set(duplicateNames)].join("、")}）。このまま反映しますか？`);
    if (!ok) return;
  }

  state.participants = participantDraft.map(p => ({
    id: p.id,
    name: p.name.trim()
  }));

  participantDraft = state.participants.map(p => ({ ...p }));
  participantDraftDirty = false;
  saveState();
  render();
  alert("参加者マスタの修正を反映しました。");
}

function renderSetupRounds() {
  const holder = document.querySelector("#setup-rounds");
  holder.innerHTML = "";

  for (let r = 1; r <= 6; r++) {
    const section = document.createElement("section");
    section.className = "setup-round";

    if (r >= 5) {
      const policy = state.seatPolicy?.[r] || "east_first";
      const locked = roundHasAnyScore(r);
      section.innerHTML = `
        <div class="setup-round-head">
          <div>
            <h3>第${r}回戦</h3>
            <p class="seat-policy-note">
              ${policy === "north_first"
                ? "上位順：北 → 西 → 南 → 東"
                : "上位順：東 → 南 → 西 → 北"}
            </p>
          </div>
          <div class="round-control-group">
            <label class="seat-policy-switch ${locked ? "is-disabled" : ""}">
              <input type="checkbox" data-seat-policy-round="${r}"
                ${policy === "north_first" ? "checked" : ""}
                ${locked ? "disabled" : ""}>
              <span>1位を北家にする</span>
            </label>
            <button type="button" class="primary reflect-round-button"
              data-reflect-round="${r}" ${locked ? "disabled" : ""}>
              組み合わせを反映
            </button>
          </div>
        </div>
      `;
      section.querySelector("[data-seat-policy-round]").addEventListener("change", e => {
        applySeatPolicy(r, e.target.checked ? "north_first" : "east_first");
      });
      section.querySelector("[data-reflect-round]").addEventListener("click", () => {
        generateRankRound(r);
      });
    } else {
      section.innerHTML = `<h3>第${r}回戦</h3>`;
    }

    const hasPlayers = state.rounds[r].some(match => match.players.some(Boolean));
    if (r >= 5 && !hasPlayers) {
      const pending = document.createElement("div");
      pending.className = "round-pending";
      pending.textContent = r === 5
        ? "席順を選び、「組み合わせを反映」を押すと第1～4回戦の現在順位から作成されます。"
        : "席順を選び、「組み合わせを反映」を押すと第5回戦終了時点の現在順位から作成されます。";
      section.appendChild(pending);
      holder.appendChild(section);
      continue;
    }

    const table = document.createElement("table");
    table.className = "setup-table";
    table.innerHTML = `<thead><tr><th>卓</th>${SEATS.map(s => `<th>${s}</th>`).join("")}</tr></thead>`;
    const tbody = document.createElement("tbody");

    state.rounds[r].forEach((match, ti) => {
      const tr = document.createElement("tr");

      if (r <= 4) {
        tr.innerHTML = `<td>${tableLabel(match.table)}</td>` + match.players.map((pid, si) => `
          <td><select data-r="${r}" data-t="${ti}" data-s="${si}">
            <option value="">未設定</option>
            ${state.participants.map(p => `<option value="${p.id}" ${p.id === pid ? "selected" : ""}>${p.id}. ${escapeHtml(p.name)}</option>`).join("")}
          </select></td>
        `).join("");

        tr.querySelectorAll("select").forEach(sel => sel.addEventListener("change", e => {
          const rr = Number(e.target.dataset.r);
          const tt = Number(e.target.dataset.t);
          const ss = Number(e.target.dataset.s);
          state.rounds[rr][tt].players[ss] = e.target.value ? Number(e.target.value) : null;
          saveState();
          render();
        }));
      } else {
        tr.innerHTML = `<td>${tableLabel(match.table)}</td>` + match.players.map(pid => `
          <td><span class="readonly-player">${escapeHtml(displayName(pid))}</span></td>
        `).join("");
      }

      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    section.appendChild(table);
    holder.appendChild(section);
  }
}

function renderResults() {
  const completed = getCompletedRound();
  const through = Math.max(completed, 1);
  document.querySelector("#result-period").textContent =
    completed ? `第${completed}回戦終了時点` : "得点未入力";

  document.querySelectorAll("[data-sort]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.sort === state.resultSort);
  });

  let rows = aggregateThrough(6);
  const ranking = rankedThrough(6);
  const rankMap = new Map(ranking.map(x => [x.id, x.rank]));
  rows = rows.map(x => ({...x, rank: rankMap.get(x.id)}));
  if (state.resultSort === "rank") rows.sort((a,b) => a.rank - b.rank);
  else rows.sort((a,b) => a.id - b.id);

  const tbody = document.querySelector("#result-body");
  tbody.innerHTML = rows.map(row => `
    <tr>
      <td>${row.rank}</td>
      <td>${row.id}</td>
      <td class="name-cell">${escapeHtml(row.name)}</td>
      ${row.rounds.map(v => `<td class="${v > 0 ? "plus" : v < 0 ? "minus" : ""}">${v === null ? "—" : formatScore(v)}</td>`).join("")}
      <td>${formatScore(sumRoundScores(row.rounds, 4))}</td>
      <td>${formatScore(sumRoundScores(row.rounds, 5))}</td>
      <td class="total-cell ${row.total > 0 ? "plus" : row.total < 0 ? "minus" : ""}">${formatScore(row.total)}</td>
    </tr>
  `).join("");
}

function sumRoundScores(rounds, count) {
  return rounds.slice(0, count).reduce((sum, v) => sum + (typeof v === "number" ? v : 0), 0);
}

function formatScore(n) {
  const value = Math.abs(n) < 0.0001 ? 0 : n;
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

document.querySelectorAll("[data-tab]").forEach(btn => btn.addEventListener("click", () => {
  const nextTab = btn.dataset.tab;

  if (state.activeTab === "master" && nextTab !== "master" && participantDraftDirty) {
    const leave = confirm("参加者マスタに未反映の変更があります。破棄して移動しますか？");
    if (!leave) return;
    discardParticipantDraft();
  }

  if (nextTab === "master" && !isAdminUnlocked()) {
    const entered = prompt("管理用パスワードを入力してください。");
    if (entered === null) return;
    if (entered !== ADMIN_PASSWORD) {
      alert("パスワードが違います。");
      return;
    }
    sessionStorage.setItem(ADMIN_SESSION_KEY, "1");
  }
  state.activeTab = nextTab;
  saveState();
  render();
}));

document.querySelectorAll("[data-sort]").forEach(btn => btn.addEventListener("click", () => {
  state.resultSort = btn.dataset.sort;
  saveState();
  render();
}));

document.querySelector("#score-cancel").addEventListener("click", () => {
  document.querySelector("#score-modal").close();
});

document.querySelector("#apply-participant-changes").addEventListener("click", applyParticipantChanges);

document.querySelector("#refresh-shared-data").addEventListener("click", refreshFromSharedData);

document.querySelector("#reset-data").addEventListener("click", () => {
  if (!confirm("参加者名、組み合わせ、得点をすべて初期状態に戻します。よろしいですか？")) return;
  state = freshState();
  discardParticipantDraft();
  saveState();
  render();
});

document.querySelector("#export-data").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], {type:"application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `mahjong-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

document.querySelector("#import-file").addEventListener("change", async e => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    if (!parsed.participants || !parsed.rounds) throw new Error("形式が違います");
    if (!parsed.seatPolicy) parsed.seatPolicy = { 5: "east_first", 6: "east_first" };
    state = parsed;
    discardParticipantDraft();
    saveState();
    render();
  } catch (err) {
    alert("バックアップファイルを読み込めませんでした。");
  } finally {
    e.target.value = "";
  }
});

render();
initializeSupabase();
startSharedPolling();
