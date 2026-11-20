/* ==========================================================
   Forecast Gallery
   API mashup:
     1. Open-Meteo Geocoding API  -> city name to coordinates
     2. Open-Meteo Forecast API   -> current weather + 7-day forecast
     3. Art Institute of Chicago  -> artworks matching the weather
   All three are free, keyless, and CORS-enabled.
   ========================================================== */

const GEO_URL = "https://geocoding-api.open-meteo.com/v1/search";
const WEATHER_URL = "https://api.open-meteo.com/v1/forecast";
const ART_URL = "https://api.artic.edu/api/v1/artworks/search";
const IIIF_BASE = "https://www.artic.edu/iiif/2";
const STORAGE_KEY = "forecast-gallery:last-place";

// ---------- DOM references ----------
const $ = (id) => document.getElementById(id);
const els = {
  form: $("search-form"),
  input: $("city-input"),
  results: $("city-results"),
  locateBtn: $("locate-btn"),
  status: $("status"),
  weather: $("weather"),
  placeName: $("place-name"),
  currentIcon: $("current-icon"),
  currentTemp: $("current-temp"),
  tempUnit: $("temp-unit"),
  currentDesc: $("current-desc"),
  feelsLike: $("feels-like"),
  humidity: $("humidity"),
  wind: $("wind"),
  localTime: $("local-time"),
  forecastList: $("forecast-list"),
  gallery: $("gallery"),
  themeName: $("theme-name"),
  shuffleBtn: $("shuffle-btn"),
  featuredImg: $("featured-img"),
  featuredTitle: $("featured-title"),
  featuredArtist: $("featured-artist"),
  featuredDate: $("featured-date"),
  featuredMedium: $("featured-medium"),
  featuredLink: $("featured-link"),
  thumbs: $("thumbs"),
};

// ---------- App state ----------
const state = {
  place: null,        // { name, label, latitude, longitude }
  unit: "fahrenheit", // or "celsius"
  sky: "clear",
  artworks: [],
};

/* WMO weather codes -> description, emoji, and "sky" theme.
   https://open-meteo.com/en/docs (see "WMO Weather interpretation codes") */
const WEATHER_CODES = {
  0: ["Clear sky", "☀️", "clear"],
  1: ["Mainly clear", "🌤️", "clear"],
  2: ["Partly cloudy", "⛅", "clouds"],
  3: ["Overcast", "☁️", "clouds"],
  45: ["Fog", "🌫️", "fog"],
  48: ["Freezing fog", "🌫️", "fog"],
  51: ["Light drizzle", "🌦️", "rain"],
  53: ["Drizzle", "🌦️", "rain"],
  55: ["Heavy drizzle", "🌧️", "rain"],
  56: ["Freezing drizzle", "🌧️", "rain"],
  57: ["Freezing drizzle", "🌧️", "rain"],
  61: ["Light rain", "🌦️", "rain"],
  63: ["Rain", "🌧️", "rain"],
  65: ["Heavy rain", "🌧️", "rain"],
  66: ["Freezing rain", "🌧️", "rain"],
  67: ["Freezing rain", "🌧️", "rain"],
  71: ["Light snow", "🌨️", "snow"],
  73: ["Snow", "🌨️", "snow"],
  75: ["Heavy snow", "❄️", "snow"],
  77: ["Snow grains", "🌨️", "snow"],
  80: ["Rain showers", "🌦️", "rain"],
  81: ["Rain showers", "🌧️", "rain"],
  82: ["Violent showers", "⛈️", "rain"],
  85: ["Snow showers", "🌨️", "snow"],
  86: ["Heavy snow showers", "❄️", "snow"],
  95: ["Thunderstorm", "⛈️", "storm"],
  96: ["Thunderstorm with hail", "⛈️", "storm"],
  99: ["Thunderstorm with hail", "⛈️", "storm"],
};

/* Each sky theme gets an exhibit title and a list of search terms
   for the Art Institute collection. A random term is used each time
   so "Shuffle" brings up different works. */
const EXHIBITS = {
  clear: { title: "Sunlit Days", terms: ["sunlight", "summer", "landscape sun", "garden", "beach"] },
  night: { title: "Nocturnes", terms: ["night", "moonlight", "nocturne", "stars", "evening"] },
  clouds: { title: "Under Gray Skies", terms: ["clouds", "sky", "overcast", "cloudy landscape"] },
  fog: { title: "Lost in the Mist", terms: ["fog", "mist", "haze", "morning mist"] },
  rain: { title: "Rainy Day Reflections", terms: ["rain", "rainy", "umbrella", "wet street"] },
  snow: { title: "Winter Light", terms: ["snow", "winter", "ice", "snowy landscape"] },
  storm: { title: "The Tempest", terms: ["storm", "tempest", "lightning", "shipwreck", "stormy sea"] },
};

// ---------- Helpers ----------
function setStatus(message, isError = false) {
  els.status.textContent = message;
  els.status.classList.toggle("error", isError);
}

async function getJSON(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }
  return response.json();
}

function placeLabel(r) {
  return [r.name, r.admin1, r.country].filter(Boolean).join(", ");
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

// ---------- 1. Geocoding ----------
async function searchCities(query) {
  const params = new URLSearchParams({ name: query, count: 6, language: "en", format: "json" });
  const data = await getJSON(`${GEO_URL}?${params}`);
  return data.results || [];
}

function renderCityResults(results) {
  els.results.replaceChildren();
  results.forEach((r) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.innerHTML = `<strong></strong> <small></small>`;
    btn.querySelector("strong").textContent = r.name;
    btn.querySelector("small").textContent = [r.admin1, r.country].filter(Boolean).join(", ");
    btn.addEventListener("click", () => {
      els.results.hidden = true;
      els.input.value = r.name;
      loadPlace({ name: r.name, label: placeLabel(r), latitude: r.latitude, longitude: r.longitude });
    });
    li.append(btn);
    els.results.append(li);
  });
  els.results.hidden = results.length === 0;
  if (results.length) els.results.querySelector("button").focus();
}

// ---------- 2. Weather ----------
async function fetchWeather({ latitude, longitude }) {
  const params = new URLSearchParams({
    latitude,
    longitude,
    current: "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
    temperature_unit: state.unit,
    wind_speed_unit: state.unit === "fahrenheit" ? "mph" : "kmh",
    timezone: "auto",
    forecast_days: 7,
  });
  return getJSON(`${WEATHER_URL}?${params}`);
}

function describe(code) {
  return WEATHER_CODES[code] || ["Unknown", "🌡️", "clouds"];
}

function renderWeather(data) {
  const c = data.current;
  const [desc, icon, sky] = describe(c.weather_code);
  const unitSymbol = state.unit === "fahrenheit" ? "°F" : "°C";

  // Clear skies at night get the "night" theme
  state.sky = sky === "clear" && c.is_day === 0 ? "night" : sky;
  document.body.dataset.sky = state.sky;

  els.placeName.textContent = state.place.label;
  els.currentIcon.textContent = state.sky === "night" ? "🌙" : icon;
  els.currentTemp.textContent = Math.round(c.temperature_2m);
  els.tempUnit.textContent = unitSymbol;
  els.currentDesc.textContent = desc;
  els.feelsLike.textContent = `${Math.round(c.apparent_temperature)}${unitSymbol}`;
  els.humidity.textContent = `${c.relative_humidity_2m}%`;
  els.wind.textContent = `${Math.round(c.wind_speed_10m)} ${data.current_units.wind_speed_10m}`;

  // c.time is already in the location's local time zone
  const local = new Date(c.time);
  els.localTime.textContent = local.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  // 7-day forecast
  const d = data.daily;
  els.forecastList.replaceChildren(
    ...d.time.map((date, i) => {
      const [dayDesc, dayIcon] = describe(d.weather_code[i]);
      const dayName = i === 0
        ? "Today"
        : new Date(`${date}T12:00`).toLocaleDateString([], { weekday: "short" });
      const li = document.createElement("li");
      li.innerHTML = `
        <p class="day"></p>
        <p class="icon" role="img"></p>
        <p class="temps"><strong class="hi"></strong> / <span class="lo"></span></p>
        <p class="rain-chance"></p>`;
      li.querySelector(".day").textContent = dayName;
      const iconEl = li.querySelector(".icon");
      iconEl.textContent = dayIcon;
      iconEl.setAttribute("aria-label", dayDesc);
      iconEl.title = dayDesc;
      li.querySelector(".hi").textContent = `${Math.round(d.temperature_2m_max[i])}°`;
      li.querySelector(".lo").textContent = `${Math.round(d.temperature_2m_min[i])}°`;
      const chance = d.precipitation_probability_max[i];
      li.querySelector(".rain-chance").textContent = chance == null ? "" : `💧 ${chance}%`;
      return li;
    })
  );

  els.weather.hidden = false;
}

// ---------- 3. Art Institute of Chicago ----------
async function fetchArtworks(sky) {
  const term = pick(EXHIBITS[sky].terms);
  const params = new URLSearchParams({
    q: term,
    "query[term][is_public_domain]": "true",
    fields: "id,title,artist_display,date_display,medium_display,image_id,thumbnail",
    limit: 40,
    page: 1 + Math.floor(Math.random() * 3), // a little variety between shuffles
  });
  let data = await getJSON(`${ART_URL}?${params}`);

  // If a later page came back empty, fall back to page 1
  if (!data.data.length && params.get("page") !== "1") {
    params.set("page", "1");
    data = await getJSON(`${ART_URL}?${params}`);
  }

  const withImages = data.data.filter((a) => a.image_id);
  // Shuffle and keep 9 (1 featured + 8 thumbnails)
  return withImages.sort(() => Math.random() - 0.5).slice(0, 9);
}

function imageUrl(imageId, width) {
  return `${IIIF_BASE}/${imageId}/full/${width},/0/default.jpg`;
}

function altText(art) {
  return art.thumbnail?.alt_text || `${art.title} by ${art.artist_display || "unknown artist"}`;
}

function showFeatured(index) {
  const art = state.artworks[index];
  if (!art) return;

  els.featuredImg.src = imageUrl(art.image_id, 843);
  els.featuredImg.alt = altText(art);
  // If the full image fails, fall back to the tiny blurred preview
  els.featuredImg.onerror = () => {
    if (art.thumbnail?.lqip) els.featuredImg.src = art.thumbnail.lqip;
    els.featuredImg.onerror = null;
  };

  els.featuredTitle.textContent = art.title;
  els.featuredArtist.textContent = art.artist_display || "Unknown artist";
  els.featuredDate.textContent = art.date_display || "";
  els.featuredMedium.textContent = art.medium_display || "";
  els.featuredLink.href = `https://www.artic.edu/artworks/${art.id}`;

  els.thumbs.querySelectorAll("button").forEach((b, i) => {
    b.setAttribute("aria-current", i === index ? "true" : "false");
  });
}

function renderGallery() {
  els.themeName.textContent = EXHIBITS[state.sky].title;
  els.thumbs.replaceChildren(
    ...state.artworks.map((art, i) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("aria-label", `View ${art.title}`);
      const img = document.createElement("img");
      img.src = imageUrl(art.image_id, 200);
      img.alt = "";
      img.loading = "lazy";
      img.addEventListener("error", () => {
        if (art.thumbnail?.lqip) img.src = art.thumbnail.lqip;
      }, { once: true });
      btn.append(img);
      btn.addEventListener("click", () => {
        showFeatured(i);
        els.featuredTitle.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      li.append(btn);
      return li;
    })
  );
  showFeatured(0);
  els.gallery.hidden = false;
}

async function loadGallery() {
  els.shuffleBtn.disabled = true;
  try {
    const works = await fetchArtworks(state.sky);
    if (!works.length) {
      setStatus("The curators couldn't find matching paintings this time. Try shuffling again.", true);
      return;
    }
    state.artworks = works;
    renderGallery();
  } catch (err) {
    console.error(err);
    setStatus("The art collection is unavailable right now. Please try again shortly.", true);
  } finally {
    els.shuffleBtn.disabled = false;
  }
}

// ---------- Putting it together ----------
async function loadPlace(place) {
  state.place = place;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(place)); } catch { /* storage unavailable */ }
  setStatus(`Checking the sky over ${place.label}…`);
  try {
    const weather = await fetchWeather(place);
    renderWeather(weather);
    setStatus(`Curating paintings for ${describe(weather.current.weather_code)[0].toLowerCase()} weather…`);
    await loadGallery();
    if (!els.status.classList.contains("error")) setStatus("");
  } catch (err) {
    console.error(err);
    setStatus("Sorry, we couldn't load the weather. Check your connection and try again.", true);
  }
}

// ---------- Event listeners ----------
els.form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const query = els.input.value.trim();
  if (query.length < 2) return;
  setStatus(`Searching for “${query}”…`);
  try {
    const results = await searchCities(query);
    if (!results.length) {
      els.results.hidden = true;
      setStatus(`No places found for “${query}”. Check the spelling and try again.`, true);
      return;
    }
    setStatus(results.length === 1 ? "" : "Choose a location below.");
    if (results.length === 1) {
      const r = results[0];
      els.results.hidden = true;
      loadPlace({ name: r.name, label: placeLabel(r), latitude: r.latitude, longitude: r.longitude });
    } else {
      renderCityResults(results);
    }
  } catch (err) {
    console.error(err);
    setStatus("City search is unavailable right now. Please try again.", true);
  }
});

els.locateBtn.addEventListener("click", () => {
  if (!("geolocation" in navigator)) {
    setStatus("Your browser doesn't support location lookup.", true);
    return;
  }
  setStatus("Finding your location…");
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      els.results.hidden = true;
      loadPlace({
        name: "Your location",
        label: "Your Location",
        latitude: pos.coords.latitude.toFixed(3),
        longitude: pos.coords.longitude.toFixed(3),
      });
    },
    () => setStatus("Location access was denied. Search for a city instead.", true)
  );
});

document.querySelectorAll(".unit-toggle button").forEach((btn) => {
  btn.addEventListener("click", async () => {
    if (btn.dataset.unit === state.unit || !state.place) return;
    state.unit = btn.dataset.unit;
    document.querySelectorAll(".unit-toggle button").forEach((b) => {
      b.setAttribute("aria-pressed", String(b === btn));
    });
    try {
      renderWeather(await fetchWeather(state.place));
    } catch (err) {
      console.error(err);
      setStatus("Couldn't update units. Please try again.", true);
    }
  });
});

els.shuffleBtn.addEventListener("click", loadGallery);

// Close the city list with Escape
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !els.results.hidden) {
    els.results.hidden = true;
    els.input.focus();
  }
});

// ---------- Start-up: last viewed place, or a default ----------
let saved = null;
try {
  saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
} catch {
  saved = null;
}
loadPlace(saved || { name: "Chicago", label: "Chicago, Illinois, United States", latitude: 41.85, longitude: -87.65 });
