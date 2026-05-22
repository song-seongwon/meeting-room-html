// ============================================================
// 63빌딩 3층 회의실 예약 시스템
// 순수 HTML + Supabase JS (빌드 과정 없음)
// ============================================================

const ROOMS = [
  { id: "3", name: "회의실 3", color: "var(--room-3)" },
  { id: "4", name: "회의실 4", color: "var(--room-4)" },
  { id: "5", name: "회의실 5", color: "var(--room-5)" },
  { id: "7", name: "회의실 7", color: "var(--room-7)" },
];

const START_HOUR = 9;   // 운영 시작 09:00
const END_HOUR = 18;    // 운영 종료 18:00
const SLOT_MIN = 30;    // 30분 단위
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

let sb = null;                 // Supabase client
let viewMode = "day";          // 'day' | 'week'
let currentDate = todayStr();  // 기준 날짜 'YYYY-MM-DD'
let weekRoom = "3";            // 주별 보기에서 선택된 회의실
let reservations = [];         // 현재 보이는 범위의 예약 목록
let columns = [];              // 현재 화면 컬럼 정의
let modalCtx = null;           // { roomId, date }

// ---------- 날짜/시간 유틸 ----------
function todayStr() { return ymd(new Date()); }
function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function parseDate(str) {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function shiftDate(str, days) {
  const d = parseDate(str);
  d.setDate(d.getDate() + days);
  return ymd(d);
}
function prettyDate(str) {
  const d = parseDate(str);
  return `${str} (${WEEKDAYS[d.getDay()]})`;
}
// 기준 날짜가 속한 주의 월요일
function weekStart(str) {
  const d = parseDate(str);
  const dow = (d.getDay() + 6) % 7; // 월=0
  d.setDate(d.getDate() - dow);
  return ymd(d);
}
function weekDates(str) {
  const start = parseDate(weekStart(str));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return ymd(d);
  });
}
function toMin(t) { const [h, m] = t.split(":").map(Number); return h * 60 + m; }
function toTime(min) {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

const SLOT_H = () =>
  parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--slot-h"));
const TOTAL_MIN = (END_HOUR - START_HOUR) * 60;
const BODY_H = () => (TOTAL_MIN / SLOT_MIN) * SLOT_H();
function roomById(id) { return ROOMS.find((r) => r.id === id) || { name: `회의실 ${id}`, color: "#888" }; }

// ---------- 초기화 ----------
function init() {
  const cfg = window.SUPABASE_CONFIG || {};
  const configured =
    cfg.url && cfg.anonKey &&
    !cfg.url.includes("YOUR_SUPABASE") &&
    !cfg.anonKey.includes("YOUR_SUPABASE");

  if (!configured) {
    document.getElementById("setupBanner").hidden = false;
    document.getElementById("loading").textContent = "config.js 설정 후 새로고침 해주세요.";
    return;
  }

  sb = window.supabase.createClient(cfg.url, cfg.anonKey);

  // 보기 전환
  document.getElementById("viewDay").addEventListener("click", () => setView("day"));
  document.getElementById("viewWeek").addEventListener("click", () => setView("week"));

  // 날짜 컨트롤
  const picker = document.getElementById("datePicker");
  picker.value = currentDate;
  picker.addEventListener("change", () => setDate(picker.value));
  document.getElementById("prevDay").addEventListener("click", () => navigate(-1));
  document.getElementById("nextDay").addEventListener("click", () => navigate(1));
  document.getElementById("todayBtn").addEventListener("click", () => setDate(todayStr()));

  // 모달
  document.getElementById("closeModal").addEventListener("click", closeModal);
  document.getElementById("cancelBtn").addEventListener("click", closeModal);
  document.getElementById("modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });
  document.getElementById("startTime").addEventListener("change", () => { syncEndOptions(); updateConflictPreview(); });
  document.getElementById("endTime").addEventListener("change", updateConflictPreview);
  document.getElementById("bookingForm").addEventListener("submit", submitBooking);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

  rebuild();
  subscribeRealtime();
}

// 보기 모드 변경
function setView(mode) {
  if (viewMode === mode) return;
  viewMode = mode;
  document.getElementById("viewDay").classList.toggle("is-active", mode === "day");
  document.getElementById("viewWeek").classList.toggle("is-active", mode === "week");
  rebuild();
}

// 날짜 직접 지정
function setDate(str) {
  currentDate = str;
  document.getElementById("datePicker").value = str;
  rebuild();
}

// 이전/다음 (일별 ±1일, 주별 ±7일)
function navigate(dir) {
  setDate(shiftDate(currentDate, dir * (viewMode === "week" ? 7 : 1)));
}

// 컬럼 정의 + 보드 재구성 + 데이터 로딩
function rebuild() {
  columns = getColumns();
  renderRoomTabs();
  buildShell();
  loadReservations();
}

// 현재 보기에 맞는 컬럼 목록
function getColumns() {
  if (viewMode === "day") {
    return ROOMS.map((r) => ({
      roomId: r.id, date: currentDate,
      label: r.name, sub: null, color: r.color, dot: true,
      isToday: currentDate === todayStr(),
    }));
  }
  const room = roomById(weekRoom);
  return weekDates(currentDate).map((d) => {
    const dt = parseDate(d);
    return {
      roomId: weekRoom, date: d,
      label: WEEKDAYS[dt.getDay()], sub: d.slice(5).replace("-", "/"),
      color: room.color, dot: false, isToday: d === todayStr(),
    };
  });
}

// 주별 회의실 탭
function renderRoomTabs() {
  const wrap = document.getElementById("roomTabs");
  if (viewMode !== "week") { wrap.hidden = true; return; }
  wrap.hidden = false;
  wrap.innerHTML = "";
  for (const r of ROOMS) {
    const btn = document.createElement("button");
    btn.className = "room-tab" + (r.id === weekRoom ? " is-active" : "");
    if (r.id === weekRoom) btn.style.color = r.color;
    btn.innerHTML = `<span class="room-dot" style="background:${r.color}"></span>${r.name}`;
    btn.addEventListener("click", () => {
      weekRoom = r.id;
      columns = getColumns();
      renderRoomTabs();
      buildShell();
      render(); // 이미 주간 데이터는 로드돼 있으므로 다시 그리기만
    });
    wrap.appendChild(btn);
  }
}

// ---------- 보드 뼈대 ----------
function buildShell() {
  const gutter = document.getElementById("timeGutter");
  const rooms = document.getElementById("rooms");
  gutter.style.height = BODY_H() + "px";
  gutter.innerHTML = "";
  rooms.innerHTML = "";

  for (let m = 0; m <= TOTAL_MIN; m += SLOT_MIN) {
    if (m % 60 !== 0 && m !== TOTAL_MIN) continue;
    const label = document.createElement("div");
    label.className = "time-label";
    label.style.top = (m / SLOT_MIN) * SLOT_H() + "px";
    label.textContent = toTime(START_HOUR * 60 + m);
    gutter.appendChild(label);
  }

  columns.forEach((col, idx) => {
    const colEl = document.createElement("div");
    colEl.className = "room-col";

    const head = document.createElement("div");
    head.className = "room-head" + (col.isToday ? " is-today" : "");
    const dot = col.dot ? `<span class="room-dot" style="background:${col.color}"></span>` : "";
    head.innerHTML = `<span class="head-main">${dot}${col.label}</span>` +
      (col.sub ? `<span class="head-sub">${col.sub}</span>` : "");
    colEl.appendChild(head);

    const body = document.createElement("div");
    body.className = "room-body";
    body.dataset.idx = idx;
    body.style.height = BODY_H() + "px";

    for (let m = 0; m <= TOTAL_MIN; m += SLOT_MIN) {
      const line = document.createElement("div");
      line.className = "slot-line" + (m % 60 === 0 ? " hour" : "");
      line.style.top = (m / SLOT_MIN) * SLOT_H() + "px";
      body.appendChild(line);
    }

    body.addEventListener("click", (e) => {
      if (e.target.closest(".resv")) return;
      const rect = body.getBoundingClientRect();
      const slot = Math.max(0, Math.floor((e.clientY - rect.top) / SLOT_H()));
      openModal(col, START_HOUR * 60 + slot * SLOT_MIN);
    });

    colEl.appendChild(body);
    rooms.appendChild(colEl);
  });

  document.getElementById("board").hidden = false;
}

// ---------- 데이터 ----------
async function loadReservations() {
  const loading = document.getElementById("loading");
  let q = sb.from("reservations").select("*").order("start_time", { ascending: true });
  q = viewMode === "week" ? q.in("res_date", weekDates(currentDate)) : q.eq("res_date", currentDate);

  const { data, error } = await q;
  if (error) {
    loading.hidden = false;
    loading.textContent = "불러오기 실패: " + error.message;
    return;
  }
  loading.hidden = true;
  reservations = data || [];
  render();
}

// 특정 회의실+날짜의 예약만
function reservationsFor(roomId, date) {
  return reservations.filter((r) => r.room === roomId && r.res_date === date);
}

function render() {
  document.querySelectorAll(".room-body").forEach((body) => {
    const col = columns[Number(body.dataset.idx)];
    body.querySelectorAll(".resv, .now-line").forEach((el) => el.remove());

    for (const r of reservationsFor(col.roomId, col.date)) {
      const startMin = toMin(r.start_time) - START_HOUR * 60;
      const endMin = toMin(r.end_time) - START_HOUR * 60;
      const block = document.createElement("div");
      block.className = "resv";
      block.style.top = (startMin / SLOT_MIN) * SLOT_H() + 2 + "px";
      block.style.height = Math.max(((endMin - startMin) / SLOT_MIN) * SLOT_H() - 4, 26) + "px";
      block.style.background = col.color;

      const timeText = `${r.start_time.slice(0, 5)}–${r.end_time.slice(0, 5)}`;
      const meta = [r.reserver_name, r.department].filter(Boolean).join(" · ");
      block.innerHTML = `
        <div class="resv-title">${esc(r.title || "회의")}</div>
        <div class="resv-meta">${esc(meta)}</div>
        <div class="resv-time">${timeText}</div>`;
      block.title = "클릭하면 예약을 취소할 수 있습니다.";
      block.addEventListener("click", (e) => { e.stopPropagation(); cancelReservation(r); });
      body.appendChild(block);
    }

    // 현재 시각 선
    if (col.date === todayStr()) {
      const now = new Date();
      const nowMin = now.getHours() * 60 + now.getMinutes() - START_HOUR * 60;
      if (nowMin >= 0 && nowMin <= TOTAL_MIN) {
        const line = document.createElement("div");
        line.className = "now-line";
        line.style.top = (nowMin / SLOT_MIN) * SLOT_H() + "px";
        body.appendChild(line);
      }
    }
  });
}

// ---------- 예약 모달 ----------
function openModal(col, startMin) {
  modalCtx = { roomId: col.roomId, date: col.date };

  document.getElementById("modalRoom").textContent = roomById(col.roomId).name;
  document.getElementById("modalDate").textContent = prettyDate(col.date);
  document.getElementById("formError").hidden = true;
  document.getElementById("bookingForm").reset();

  const startSel = document.getElementById("startTime");
  startSel.innerHTML = "";
  for (let m = START_HOUR * 60; m < END_HOUR * 60; m += SLOT_MIN) startSel.appendChild(opt(toTime(m)));
  startSel.value = toTime(Math.min(startMin, END_HOUR * 60 - SLOT_MIN));
  syncEndOptions();
  updateConflictPreview();

  document.getElementById("modal").hidden = false;
  setTimeout(() => document.getElementById("reserverName").focus(), 50);
}

function syncEndOptions() {
  const startMin = toMin(document.getElementById("startTime").value);
  const endSel = document.getElementById("endTime");
  const prev = endSel.value;
  endSel.innerHTML = "";
  for (let m = startMin + SLOT_MIN; m <= END_HOUR * 60; m += SLOT_MIN) endSel.appendChild(opt(toTime(m)));
  const want = toTime(Math.min(startMin + 60, END_HOUR * 60));
  endSel.value = [...endSel.options].some((o) => o.value === prev) ? prev
    : ([...endSel.options].some((o) => o.value === want) ? want : endSel.options[0]?.value);
}

// 중복검사 미리보기: 선택한 시간대가 기존 예약과 겹치는지 즉시 표시
function updateConflictPreview() {
  const box = document.getElementById("conflictPreview");
  const submit = document.getElementById("submitBtn");
  if (!modalCtx) return;

  const s = toMin(document.getElementById("startTime").value);
  const e = toMin(document.getElementById("endTime").value);

  if (!(e > s)) {
    box.className = "conflict-preview show bad";
    box.textContent = "⛔ 종료 시간은 시작 시간보다 늦어야 합니다.";
    submit.disabled = true;
    return;
  }

  const conflicts = reservationsFor(modalCtx.roomId, modalCtx.date)
    .filter((r) => toMin(r.start_time) < e && toMin(r.end_time) > s);

  if (conflicts.length === 0) {
    box.className = "conflict-preview show ok";
    box.textContent = "✅ 예약 가능한 시간입니다.";
    submit.disabled = false;
  } else {
    const items = conflicts
      .map((r) => `<li>${r.start_time.slice(0, 5)}–${r.end_time.slice(0, 5)} · ${esc(r.title || "회의")} (${esc(r.reserver_name)})</li>`)
      .join("");
    box.className = "conflict-preview show bad";
    box.innerHTML = `⛔ 다음 예약과 겹칩니다:<ul>${items}</ul>`;
    submit.disabled = true;
  }
}

function opt(v) { const o = document.createElement("option"); o.value = v; o.textContent = v; return o; }

function closeModal() {
  document.getElementById("modal").hidden = true;
  document.getElementById("submitBtn").disabled = false;
  modalCtx = null;
}

async function submitBooking(e) {
  e.preventDefault();
  if (!modalCtx) return;

  const payload = {
    room: modalCtx.roomId,
    res_date: modalCtx.date,
    start_time: document.getElementById("startTime").value,
    end_time: document.getElementById("endTime").value,
    reserver_name: document.getElementById("reserverName").value.trim(),
    department: document.getElementById("department").value.trim() || null,
    title: document.getElementById("title").value.trim() || null,
  };

  if (!payload.reserver_name) return showFormError("예약자 이름을 입력해주세요.");
  if (toMin(payload.end_time) <= toMin(payload.start_time))
    return showFormError("종료 시간은 시작 시간보다 늦어야 합니다.");

  const btn = document.getElementById("submitBtn");
  btn.disabled = true;
  btn.textContent = "예약 중…";

  const { error } = await sb.from("reservations").insert(payload);

  btn.textContent = "예약하기";
  btn.disabled = false;

  if (error) {
    if (error.code === "23P01" || /overlap|no_overlap|exclud/i.test(error.message)) {
      // 미리보기 이후 다른 사람이 먼저 잡은 경우 등
      return showFormError("이미 예약된 시간대입니다. 다른 시간을 선택해주세요.");
    }
    return showFormError("예약 실패: " + error.message);
  }

  closeModal();
  loadReservations();
}

function showFormError(msg) {
  const el = document.getElementById("formError");
  el.textContent = msg;
  el.hidden = false;
}

// ---------- 취소 ----------
async function cancelReservation(r) {
  const who = r.reserver_name + (r.department ? ` (${r.department})` : "");
  const when = `${r.start_time.slice(0, 5)}–${r.end_time.slice(0, 5)}`;
  if (!confirm(`${roomById(r.room).name} · ${r.res_date} ${when}\n"${r.title || "회의"}" · ${who}\n\n이 예약을 취소할까요?`)) return;

  const { error } = await sb.from("reservations").delete().eq("id", r.id);
  if (error) { alert("취소 실패: " + error.message); return; }
  loadReservations();
}

// ---------- 실시간 ----------
function subscribeRealtime() {
  sb.channel("reservations-rt")
    .on("postgres_changes", { event: "*", schema: "public", table: "reservations" }, () => loadReservations())
    .subscribe();
}

// ---------- 헬퍼 ----------
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

document.addEventListener("DOMContentLoaded", init);
