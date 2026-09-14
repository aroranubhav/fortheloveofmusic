/**
 * muse — one song, every day
 *
 * - Picks today's song from songs.json based on date offset
 * - Plays full audio via YouTube IFrame API (hidden player)
 * - Prev/Next browse all songs
 * - Archive loads 20 at a time
 */

// ─── Config ───
const LAUNCH_DATE = new Date("2026-10-01");
const ARCHIVE_PAGE_SIZE = 20;

// ─── State ───
let songs = [];
let todayIndex = 0;
let currentViewIndex = 0;
let currentlyPlayingId = null;
let ytPlayer = null;
let ytReady = false;
let pendingPlay = null;
let progressInterval = null;
let archiveOffset = 0; // how many archive items are currently rendered

// ─── DOM refs ───
const $ = (id) => document.getElementById(id);

// ─── Init ───
async function init() {
  try {
    const res = await fetch("songs.json");
    const data = await res.json();
    songs = data.songs;
  } catch (err) {
    console.error("Failed to load songs.json:", err);
    return;
  }

  if (songs.length === 0) return;

  todayIndex = getTodayIndex();
  renderHero(songs[todayIndex], todayIndex);
  renderArchivePage();
  loadYouTubeAPI();

  // Progress bar seek
  $("progressWrap").onclick = (e) => seekTo(e);

  // Load more button
  $("loadMoreBtn").onclick = () => renderArchivePage();
}

function getTodayIndex() {
  const now = new Date();
  const msPerDay = 1000 * 60 * 60 * 24;
  const startUTC = Date.UTC(LAUNCH_DATE.getFullYear(), LAUNCH_DATE.getMonth(), LAUNCH_DATE.getDate());
  const todayUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const daysSinceLaunch = Math.floor((todayUTC - startUTC) / msPerDay);

  if (daysSinceLaunch < 0) return 0;
  return daysSinceLaunch % songs.length;
}

// ─── Helpers ───
const TITLE_MAX = 40;
const ARTIST_MAX = 30;

function truncate(str, max) {
  if (!str) return "";
  return str.length > max ? str.slice(0, max).trimEnd() + "…" : str;
}

// ─── Render hero ───
function renderHero(song, index) {
  currentViewIndex = index;

  $("songTitle").textContent = truncate(song.title, TITLE_MAX);
  $("songTitle").title = song.title;

  // Hide artist if unknown or empty
  const artistEl = $("songArtist");
  const hasArtist = song.artist && !song.artist.toLowerCase().includes("unknown");
  if (hasArtist) {
    artistEl.textContent = truncate(song.artist, ARTIST_MAX);
    artistEl.title = song.artist;
    artistEl.style.display = "";
  } else {
    artistEl.style.display = "none";
  }
  $("ytLink").href = `https://www.youtube.com/watch?v=${song.id}`;

  $("playBtn").onclick = () => togglePlay(song.id);

  // Update play/pause icon if this song is already playing
  if (currentlyPlayingId === song.id && ytReady) {
    const state = ytPlayer.getPlayerState();
    setPlayIcon(state === 1);
  } else if (currentlyPlayingId !== song.id) {
    setPlayIcon(false);
  }

  $("prevBtn").onclick = () => navigateTo(index - 1);
  $("nextBtn").onclick = () => navigateTo(index + 1);
}

function navigateTo(index) {
  if (index < 0) index = songs.length - 1;
  if (index >= songs.length) index = 0;

  const song = songs[index];
  renderHero(song, index);
  playSong(song.id);
  updateArchiveHighlight(song.id);
}

// ─── Archive: paginated, 20 at a time ───
function getArchiveSongs() {
  // All songs except the one currently in the hero (today's song)
  const list = [];
  for (let i = 0; i < songs.length; i++) {
    if (i === todayIndex) continue;
    list.push({ song: songs[i], originalIndex: i });
  }
  return list;
}

function renderArchivePage() {
  const grid = $("archiveGrid");
  const allArchive = getArchiveSongs();

  if (allArchive.length === 0) {
    $("archive").style.display = "none";
    $("scrollHint").style.display = "none";
    return;
  }

  const end = Math.min(archiveOffset + ARCHIVE_PAGE_SIZE, allArchive.length);

  for (let i = archiveOffset; i < end; i++) {
    const { song, originalIndex } = allArchive[i];
    const item = document.createElement("div");
    item.className = "archive-item";
    item.dataset.songId = song.id;
    item.dataset.index = originalIndex;
    const archiveHasArtist = song.artist && !song.artist.toLowerCase().includes("unknown");
    item.innerHTML = `
      <div class="archive-icon">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/>
        </svg>
      </div>
      <div class="archive-meta">
        <div class="archive-title">${song.title}</div>
        ${archiveHasArtist ? `<div class="archive-artist">${song.artist}</div>` : ""}
      </div>
      <button class="mini-play" aria-label="Play ${song.title}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="6,3 20,12 6,21" />
        </svg>
      </button>
    `;
    item.onclick = () => playFromArchive(song, originalIndex);
    grid.appendChild(item);
  }

  archiveOffset = end;

  // Show/hide load more button
  const btn = $("loadMoreBtn");
  if (archiveOffset < allArchive.length) {
    const remaining = allArchive.length - archiveOffset;
    btn.textContent = `Load more (${remaining} remaining)`;
    btn.style.display = "block";
  } else {
    btn.style.display = "none";
  }
}

// ─── Archive playback ───
function playFromArchive(song, index) {
  renderHero(song, index);
  window.scrollTo({ top: 0, behavior: "smooth" });
  playSong(song.id);
  updateArchiveHighlight(song.id);
}

function updateArchiveHighlight(songId) {
  document.querySelectorAll(".archive-item").forEach((el) => {
    el.classList.toggle("is-playing", el.dataset.songId === songId);
  });
}

// ─── YouTube IFrame API ───
function loadYouTubeAPI() {
  const tag = document.createElement("script");
  tag.src = "https://www.youtube.com/iframe_api";
  document.head.appendChild(tag);
}

window.onYouTubeIframeAPIReady = function () {
  ytPlayer = new YT.Player("ytPlayer", {
    height: "1",
    width: "1",
    playerVars: {
      autoplay: 0,
      controls: 0,
      disablekb: 1,
      fs: 0,
      modestbranding: 1,
      rel: 0,
    },
    events: {
      onReady: onPlayerReady,
      onStateChange: onPlayerStateChange,
    },
  });
};

function onPlayerReady() {
  ytReady = true;
  if (pendingPlay) {
    playSong(pendingPlay);
    pendingPlay = null;
  }
}

function onPlayerStateChange(event) {
  if (event.data === 0) {
    navigateTo(currentViewIndex + 1);
  }
  if (event.data === 1) {
    setPlayIcon(true);
    startProgressTracking();
  }
  if (event.data === 2) {
    setPlayIcon(false);
    stopProgressTracking();
  }
}

// ─── Playback controls ───
function togglePlay(videoId) {
  if (!ytReady) {
    pendingPlay = videoId;
    return;
  }

  if (currentlyPlayingId === videoId) {
    const state = ytPlayer.getPlayerState();
    if (state === 1) {
      ytPlayer.pauseVideo();
    } else {
      ytPlayer.playVideo();
    }
  } else {
    playSong(videoId);
  }
}

function playSong(videoId) {
  if (!ytReady) {
    pendingPlay = videoId;
    return;
  }

  resetProgress();
  ytPlayer.loadVideoById(videoId);
  currentlyPlayingId = videoId;
  setPlayIcon(true);
  updateArchiveHighlight(videoId);
}

function setPlayIcon(isPlaying) {
  $("playIcon").style.display = isPlaying ? "none" : "block";
  $("pauseIcon").style.display = isPlaying ? "block" : "none";
}

// ─── Progress bar ───
function startProgressTracking() {
  stopProgressTracking();
  progressInterval = setInterval(() => {
    if (!ytPlayer || !ytPlayer.getCurrentTime) return;
    const current = ytPlayer.getCurrentTime();
    const total = ytPlayer.getDuration();
    if (total > 0) {
      const pct = (current / total) * 100;
      $("progressBar").style.width = pct + "%";
      $("timeDisplay").textContent = `${formatTime(current)} / ${formatTime(total)}`;
    }
  }, 500);
}

function stopProgressTracking() {
  if (progressInterval) {
    clearInterval(progressInterval);
    progressInterval = null;
  }
}

function resetProgress() {
  $("progressBar").style.width = "0%";
  $("timeDisplay").textContent = "0:00";
}

function seekTo(e) {
  if (!ytReady || !currentlyPlayingId) return;
  const rect = $("progressWrap").getBoundingClientRect();
  const pct = (e.clientX - rect.left) / rect.width;
  const duration = ytPlayer.getDuration();
  ytPlayer.seekTo(pct * duration, true);
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ─── Go ───
init();