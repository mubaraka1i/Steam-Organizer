const THEME_KEY = 'guideRail_theme';
const GAMES_STORAGE_KEY = 'guideRail_games';
const ETA_WEEKLY_STORAGE_KEY = 'guideRail_eta_weekly';

function applyTheme(theme) {
  document.body.classList.toggle('light-theme', theme === 'blue');
}

function initThemeToggle() {
  const savedTheme = localStorage.getItem(THEME_KEY) || 'green';
  applyTheme(savedTheme);

  const toggleBtn = document.getElementById('theme-toggle');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const current = localStorage.getItem(THEME_KEY) || 'green';
      const next = current === 'green' ? 'blue' : 'green';
      localStorage.setItem(THEME_KEY, next);
      applyTheme(next);
    });
  }
}

function loadGames() {
  try {
    const raw = localStorage.getItem(GAMES_STORAGE_KEY);
    if (!raw) return [];
    const games = JSON.parse(raw);
    return Array.isArray(games) ? games : [];
  } catch {
    return [];
  }
}

function loadEtaSchedule() {
  try {
    const raw = localStorage.getItem(ETA_WEEKLY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function saveEtaSchedule(schedule) {
  try {
    localStorage.setItem(ETA_WEEKLY_STORAGE_KEY, JSON.stringify(schedule));
  } catch (error) {
    console.error('Failed to save ETA schedule', error);
  }
}

function estimateBacklogHours(games) {
  return games.reduce((sum, game) => {
    const track = game.track || 'unassigned';
    const isOnLine = track === 'mainline' || track === 'branch' || track === 'sidetrack';
    const hasCompletion = Number(game.completionHours) > 0;
    if (!isOnLine || !hasCompletion || String(game.status || '').toLowerCase() === 'complete') {
      return sum;
    }
    return sum + Number(game.completionHours);
  }, 0);
}

function formatDuration(hours) {
  const safeHours = Math.max(0, Number(hours) || 0);
  const totalDays = safeHours / 24;
  const totalWeeks = totalDays / 7;
  const months = totalWeeks / 4.345;
  if (months >= 12) {
    return `${(months / 12).toFixed(1)} years`;
  }
  if (months >= 1) {
    return `${months.toFixed(1)} months`;
  }
  if (totalWeeks >= 1) {
    return `${totalWeeks.toFixed(1)} weeks`;
  }
  return `${safeHours.toFixed(1)} hours`;
}

document.addEventListener('DOMContentLoaded', () => {
  initThemeToggle();

  const etaForm = document.getElementById('eta-form');
  const etaResults = document.getElementById('eta-results');
  const etaResetBtn = document.getElementById('eta-reset-btn');
  const etaInputs = {
    monday: document.getElementById('eta-monday'),
    tuesday: document.getElementById('eta-tuesday'),
    wednesday: document.getElementById('eta-wednesday'),
    thursday: document.getElementById('eta-thursday'),
    friday: document.getElementById('eta-friday'),
    saturday: document.getElementById('eta-saturday'),
    sunday: document.getElementById('eta-sunday'),
  };
  const dayKeys = Object.keys(etaInputs);

  const applyEtaSchedule = (schedule) => {
    dayKeys.forEach((day) => {
      const input = etaInputs[day];
      if (!input) return;
      input.value = String(schedule && schedule[day] !== undefined ? schedule[day] : 0);
    });
  };

  applyEtaSchedule(loadEtaSchedule());

  dayKeys.forEach((day) => {
    const input = etaInputs[day];
    if (!input) return;
    input.addEventListener('input', () => {
      const currentSchedule = loadEtaSchedule() || {};
      currentSchedule[day] = Number(input.value) || 0;
      saveEtaSchedule(currentSchedule);
      calculateEta();
    });
  });

  const calculateEta = () => {
    if (!etaResults) return;

    const games = loadGames();
    const backlogHours = estimateBacklogHours(games);
    const weeklyHours = dayKeys.reduce((sum, day) => sum + (Number(etaInputs[day]?.value) || 0), 0);

    etaResults.hidden = false;

    if (backlogHours <= 0) {
      etaResults.textContent = 'Import your library and place games on a line to calculate an ETA.';
      return;
    }

    if (weeklyHours <= 0) {
      etaResults.textContent = 'Enter at least one gaming hour across the week.';
      return;
    }

    const etaHours = (backlogHours / weeklyHours) * 24 * 7;
    const weeks = backlogHours / weeklyHours;
    const days = weeks * 7;
    const finishDate = new Date();
    finishDate.setDate(finishDate.getDate() + Math.ceil(days));

    etaResults.textContent = `Weekly total: ${weeklyHours.toFixed(1)}h. Estimated time to clear your backlog: ${formatDuration(etaHours)}. Estimated finish: ${finishDate.toLocaleDateString()}.`;
  };

  if (etaForm) {
    etaForm.addEventListener('submit', (event) => {
      event.preventDefault();
      calculateEta();
    });
  }

  if (etaResetBtn) {
    etaResetBtn.addEventListener('click', () => {
      dayKeys.forEach((day) => {
        if (etaInputs[day]) {
          etaInputs[day].value = '0';
        }
      });
      saveEtaSchedule({ monday: 0, tuesday: 0, wednesday: 0, thursday: 0, friday: 0, saturday: 0, sunday: 0 });
      if (etaResults) {
        etaResults.hidden = true;
        etaResults.textContent = '';
      }
    });
  }

  if (etaResults) {
    etaResults.hidden = false;
    etaResults.textContent = 'Enter your weekly hours and click Calculate.';
    calculateEta();
  }
});
