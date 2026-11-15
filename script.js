/* =========================================
   SMART KRISHI - MAIN JAVASCRIPT
   Weather: Open-Meteo (no API key required)
   Map: Leaflet + Esri / OpenStreetMap
========================================= */

"use strict";

const LOCATIONS = {
  Coimbatore: { lat: 11.0168, lon: 76.9558 },
  Chennai:    { lat: 13.0827, lon: 80.2707 },
  Madurai:    { lat: 9.9252, lon: 78.1198 },
  Erode:      { lat: 11.3410, lon: 77.7172 },
  Salem:      { lat: 11.6643, lon: 78.1460 },
  Namakkal:   { lat: 11.2189, lon: 78.1677 }
};

let currentWeather = null;
let currentLocationName = "Erode";
let satelliteMap = null;
let satelliteMarker = null;
let satelliteLayer = null;
let satelliteMode = "satellite";

const $ = (id) => document.getElementById(id);

function scrollToSection(id) {
  const section = $(id);
  if (section) section.scrollIntoView({ behavior: "smooth", block: "start" });
}

window.openFeature = function (feature) {
  const sectionIds = {
    climate: "climate-dashboard",
    crops: "crops",
    water: "water-management",
    satellite: "satellite-monitoring"
  };
  scrollToSection(sectionIds[feature] || "home");
};

window.exploreFarm = function () {
  const selected = $("location")?.value || "Erode";
  if ($("farm-location")) $("farm-location").value = selected;
  updateLocationLabels(selected);
  scrollToSection("climate-dashboard");
  loadWeather(selected);
};

function updateLocationLabels(location) {
  currentLocationName = location;
  const fullName = `${location}, Tamil Nadu`;
  if ($("crop-location")) $("crop-location").textContent = fullName;
  if ($("selected-location")) $("selected-location").textContent = `Welcome, ${location} Farmer!`;
  if ($("location")) $("location").value = location;
  if ($("farm-location")) $("farm-location").value = location;
}

function weatherCodeDescription(code) {
  if (code === 0) return "Clear sky";
  if ([1, 2].includes(code)) return "Mostly clear / partly cloudy";
  if (code === 3) return "Overcast";
  if ([45, 48].includes(code)) return "Foggy conditions";
  if ([51, 53, 55, 56, 57].includes(code)) return "Drizzle";
  if ([61, 63, 65, 66, 67].includes(code)) return "Rain";
  if ([71, 73, 75, 77].includes(code)) return "Snow / ice";
  if ([80, 81, 82].includes(code)) return "Rain showers";
  if ([85, 86].includes(code)) return "Snow showers";
  if ([95, 96, 99].includes(code)) return "Thunderstorm";
  return "Weather conditions updated";
}

function showWeatherError(message) {
  if ($("weather-error")) $("weather-error").textContent = message;
}

async function loadWeather(location = currentLocationName) {
  const coords = LOCATIONS[location] || LOCATIONS.Erode;
  updateLocationLabels(location);
  showWeatherError("");
  if ($("weather-description")) $("weather-description").textContent = `Loading weather for ${location}...`;
  if ($("last-updated")) $("last-updated").textContent = "Fetching latest available weather data...";

  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.search = new URLSearchParams({
    latitude: coords.lat,
    longitude: coords.lon,
    current: "temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m",
    hourly: "shortwave_radiation",
    daily: "temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code",
    past_days: "7",
    forecast_days: "1",
    timezone: "Asia/Kolkata"
  }).toString();

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Weather service is unavailable right now.");
    const data = await response.json();
    currentWeather = data;
    renderWeather(data, location);
  } catch (error) {
    showWeatherError(`${error.message || "Unable to load weather."} Please check your internet connection and try again.`);
    if ($("weather-description")) $("weather-description").textContent = "Weather data could not be loaded.";
    if ($("last-updated")) $("last-updated").textContent = "No live update available.";
  }
}

function renderWeather(data, location) {
  const current = data.current || {};
  const hourly = data.hourly || {};
  const radiationIndex = hourly.time ? hourly.time.findIndex(t => t.slice(0, 13) === current.time?.slice(0, 13)) : -1;
  const radiation = radiationIndex >= 0 ? hourly.shortwave_radiation?.[radiationIndex] : null;

  if ($("solar")) $("solar").textContent = radiation == null ? "N/A" : `${Math.round(radiation)} W/m²`;
  if ($("temperature")) $("temperature").textContent = current.temperature_2m == null ? "-- °C" : `${current.temperature_2m} °C`;
  if ($("humidity")) $("humidity").textContent = current.relative_humidity_2m == null ? "-- %" : `${current.relative_humidity_2m} %`;
  if ($("wind")) $("wind").textContent = current.wind_speed_10m == null ? "-- km/h" : `${current.wind_speed_10m} km/h`;
  if ($("rainfall")) $("rainfall").textContent = current.precipitation == null ? "-- mm" : `${current.precipitation} mm`;

  const description = weatherCodeDescription(current.weather_code);
  if ($("weather-description")) $("weather-description").textContent =
    `${location}, Tamil Nadu: ${description}. Current temperature is ${current.temperature_2m ?? "not available"}°C.`;
  if ($("last-updated")) $("last-updated").textContent =
    `Weather data time: ${current.time || "not available"} (India Standard Time)`;

  renderForecast(data.daily || {});
  renderFarmingAlerts(current);
  renderFarmingTip(current);
  updateWaterGuidance(current);
  updateCropWeatherAdvisory(current);
}

function renderForecast(daily) {
  const container = $("forecast-grid");
  if (!container) return;
  container.innerHTML = "";
  (daily.time || []).forEach((date, index) => {
    const item = document.createElement("div");
    const day = new Date(`${date}T12:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
    item.innerHTML = `<h3>${day}</h3><p>${weatherCodeDescription(daily.weather_code?.[index])}</p><p>High: ${daily.temperature_2m_max?.[index] ?? "--"}°C</p><p>Low: ${daily.temperature_2m_min?.[index] ?? "--"}°C</p><p>Rain: ${daily.precipitation_sum?.[index] ?? "--"} mm</p>`;
    container.appendChild(item);
  });
  if (!container.children.length) container.textContent = "Climate history is not available.";
}

function renderFarmingAlerts(current) {
  const container = $("farming-alerts-content");
  if (!container) return;
  const alerts = [];
  if ((current.precipitation || 0) >= 5) alerts.push("Rain is occurring. Check field drainage and postpone pesticide spraying until conditions are suitable.");
  if ((current.temperature_2m || 0) >= 35) alerts.push("High temperature: irrigate during cooler hours and monitor crops for heat stress.");
  if ((current.wind_speed_10m || 0) >= 25) alerts.push("Strong winds: avoid spraying and support tall or vulnerable crops.");
  if ((current.relative_humidity_2m || 0) >= 85) alerts.push("High humidity: inspect crops regularly for fungal disease symptoms.");
  if (!alerts.length) alerts.push("No major weather-based alert from the current readings. Continue routine field monitoring.");
  container.innerHTML = "";
  alerts.forEach(message => {
    const p = document.createElement("p");
    p.textContent = message;
    container.appendChild(p);
  });
}


function renderFarmingTip(current) {
  const tip = $("farming-tip-text");
  if (!tip) return;
  if ((current.temperature_2m || 0) >= 35) tip.textContent = "Water crops in the early morning or evening to reduce evaporation during hot conditions.";
  else if ((current.precipitation || 0) >= 5) tip.textContent = "Use the rainfall effectively; check soil moisture before scheduling additional irrigation.";
  else tip.textContent = "Check soil moisture at root depth before irrigating, and adjust farm activities to the latest local weather.";
}

function updateWaterGuidance(current) {
  if ($("water-rainfall")) $("water-rainfall").textContent = `Current precipitation: ${current.precipitation ?? "--"} mm`;
  if ($("water-temperature")) $("water-temperature").textContent = `Current temperature: ${current.temperature_2m ?? "--"}°C`;
  if ($("irrigation-advice")) {
    let advice = "Check soil moisture before irrigation and avoid unnecessary watering.";
    if ((current.precipitation || 0) >= 2) advice = "Rain has been recorded. Check field soil moisture before irrigating; avoid overwatering.";
    else if ((current.temperature_2m || 0) >= 34) advice = "Hot conditions may increase water demand. Consider irrigation during early morning or evening.";
    $("irrigation-advice").textContent = advice;
  }
}

function updateCropWeatherAdvisory(current) {
  const node = $("crop-weather-message");
  if (!node) return;
  node.textContent = `Latest conditions near ${currentLocationName}: ${weatherCodeDescription(current.weather_code)}, ${current.temperature_2m ?? "--"}°C and ${current.precipitation ?? "--"} mm precipitation. Consider these conditions alongside soil moisture and local agricultural advice.`;
}

const CROP_GUIDE = {
  Kuruvai: {
    Red: ["Groundnut", "Millets", "Pulses"],
    Black: ["Cotton", "Millets", "Pulses"],
    Alluvial: ["Paddy", "Groundnut", "Vegetables"],
    Sandy: ["Groundnut", "Pearl millet", "Pulses"],
    Clay: ["Paddy", "Sesame", "Black gram"]
  },
  Samba: {
    Red: ["Millets", "Groundnut", "Pulses"],
    Black: ["Cotton", "Pulses", "Sorghum"],
    Alluvial: ["Paddy", "Sugarcane", "Banana"],
    Sandy: ["Groundnut", "Pulses", "Sesame"],
    Clay: ["Paddy", "Black gram", "Green gram"]
  },
  Thaladi: {
    Red: ["Groundnut", "Pulses", "Sorghum"],
    Black: ["Cotton", "Sorghum", "Pulses"],
    Alluvial: ["Paddy", "Vegetables", "Banana"],
    Sandy: ["Groundnut", "Sesame", "Pearl millet"],
    Clay: ["Paddy", "Black gram", "Green gram"]
  },
  Navarai: {
    Red: ["Pulses", "Groundnut", "Vegetables"],
    Black: ["Cotton", "Pulses", "Sorghum"],
    Alluvial: ["Paddy", "Vegetables", "Green gram"],
    Sandy: ["Groundnut", "Pearl millet", "Sesame"],
    Clay: ["Paddy", "Green gram", "Black gram"]
  },
  Summer: {
    Red: ["Pearl millet", "Groundnut", "Green gram"],
    Black: ["Cotton", "Sorghum", "Pulses"],
    Alluvial: ["Vegetables", "Green gram", "Fodder crops"],
    Sandy: ["Pearl millet", "Sesame", "Pulses"],
    Clay: ["Green gram", "Black gram", "Sesame"]
  }
};

function recommendCrops() {
  const season = $("crop-season")?.value;
  const soil = $("soil-type")?.value;
  const water = $("water-availability")?.value;
  const message = $("crop-message");
  const list = $("crop-list");
  if (!season || !soil || !water) {
    if (message) message.textContent = "Please select the season, soil type and water availability before requesting recommendations.";
    if (list) list.innerHTML = "";
    return;
  }

  let crops = [...(CROP_GUIDE[season]?.[soil] || ["Millets", "Pulses", "Groundnut"])];
  if (water === "Low") crops = crops.filter(c => !["Paddy", "Sugarcane", "Banana"].includes(c));
  if (water === "High" && !crops.includes("Paddy") && ["Alluvial", "Clay"].includes(soil)) crops.unshift("Paddy");
  crops = [...new Set(crops)].slice(0, 3);

  if (message) message.textContent = `Suggested options for ${currentLocationName}, Tamil Nadu (${season} season, ${soil.toLowerCase()} soil, ${water.toLowerCase()} water availability). These are general suggestions, not a substitute for local soil testing or agricultural extension advice.`;
  if (list) {
    list.innerHTML = "";
    crops.forEach((crop, index) => {
      const card = document.createElement("div");
      const reason = water === "Low"
        ? "Consider water-efficient cultivation and confirm local rainfall and soil moisture."
        : water === "High"
          ? "Assured water may support this option; follow local crop calendars."
          : "Match irrigation to crop stage and current soil moisture.";
      card.innerHTML = `<h3>${index + 1}. ${crop}</h3><p>${reason}</p>`;
      list.appendChild(card);
    });
  }
}

window.recommendCrops = recommendCrops;

function tileLayerForMode() {
  if (satelliteMode === "satellite") {
    return L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 19, attribution: "Tiles &copy; Esri"
    });
  }
  return L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19, attribution: "&copy; OpenStreetMap contributors"
  });
}

function setSatelliteStatus(message) {
  if ($("satellite-status")) $("satellite-status").textContent = message;
}

function moveMapTo(lat, lon, label) {
  if (!satelliteMap) return;
  satelliteMap.setView([lat, lon], 16);
  satelliteMarker.setLatLng([lat, lon]).bindPopup(`Farm location: ${label}`).openPopup();
  setSatelliteStatus(`Showing ${satelliteMode} map for ${label}.`);
}

async function searchSatelliteLocation() {
  const input = $("satellite-location-input");
  const place = input?.value.trim();
  if (!place) {
    setSatelliteStatus("Please enter a village, town or farm location.");
    input?.focus();
    return;
  }
  setSatelliteStatus(`Searching for ${place}...`);
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(place + ", Tamil Nadu, India")}`;
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("Location search is temporarily unavailable.");
    const results = await response.json();
    if (!results.length) throw new Error("Location not found. Try a nearby town or village.");
    moveMapTo(Number(results[0].lat), Number(results[0].lon), results[0].display_name || place);
  } catch (error) {
    setSatelliteStatus(error.message || "Unable to search for that location.");
  }
}

function useDeviceLocation() {
  if (!navigator.geolocation) {
    setSatelliteStatus("This browser does not support location access.");
    return;
  }
  setSatelliteStatus("Requesting your device location...");
  navigator.geolocation.getCurrentPosition(
    position => moveMapTo(position.coords.latitude, position.coords.longitude, "your current location"),
    error => {
      const messages = {
        1: "Location permission was denied. You can search for your farm instead.",
        2: "Your location could not be determined. Please try searching.",
        3: "Location request timed out. Please try again."
      };
      setSatelliteStatus(messages[error.code] || "Unable to get your location.");
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
  );
}

function toggleMapView() {
  if (!satelliteMap || !satelliteLayer) return;
  satelliteMap.removeLayer(satelliteLayer);
  satelliteMode = satelliteMode === "satellite" ? "street" : "satellite";
  satelliteLayer = tileLayerForMode().addTo(satelliteMap);
  const button = $("satellite-view-toggle");
  if (button) button.textContent = satelliteMode === "satellite" ? "Switch to Street View" : "Switch to Satellite View";
  setSatelliteStatus(`${satelliteMode === "satellite" ? "Satellite imagery" : "Street map"} is active.`);
}

function initializeMap() {
  const element = $("satelliteMap");
  if (!element) return;
  if (typeof L === "undefined") {
    setSatelliteStatus("Map library could not load. Check your internet connection.");
    return;
  }
  if (satelliteMap) return;

  const start = [11.3410, 77.7172]; // Erode, Tamil Nadu
  satelliteMap = L.map("satelliteMap").setView(start, 13);
  satelliteLayer = tileLayerForMode().addTo(satelliteMap);
  satelliteMarker = L.marker(start).addTo(satelliteMap)
    .bindPopup("Farm location: Erode, Tamil Nadu").openPopup();

  $("satellite-search-button")?.addEventListener("click", searchSatelliteLocation);
  $("satellite-location-input")?.addEventListener("keydown", event => {
    if (event.key === "Enter") searchSatelliteLocation();
  });
  $("satellite-geolocation-button")?.addEventListener("click", useDeviceLocation);
  $("satellite-view-toggle")?.addEventListener("click", toggleMapView);
  setSatelliteStatus("Satellite imagery loaded. Default map location: Erode, Tamil Nadu.");
  setTimeout(() => satelliteMap?.invalidateSize(), 250);
}

document.addEventListener("DOMContentLoaded", () => {
  $("weather-btn")?.addEventListener("click", () => loadWeather($("farm-location")?.value || "Erode"));
  $("farm-location")?.addEventListener("change", event => updateLocationLabels(event.target.value));
  $("crop-season")?.addEventListener("change", () => {
    // Keep recommendations user-triggered so selections are not silently submitted.
  });
  initializeMap();
  const initialLocation = $("farm-location")?.value || "Erode";
  loadWeather(initialLocation);
});
