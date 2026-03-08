/**
 * Weather Skill
 * OpenWeatherMap API with wttr.in fallback (no key needed).
 */
import axios from 'axios';

export default async function execute({ location, type = 'current', units = 'metric' }, context = {}) {
  const apiKey = process.env.OPENWEATHER_API_KEY || context.config?.skills?.openWeatherApiKey;
  if (apiKey) return openWeatherMap(location, type, units, apiKey);
  return wttrIn(location, units);
}

async function openWeatherMap(location, type, units, apiKey) {
  const symbol = units === 'metric' ? '°C' : '°F';
  const base = 'https://api.openweathermap.org/data/2.5';

  if (type === 'current') {
    const res = await axios.get(`${base}/weather`, {
      params: { q: location, appid: apiKey, units },
      timeout: 8000,
    });
    const d = res.data;
    return `Weather in ${d.name}, ${d.sys.country}:
🌡️  ${Math.round(d.main.temp)}${symbol} (feels like ${Math.round(d.main.feels_like)}${symbol})
🌤️  ${d.weather[0].description}
💧 Humidity: ${d.main.humidity}%
💨 Wind: ${d.wind.speed} m/s
👁️  Visibility: ${(d.visibility / 1000).toFixed(1)} km`;
  }

  if (type === 'forecast') {
    const res = await axios.get(`${base}/forecast`, {
      params: { q: location, appid: apiKey, units, cnt: 40 },
      timeout: 8000,
    });
    const days = {};
    res.data.list.forEach(item => {
      const date = item.dt_txt.split(' ')[0];
      if (!days[date]) days[date] = [];
      days[date].push(item);
    });
    const lines = Object.entries(days).slice(0, 5).map(([date, items]) => {
      const temps = items.map(i => i.main.temp);
      const desc = items[Math.floor(items.length / 2)].weather[0].description;
      return `📅 ${date}: ${Math.round(Math.min(...temps))}–${Math.round(Math.max(...temps))}${symbol}, ${desc}`;
    });
    return `5-Day Forecast for ${location}:\n${lines.join('\n')}`;
  }

  throw new Error(`Unknown type: ${type}`);
}

async function wttrIn(location, units) {
  const format = units === 'imperial' ? '&m' : '';
  const res = await axios.get(`https://wttr.in/${encodeURIComponent(location)}?format=4${format}`, {
    timeout: 8000,
  });
  return `Weather for ${location}:\n${res.data}`;
}
