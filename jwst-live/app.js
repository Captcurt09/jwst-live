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
const targetLessonBody = document.getElementById("target-lesson-body");
const lightbox = document.getElementById("lightbox");
const lightboxImage = document.getElementById("lightbox-image");
const lightboxMeta = document.getElementById("lightbox-meta");
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

const FILTER_COLORS = {
  Purple: "#9b7dff",
  Blue: "#4d8dff",
  Cyan: "#4ecfcf",
  Green: "#5dba6a",
  Yellow: "#e0c35a",
  Orange: "#e08a3c",
  Red: "#d45b5b",
  White: "#f3eee6",
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text) {
    node.textContent = text;
  }
  return node;
}

function lightboxSection(title, nodes) {
  if (!nodes.length) {
    return null;
  }
  const section = el("section", "lightbox-section");
  section.append(el("h4", "", title), ...nodes);
  return section;
}

function openLightbox(item) {
  lightboxImage.src = item.large || item.image;
  lightboxImage.alt = item.title;
  lightboxMeta.replaceChildren();

  const heading = el("h3", "", item.title);
  const date = el("p", "lightbox-date", [item.date, item.source].filter(Boolean).join(" · "));
  lightboxMeta.append(heading, date);

  const objectBits = [
    item.object_name && `Name: ${item.object_name}`,
    item.object_type && `Type: ${item.object_type}`,
    item.constellation && `Constellation: ${item.constellation}`,
  ].filter(Boolean);
  const objectNodes = [];
  if (objectBits.length) {
    objectNodes.push(el("p", "lightbox-kicker", objectBits.join(" · ")));
  }
  if (item.visual) {
    objectNodes.push(el("p", "", `What the picture shows: ${item.visual}`));
  }
  if (item.description) {
    objectNodes.push(el("p", "", item.description));
  }
  const objectSection = lightboxSection("Object description", objectNodes);
  if (objectSection) {
    lightboxMeta.appendChild(objectSection);
  }

  const instrumentNodes = [];
  if (item.instruments && item.instruments.length) {
    const row = el("div", "instrument-row");
    item.instruments.forEach((name) => row.appendChild(el("span", "instrument-chip", name)));
    instrumentNodes.push(row);
    instrumentNodes.push(
      el("p", "", `${item.instruments.join(" and ")} collected the light for this image.`)
    );
  }
  const instrumentSection = lightboxSection("Instruments used", instrumentNodes);
  if (instrumentSection) {
    lightboxMeta.appendChild(instrumentSection);
  }

  const scienceNodes = [];
  if (item.science) {
    scienceNodes.push(el("p", "", item.science));
  }
  const scienceSection = lightboxSection("Science significance", scienceNodes);
  if (scienceSection) {
    lightboxMeta.appendChild(scienceSection);
  }

  const colorNodes = [];
  if (item.color_explanation) {
    colorNodes.push(el("p", "", item.color_explanation));
  }
  if (item.filters && item.filters.length) {
    const table = el("table", "filter-table");
    const head = document.createElement("thead");
    const headRow = document.createElement("tr");
    ["Mapped color", "Wavelength", "Band", "Instrument"].forEach((label) => {
      headRow.appendChild(el("th", "", label));
    });
    head.appendChild(headRow);
    const body = document.createElement("tbody");
    item.filters.forEach((filter) => {
      const row = document.createElement("tr");
      const colorCell = document.createElement("td");
      const swatch = el("span", "color-swatch");
      swatch.style.background = FILTER_COLORS[filter.color] || "var(--gold)";
      colorCell.append(swatch, document.createTextNode(filter.color || "Assigned color"));
      if (filter.feature) {
        colorCell.append(document.createTextNode(` (${filter.feature})`));
      }
      row.append(
        colorCell,
        el("td", "", filter.wavelength || "—"),
        el("td", "", filter.band || "Infrared"),
        el("td", "", filter.instrument || "Webb")
      );
      body.appendChild(row);
    });
    table.append(head, body);
    colorNodes.push(table);
  }
  const colorSection = lightboxSection("Color explanation (IR → visible)", colorNodes);
  if (colorSection) {
    lightboxMeta.appendChild(colorSection);
  }

  const downloads = (item.downloads && item.downloads.length
    ? item.downloads
    : [{ label: "Large image", url: item.large || item.image, size: "" }]
  ).filter((file) => file && file.url);
  const downloadList = el("ul", "download-list");
  downloads.forEach((file) => {
    const li = document.createElement("li");
    const link = document.createElement("a");
    link.href = file.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = file.label;
    li.appendChild(link);
    if (file.size) {
      li.appendChild(el("span", "download-size", file.size));
    }
    downloadList.appendChild(li);
  });
  if (item.link) {
    const official = document.createElement("li");
    const link = document.createElement("a");
    link.href = item.link;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Official ESA/Webb or NASA page";
    official.appendChild(link);
    downloadList.appendChild(official);
  }
  lightboxMeta.appendChild(lightboxSection("Download links", [downloadList]));

  if (item.credit) {
    lightboxMeta.appendChild(el("p", "lightbox-credit", `Credit: ${item.credit}`));
  }

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

function firstMatchingText(text, rules) {
  const haystack = text || "";
  const match = rules.find((rule) => rule.test.test(haystack));
  return match ? match.text : "";
}

function instrumentLesson(instrument) {
  return firstMatchingText(instrument, [
    {
      test: /MIRI/i,
      text: "MIRI is the Mid-Infrared Instrument. It sees heat: warm dust, cooler stars, and objects that stay hidden in ordinary visible light.",
    },
    {
      test: /NIRCam/i,
      text: "NIRCam is Webb’s main near-infrared camera. It takes sharp pictures of stars, galaxies, and clouds where new stars are forming.",
    },
    {
      test: /NIRSpec/i,
      text: "NIRSpec is a spectrograph. Instead of one color picture, it splits an object’s light into a rainbow so scientists can tell what it is made of and how it is moving.",
    },
    {
      test: /NIRISS/i,
      text: "NIRISS studies faint galaxies and the atmospheres of planets around other stars by reading fingerprints in their light.",
    },
    {
      test: /FGS/i,
      text: "The Fine Guidance Sensor helps Webb stay locked on target so the science cameras can take a steady measurement.",
    },
  ]);
}

function topicLesson(topic) {
  return firstMatchingText(topic, [
    {
      test: /supernova/i,
      text: "A supernova remnant is the wreckage of a star that exploded. Infrared light can reveal dust and molecules forming in that debris.",
    },
    {
      test: /exoplanet|transiting/i,
      text: "An exoplanet is a planet orbiting another star. Webb often watches the star’s light for tiny changes that hint at the planet’s atmosphere.",
    },
    {
      test: /galaxy|galaxies|high-redshift/i,
      text: "Galaxies are huge collections of stars, gas, and dust. Infrared light lets Webb see through dust and pick out galaxies from the early universe.",
    },
    {
      test: /star formation|young stars|protostar/i,
      text: "Star-forming regions are dusty nurseries. Infrared light can pass through that dust, so Webb can see the young stars still wrapping up inside.",
    },
    {
      test: /nebula/i,
      text: "A nebula is a cloud of gas and dust. Webb’s infrared cameras show structure and heat that a backyard telescope cannot.",
    },
    {
      test: /black hole|agn|quasar/i,
      text: "Some galaxies hide a supermassive black hole. Infrared observations can study the hot dust and stars around that core.",
    },
    {
      test: /solar system|asteroid|comet|kuiper/i,
      text: "Closer to home, Webb can study asteroids, comets, and icy worlds by the heat they give off.",
    },
    {
      test: /globular|star cluster/i,
      text: "A globular cluster is a dense ball of hundreds of thousands of old stars. Infrared images can pick individual stars out of that crowd and study how they age.",
    },
    {
      test: /stellar physics|stars/i,
      text: "Stellar programs watch how stars live, age, and throw off gas. Infrared light is especially good at seeing cool material around those stars.",
    },
  ]);
}

function setLessonParagraphs(texts) {
  targetLessonBody.replaceChildren();
  texts.filter(Boolean).forEach((text) => {
    const paragraph = document.createElement("p");
    paragraph.textContent = text;
    targetLessonBody.appendChild(paragraph);
  });
}

function renderTargetLesson(observation) {
  if (!observation || observation.status === "unavailable") {
    setLessonParagraphs([
      "The weekly plan from STScI could not be loaded. Webb still observes on a schedule, but this classroom dashboard cannot name the current target until that list is available.",
      "Infrared means light that is redder than your eyes can see. Webb’s sunshield keeps the telescope extremely cold so those faint heat signals are not drowned out.",
    ]);
    return;
  }
  if (!observation.target) {
    setLessonParagraphs([
      "No timed visit is listed right now. Between pointings, Webb slews to the next target or takes calibration data.",
    ]);
    return;
  }

  const target = prettyTarget(observation.target);
  const instrument = observation.instrument || "a science instrument";
  const topic = [observation.keywords, observation.category].filter(Boolean).join(" ");
  const statusLead =
    observation.status === "observing"
      ? `Right now the plan says Webb is looking at ${target} with ${instrument}.`
      : observation.status === "between_visits"
        ? `Webb recently finished a planned visit to ${target} with ${instrument}.`
        : `The next listed target is ${target}, using ${instrument}.`;

  setLessonParagraphs([
    statusLead,
    instrumentLesson(instrument),
    topicLesson(topic),
    "Webb sees infrared light, not a normal color movie. Dust, cool stars, and very distant galaxies glow in infrared, which is why a target like this can be studied even when it looks dark to the human eye.",
  ]);
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
    renderTargetLesson(data.observation);
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
    galleryStatus.textContent = `Latest official releases from ${sourceLabel}. Tap a photo for the object, instruments, color mapping, and downloads.`;
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
