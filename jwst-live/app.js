const HERO_INTERVAL_MS = 12000;
const GALLERY_LIMIT = 12;
const TRACKER_REFRESH_MS = 60000;

const heroMedia = document.getElementById("hero-media");
const heroCaption = document.getElementById("hero-caption");
const galleryGrid = document.getElementById("gallery-grid");
const galleryStatus = document.getElementById("gallery-status");
const trackerStatus = document.getElementById("tracker-status");
const trackerStats = document.getElementById("tracker-stats");
const orbitPlot = document.getElementById("orbit-plot");
const orbitCaption = document.getElementById("orbit-caption");
const nowObserving = document.getElementById("now-observing");
const lightbox = document.getElementById("lightbox");
const lightboxImage = document.getElementById("lightbox-image");
const lightboxTitle = document.getElementById("lightbox-title");
const lightboxDate = document.getElementById("lightbox-date");
const lightboxDescription = document.getElementById("lightbox-description");
const lightboxLink = document.getElementById("lightbox-link");
const lightboxClose = document.getElementById("lightbox-close");
const nasaTvPlayer = document.getElementById("nasa-tv-player");
const webbPlayer = document.getElementById("webb-player");

function setupPlayers() {
  const origin = encodeURIComponent(window.location.origin);
  if (nasaTvPlayer) {
    nasaTvPlayer.src = `https://www.youtube.com/embed/21X5lGlDOfg?rel=0&origin=${origin}`;
  }
  if (webbPlayer) {
    webbPlayer.src = `https://www.youtube.com/embed/videoseries?list=UUfi4_aCc2nEhtUMSGqaim_Q&rel=0&origin=${origin}`;
  }
}

let heroIndex = 0;
let heroTimer = null;
let images = [];

function setHeroImage(item, fadeIn) {
  const img = document.createElement("img");
  img.src = item.large || item.image;
  img.alt = item.title;
  heroMedia.appendChild(img);
  requestAnimationFrame(() => {
    img.classList.add("is-visible");
  });
  heroCaption.textContent = `${item.title}${item.date ? ` — ${item.date}` : ""}`;
  if (fadeIn) {
    const previous = heroMedia.querySelectorAll("img:not(:last-child)");
    previous.forEach((old) => {
      old.classList.remove("is-visible");
      setTimeout(() => old.remove(), 1200);
    });
  }
}

function rotateHero() {
  if (images.length < 2) {
    return;
  }
  heroIndex = (heroIndex + 1) % Math.min(images.length, 8);
  setHeroImage(images[heroIndex], true);
}

function openLightbox(item) {
  lightboxImage.src = item.large || item.image;
  lightboxImage.alt = item.title;
  lightboxTitle.textContent = item.title;
  lightboxDate.textContent = [item.date, item.source].filter(Boolean).join(" · ");
  lightboxDescription.textContent = item.description || "No description provided.";
  lightboxLink.href = item.link || "#";
  lightbox.classList.add("is-open");
  document.body.style.overflow = "hidden";
}

function closeLightbox() {
  lightbox.classList.remove("is-open");
  document.body.style.overflow = "";
}

function renderGallery(items) {
  galleryGrid.replaceChildren();
  items.slice(0, GALLERY_LIMIT).forEach((item) => {
    const button = document.createElement("button");
    button.className = "gallery-card";
    button.type = "button";

    const img = document.createElement("img");
    img.src = item.image;
    img.alt = item.title;

    const caption = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = item.title;
    const date = document.createElement("time");
    date.textContent = item.date || "";
    caption.append(title, date);

    button.append(img, caption);
    button.addEventListener("click", () => openLightbox(item));
    galleryGrid.appendChild(button);
  });
}

async function loadImages() {
  const response = await fetch("/api/images");
  const data = await response.json();
  if (!data.items || !data.items.length) {
    throw new Error(data.error || "No images available.");
  }
  return data;
}

function formatKm(km) {
  if (km >= 1_000_000) {
    return `${(km / 1_000_000).toFixed(2)} million km`;
  }
  return `${Math.round(km).toLocaleString("en-US")} km`;
}

function formatLightTime(seconds) {
  if (seconds < 60) {
    return `${seconds.toFixed(1)} seconds`;
  }
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes}m ${rest}s`;
}

function svgEl(name, attrs) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", name);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  return node;
}

function prettyTarget(name) {
  return (name || "").replace(/-/g, " ").replace(/\s+/g, " ").trim() || "Unknown target";
}

function formatVisitWhen(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toUTCString().replace("GMT", "UTC").replace(/:\d{2} UTC$/, " UTC");
}

function renderObservation(data) {
  const observation = data.observation;
  nowObserving.replaceChildren();
  if (!observation || observation.status === "unavailable") {
    const label = document.createElement("span");
    label.className = "label";
    label.textContent = "Now observing";
    const value = document.createElement("div");
    value.className = "value";
    value.textContent = "Schedule unavailable";
    const hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent = "The STScI weekly plan could not be loaded right now.";
    nowObserving.append(label, value, hint);
    return;
  }
  if (!observation.target) {
    return;
  }

  const statusLabel =
    observation.status === "observing"
      ? "Now observing"
      : observation.status === "between_visits"
        ? "Recently observing"
        : "Next planned target";

  const label = document.createElement("span");
  label.className = "label";
  label.textContent = statusLabel;

  const value = document.createElement("div");
  value.className = "value";
  value.textContent = prettyTarget(observation.target);

  const details = [
    observation.instrument,
    observation.keywords || observation.category,
  ].filter(Boolean);
  const hint = document.createElement("div");
  hint.className = "hint";
  hint.textContent = details.join(" · ");
  if (observation.program_url && observation.program_id) {
    hint.append(" · ");
    const link = document.createElement("a");
    link.href = observation.program_url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = `Program ${observation.program_id}`;
    hint.appendChild(link);
  }

  const timing = document.createElement("div");
  timing.className = "hint";
  if (observation.status === "observing") {
    timing.textContent = `Planned ${formatVisitWhen(observation.start)} through ${formatVisitWhen(observation.end)}.`;
  } else if (observation.status === "between_visits") {
    timing.textContent = `Last planned visit ended ${formatVisitWhen(observation.end)}.`;
  } else {
    timing.textContent = `Scheduled ${formatVisitWhen(observation.start)}.`;
  }

  nowObserving.append(label, value, hint, timing);

  if (observation.next && observation.next.target) {
    const next = document.createElement("div");
    next.className = "next";
    next.textContent = `Next: ${prettyTarget(observation.next.target)} · ${observation.next.instrument || ""} · ${formatVisitWhen(observation.next.start)}`;
    nowObserving.appendChild(next);
  }

  const note = document.createElement("div");
  note.className = "hint";
  note.textContent = observation.note || "";
  nowObserving.appendChild(note);
}

function renderStats(data) {
  const observer = data.observer;
  const approaching = observer.range_rate_kms < 0;
  const cards = [
    {
      label: "Distance from Earth",
      value: formatKm(observer.earth_km),
      hint: `${formatLightTime(observer.light_time_s)} at light speed`,
    },
    {
      label: "Distance from L2",
      value: formatKm(data.l2_km),
      hint: "Halo orbit around Sun–Earth L2",
    },
    {
      label: "Sky position",
      value: observer.ra,
      hint: `Dec ${observer.dec}`,
    },
    {
      label: "Constellation",
      value: observer.constellation,
      hint: observer.constellation_abbrev,
    },
    {
      label: approaching ? "Closing on Earth" : "Moving away",
      value: `${Math.abs(observer.range_rate_kms).toFixed(3)} km/s`,
      hint: `Solar elongation ${observer.elongation_deg.toFixed(1)}°`,
    },
    {
      label: "Time in space",
      value: `${data.days_in_space.toLocaleString("en-US")} days`,
      hint: "Launched 25 Dec 2021",
    },
  ];

  trackerStats.replaceChildren();
  cards.forEach((card) => {
    const article = document.createElement("article");
    article.className = "stat-card";
    const label = document.createElement("span");
    label.className = "label";
    label.textContent = card.label;
    const value = document.createElement("div");
    value.className = "value";
    value.textContent = card.value;
    const hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent = card.hint;
    article.append(label, value, hint);
    trackerStats.appendChild(article);
  });
}

function renderOrbit(data) {
  const width = 800;
  const height = 520;
  const pad = 56;
  const path = data.path || [];
  if (!path.length) {
    return;
  }

  const xs = path.map((p) => p.x);
  const ys = path.map((p) => p.y);
  const minX = Math.min(...xs, 0);
  const maxX = Math.max(...xs, 0);
  const minY = Math.min(...ys, 0);
  const maxY = Math.max(...ys, 0);
  const span = Math.max(maxX - minX, maxY - minY, 1) * 1.18;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const plot = Math.min(width, height) - pad * 2;

  const toX = (x) => width / 2 + ((x - cx) / span) * plot;
  const toY = (y) => height / 2 - ((y - cy) / span) * plot;

  orbitPlot.replaceChildren();
  orbitPlot.append(
    svgEl("rect", { x: 0, y: 0, width, height, fill: "#070910" }),
    svgEl("circle", {
      cx: toX(0),
      cy: toY(0),
      r: 5,
      fill: "#9ecbff",
    }),
    svgEl("text", {
      x: toX(0) + 10,
      y: toY(0) - 10,
      fill: "#9ecbff",
      "font-size": "13",
      "font-family": "Outfit, sans-serif",
    })
  );
  orbitPlot.lastChild.textContent = "L2";

  const points = path.map((p) => `${toX(p.x).toFixed(1)},${toY(p.y).toFixed(1)}`).join(" ");
  orbitPlot.append(
    svgEl("polyline", {
      points,
      fill: "none",
      stroke: "rgba(212,180,131,0.55)",
      "stroke-width": "2",
    })
  );

  const here = data.current;
  const jx = toX(here.x);
  const jy = toY(here.y);
  orbitPlot.append(
    svgEl("circle", {
      cx: jx,
      cy: jy,
      r: 16,
      fill: "rgba(212,180,131,0.16)",
    }),
    svgEl("polygon", {
      points: `${jx},${jy - 9} ${jx + 8},${jy - 3} ${jx + 5},${jy + 8} ${jx - 5},${jy + 8} ${jx - 8},${jy - 3}`,
      fill: "#e8c99a",
    }),
    svgEl("text", {
      x: jx + 14,
      y: jy + 4,
      fill: "#e8c99a",
      "font-size": "13",
      "font-family": "Outfit, sans-serif",
    })
  );
  orbitPlot.lastChild.textContent = "JWST";

  const earth = data.earth_from_l2;
  if (earth) {
    const mag = Math.hypot(earth.x, earth.y) || 1;
    const reach = span * 0.42;
    const ex = toX((earth.x / mag) * reach);
    const ey = toY((earth.y / mag) * reach);
    orbitPlot.append(
      svgEl("line", {
        x1: toX(0),
        y1: toY(0),
        x2: ex,
        y2: ey,
        stroke: "rgba(158,203,255,0.35)",
        "stroke-dasharray": "5 5",
      }),
      svgEl("circle", { cx: ex, cy: ey, r: 6, fill: "#6ea8ff" }),
      svgEl("text", {
        x: ex + 10,
        y: ey + 4,
        fill: "#9ecbff",
        "font-size": "13",
        "font-family": "Outfit, sans-serif",
      })
    );
    orbitPlot.lastChild.textContent = "Earth";
  }

  const scaleKm = 100000;
  const scalePx = (scaleKm / span) * plot;
  if (scalePx > 24) {
    const sx = 36;
    const sy = height - 28;
    orbitPlot.append(
      svgEl("line", {
        x1: sx,
        y1: sy,
        x2: sx + scalePx,
        y2: sy,
        stroke: "#b7b0a4",
        "stroke-width": "2",
      }),
      svgEl("text", {
        x: sx,
        y: sy - 8,
        fill: "#b7b0a4",
        "font-size": "12",
        "font-family": "Outfit, sans-serif",
      })
    );
    orbitPlot.lastChild.textContent = "100,000 km";
  }

  orbitCaption.textContent =
    "Ecliptic X/Y view of Webb’s halo around Sun–Earth L2. Path covers about 80 days from JPL Horizons.";
}

async function refreshTracker() {
  try {
    const response = await fetch("/api/tracker");
    const data = await response.json();
    renderObservation(data);
    if (!data.ok) {
      throw new Error(data.error || "Tracker unavailable.");
    }
    const when = new Date(data.observer.epoch).toUTCString().replace("GMT", "UTC");
    trackerStatus.textContent = `Live ephemeris from ${data.source}. Epoch ${when}.`;
    renderStats(data);
    renderOrbit(data);
  } catch (error) {
    trackerStatus.textContent = error.message;
  }
}

async function init() {
  setupPlayers();
  refreshTracker();
  window.setInterval(refreshTracker, TRACKER_REFRESH_MS);
  try {
    const data = await loadImages();
    images = data.items;
    const sourceLabel = data.source === "esa" ? "ESA/Webb" : "NASA Images";
    galleryStatus.textContent = `Latest official releases from ${sourceLabel}. Tap a photo for details.`;
    setHeroImage(images[0], false);
    renderGallery(images);
    heroTimer = window.setInterval(rotateHero, HERO_INTERVAL_MS);
  } catch (error) {
    heroCaption.textContent = "Could not load the latest Webb images right now.";
    galleryStatus.textContent = error.message;
  }
}

lightboxClose.addEventListener("click", closeLightbox);
lightbox.addEventListener("click", (event) => {
  if (event.target === lightbox) {
    closeLightbox();
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && lightbox.classList.contains("is-open")) {
    closeLightbox();
  }
});

init();
