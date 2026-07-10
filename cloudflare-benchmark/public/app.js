const HISTORY_API_LIMIT = 100;

const state = {
  games: [],
  datasets: {},
  currentGameId: null,
  favoriteModels: [],
  notes: [],
  models: [],
  filteredModels: [],
  selectedModelIds: new Set(),
  latestReport: null,
  history: [],
  historyAvailable: true,
  running: false,
  stopRequested: false,
  completedCalls: 0,
  totalCalls: 0,
  audioElement: new Audio(),
  audioLineId: null,
  audioLoadingLineId: null,
};

state.audioElement.preload = 'none';

const elements = {
  sourceLink: document.getElementById('source-link'),
  currentGameTag: document.getElementById('current-game-tag'),
  gameSelect: document.getElementById('game-select'),
  gameSummary: document.getElementById('game-summary'),
  notesList: document.getElementById('notes-list'),
  datasetList: document.getElementById('dataset-list'),
  modelList: document.getElementById('model-list'),
  modelSummary: document.getElementById('model-summary'),
  modelSearch: document.getElementById('model-search'),
  refreshModels: document.getElementById('refresh-models'),
  selectFavorites: document.getElementById('select-favorites'),
  selectVisible: document.getElementById('select-visible'),
  selectAllBenchmarkable: document.getElementById('select-all-benchmarkable'),
  clearSelection: document.getElementById('clear-selection'),
  temperature: document.getElementById('temperature'),
  maxTokens: document.getElementById('max-tokens'),
  timeoutMs: document.getElementById('timeout-ms'),
  concurrency: document.getElementById('concurrency'),
  useNoThink: document.getElementById('use-no-think'),
  runBenchmark: document.getElementById('run-benchmark'),
  stopBenchmark: document.getElementById('stop-benchmark'),
  statSelectedModels: document.getElementById('stat-selected-models'),
  statLines: document.getElementById('stat-lines'),
  statCompletedCalls: document.getElementById('stat-completed-calls'),
  runState: document.getElementById('run-state'),
  progressBar: document.getElementById('progress-bar'),
  progressText: document.getElementById('progress-text'),
  summaryCards: document.getElementById('summary-cards'),
  historySummary: document.getElementById('history-summary'),
  historyLeaderboard: document.getElementById('history-leaderboard'),
  clearHistory: document.getElementById('clear-history'),
  leaderboard: document.getElementById('leaderboard'),
  modelDetails: document.getElementById('model-details'),
  downloadReport: document.getElementById('download-report'),
};

document.addEventListener('DOMContentLoaded', () => {
  bindEvents();
  bootstrap();
});

function bindEvents() {
  elements.gameSelect.addEventListener('change', handleGameChange);
  elements.refreshModels.addEventListener('click', loadModels);
  elements.modelSearch.addEventListener('input', renderModelList);
  elements.selectFavorites.addEventListener('click', selectFavorites);
  elements.selectVisible.addEventListener('click', selectVisible);
  elements.selectAllBenchmarkable.addEventListener('click', selectAllBenchmarkable);
  elements.clearSelection.addEventListener('click', clearSelection);
  elements.runBenchmark.addEventListener('click', runBenchmark);
  elements.stopBenchmark.addEventListener('click', stopBenchmark);
  elements.downloadReport.addEventListener('click', downloadReport);
  elements.clearHistory.addEventListener('click', clearHistory);

  state.audioElement.addEventListener('waiting', () => {
    if (!state.audioLineId) {
      return;
    }
    state.audioLoadingLineId = state.audioLineId;
    renderDataset();
  });

  state.audioElement.addEventListener('playing', () => {
    state.audioLoadingLineId = null;
    renderDataset();
  });

  state.audioElement.addEventListener('ended', () => {
    stopVoicePlayback(true);
    renderDataset();
  });

  state.audioElement.addEventListener('error', () => {
    const failedLineId = state.audioLineId;
    stopVoicePlayback(true);
    renderDataset();
    if (failedLineId) {
      setProgressText(`Voice preview failed for ${failedLineId}.`);
    }
  });
}

async function bootstrap() {
  setRunState('idle', 'Loading benchmark lab data...');

  try {
    const response = await fetch('/api/bootstrap');
    const payload = normalizeBootstrapPayload(await response.json());

    state.games = payload.games;
    state.datasets = payload.datasets;
    state.favoriteModels = payload.favoriteModels;
    state.notes = payload.notes;
    state.currentGameId = pickInitialGameId(payload.defaultGameId, payload.games, payload.datasets);

    renderGameOptions();
    renderNotes();
    renderActiveGame();
    await loadHistory();
    await loadModels();
    setRunState('idle', 'Ready to benchmark.');
  } catch (error) {
    setRunState('error', `Bootstrap failed: ${error.message || error}`);
  }
}

function normalizeBootstrapPayload(payload) {
  if (payload?.games && payload?.datasets) {
    return {
      defaultGameId: payload.defaultGameId || payload.games[0]?.id || null,
      games: Array.isArray(payload.games) ? payload.games : [],
      datasets: payload.datasets || {},
      favoriteModels: Array.isArray(payload.favoriteModels) ? payload.favoriteModels : [],
      notes: Array.isArray(payload.notes) ? payload.notes : [],
    };
  }

  const fallbackGameId = payload?.defaultGameId || 'ff14';
  const fallbackDataset = Array.isArray(payload?.dataset) ? payload.dataset : [];

  return {
    defaultGameId: fallbackGameId,
    games: [{
      id: fallbackGameId,
      label: 'Final Fantasy XIV',
      shortLabel: 'FF14',
      sourceUrl: payload?.sourceUrl || '',
      description: 'Legacy bootstrap payload detected.',
      voiceSupport: fallbackDataset.some((line) => Boolean(line.voiceUrl)),
      lineCount: fallbackDataset.length,
    }],
    datasets: {
      [fallbackGameId]: fallbackDataset,
    },
    favoriteModels: Array.isArray(payload?.favoriteModels) ? payload.favoriteModels : [],
    notes: Array.isArray(payload?.notes) ? payload.notes : [],
  };
}

function pickInitialGameId(defaultGameId, games, datasets) {
  if (defaultGameId && datasets[defaultGameId]) {
    return defaultGameId;
  }

  const firstGame = games.find((game) => datasets[game.id]);
  if (firstGame) {
    return firstGame.id;
  }

  return Object.keys(datasets)[0] || null;
}

async function loadModels() {
  elements.modelSummary.textContent = 'Fetching models...';
  try {
    const response = await fetch('/api/models');
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || 'Failed to fetch models');
    }

    state.models = Array.isArray(payload.models) ? payload.models : [];
    pruneModelSelection();

    if (!state.selectedModelIds.size) {
      state.favoriteModels.forEach((modelId) => {
        if (state.models.some((item) => item.id === modelId)) {
          state.selectedModelIds.add(modelId);
        }
      });
    }

    renderModelList();
    updateSelectionStats();
  } catch (error) {
    elements.modelSummary.textContent = `Failed to fetch models: ${error.message || error}`;
  }
}

function pruneModelSelection() {
  const availableModelIds = new Set(state.models.map((model) => model.id));
  state.selectedModelIds = new Set(
    [...state.selectedModelIds].filter((modelId) => availableModelIds.has(modelId)),
  );
}

function handleGameChange(event) {
  const nextGameId = event.currentTarget.value;
  if (!nextGameId || nextGameId === state.currentGameId) {
    return;
  }

  state.currentGameId = nextGameId;
  stopVoicePlayback(true);
  state.latestReport = null;
  renderActiveGame();
  renderEmptyReport();
  renderHistory();
  elements.downloadReport.disabled = true;
  setRunState('idle', `Switched to ${getCurrentGame()?.label || 'dataset'}.`);
}

function renderGameOptions() {
  elements.gameSelect.innerHTML = state.games.map((game) => `
    <option value="${escapeHtml(game.id)}">${escapeHtml(game.label)}</option>
  `).join('');

  if (state.currentGameId) {
    elements.gameSelect.value = state.currentGameId;
  }
}

function renderNotes() {
  if (!state.notes.length) {
    elements.notesList.innerHTML = '';
    return;
  }

  elements.notesList.innerHTML = state.notes.map((note) => `
    <article class="note-card">${escapeHtml(note)}</article>
  `).join('');
}

function renderActiveGame() {
  const game = getCurrentGame();
  const dataset = getCurrentDataset();

  if (!game) {
    elements.currentGameTag.textContent = 'No dataset';
    elements.gameSummary.textContent = 'No game dataset is currently available.';
    elements.datasetList.innerHTML = '<div class="empty-state">No dialogue lines available.</div>';
    elements.sourceLink.textContent = '';
    elements.statLines.textContent = '0';
    return;
  }

  document.title = `${game.shortLabel || game.label} NVIDIA Benchmark Lab`;
  elements.currentGameTag.textContent = game.shortLabel || game.label;
  elements.gameSummary.textContent = buildGameSummary(game, dataset.length);
  elements.statLines.textContent = String(dataset.length);
  renderSourceLink(game);
  renderDataset();
}

function buildGameSummary(game, lineCount) {
  const parts = [game.description || `${game.label} subtitle benchmark.`, `${lineCount} lines loaded.`];
  parts.push(game.voiceSupport ? 'Voice previews are available for supported lines.' : 'Text-only benchmark sample.');
  return parts.join(' ');
}

function renderSourceLink(game) {
  elements.sourceLink.innerHTML = '';

  const label = document.createElement('span');
  label.textContent = `${game.label} source: `;
  elements.sourceLink.appendChild(label);

  if (game.sourceUrl) {
    const anchor = document.createElement('a');
    anchor.href = game.sourceUrl;
    anchor.target = '_blank';
    anchor.rel = 'noreferrer';
    anchor.textContent = game.sourceUrl;
    elements.sourceLink.appendChild(anchor);
  } else {
    const fallback = document.createElement('span');
    fallback.textContent = 'No external source URL provided.';
    elements.sourceLink.appendChild(fallback);
  }
}

function renderDataset() {
  const dataset = getCurrentDataset();
  const game = getCurrentGame();

  if (!dataset.length) {
    elements.datasetList.innerHTML = '<div class="empty-state">No dialogue lines available.</div>';
    return;
  }

  elements.datasetList.innerHTML = dataset.map((line) => {
    const isPlaying = state.audioLineId === line.id && !state.audioLoadingLineId;
    const isLoading = state.audioLoadingLineId === line.id;
    const voiceButton = line.voiceUrl ? `
      <button class="chip voice-button ${isPlaying ? 'is-active' : ''}" data-line-id="${escapeHtml(line.id)}">
        ${isLoading ? 'Loading voice...' : isPlaying ? 'Pause voice' : 'Play voice'}
      </button>
    ` : '';

    return `
      <article class="dataset-item">
        <div class="dataset-topline">
          <div>
            <strong>${escapeHtml(line.speaker)}</strong>
            <span class="badge favorite">${escapeHtml(line.id)}</span>
          </div>
          ${game?.voiceSupport ? voiceButton : ''}
        </div>
        <p>${escapeHtml(line.text)}</p>
        <p class="dataset-reference">参考译文：${escapeHtml(line.reference)}</p>
      </article>
    `;
  }).join('');

  elements.datasetList.querySelectorAll('.voice-button').forEach((button) => {
    button.addEventListener('click', async (event) => {
      const lineId = event.currentTarget.dataset.lineId;
      await toggleVoicePlayback(lineId);
    });
  });
}

async function toggleVoicePlayback(lineId) {
  const line = getCurrentDataset().find((item) => item.id === lineId && item.voiceUrl);
  if (!line) {
    return;
  }

  if (state.audioLineId === lineId && !state.audioElement.paused) {
    stopVoicePlayback(true);
    renderDataset();
    return;
  }

  stopVoicePlayback(true);
  state.audioLineId = lineId;
  state.audioLoadingLineId = lineId;
  state.audioElement.src = line.voiceUrl;
  renderDataset();

  try {
    await state.audioElement.play();
  } catch (error) {
    stopVoicePlayback(true);
    renderDataset();
    setProgressText(`Voice preview failed: ${error.message || error}`);
  }
}

function stopVoicePlayback(resetSource = false) {
  state.audioElement.pause();
  state.audioLineId = null;
  state.audioLoadingLineId = null;

  if (resetSource) {
    state.audioElement.removeAttribute('src');
    state.audioElement.load();
  }
}

function renderModelList() {
  const query = elements.modelSearch.value.trim().toLowerCase();
  state.filteredModels = state.models.filter((model) => {
    if (!query) {
      return true;
    }
    return model.id.toLowerCase().includes(query) || (model.provider || '').toLowerCase().includes(query);
  });

  const benchmarkableCount = state.models.filter((item) => item.benchmarkable).length;
  elements.modelSummary.textContent = `${state.models.length} models loaded, ${benchmarkableCount} look benchmarkable for chat.`;

  if (!state.filteredModels.length) {
    elements.modelList.innerHTML = '<div class="empty-state">No models match the current search.</div>';
    return;
  }

  elements.modelList.innerHTML = state.filteredModels.map((model) => {
    const selected = state.selectedModelIds.has(model.id);
    return `
      <label class="model-item">
        <input type="checkbox" data-model-id="${escapeHtml(model.id)}" ${selected ? 'checked' : ''} />
        <div class="model-meta">
          <div class="model-title-row">
            <strong>${escapeHtml(model.id)}</strong>
          </div>
          <div class="badge-row">
            ${model.favorite ? '<span class="badge favorite">favorite</span>' : ''}
            ${model.benchmarkable ? '<span class="badge supported">chat-like</span>' : '<span class="badge unsure">non-chat risk</span>'}
            <span class="badge">${escapeHtml(model.provider)}</span>
          </div>
        </div>
      </label>
    `;
  }).join('');

  elements.modelList.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
    checkbox.addEventListener('change', (event) => {
      const modelId = event.currentTarget.dataset.modelId;
      if (event.currentTarget.checked) {
        state.selectedModelIds.add(modelId);
      } else {
        state.selectedModelIds.delete(modelId);
      }
      updateSelectionStats();
    });
  });
}

function selectFavorites() {
  state.favoriteModels.forEach((modelId) => {
    if (state.models.some((item) => item.id === modelId)) {
      state.selectedModelIds.add(modelId);
    }
  });
  renderModelList();
  updateSelectionStats();
}

function selectVisible() {
  state.filteredModels.forEach((model) => state.selectedModelIds.add(model.id));
  renderModelList();
  updateSelectionStats();
}

function selectAllBenchmarkable() {
  state.models.filter((model) => model.benchmarkable).forEach((model) => state.selectedModelIds.add(model.id));
  renderModelList();
  updateSelectionStats();
}

function clearSelection() {
  state.selectedModelIds.clear();
  renderModelList();
  updateSelectionStats();
}

function updateSelectionStats() {
  elements.statSelectedModels.textContent = String(state.selectedModelIds.size);
}

async function runBenchmark() {
  if (state.running) {
    return;
  }

  const selectedModels = [...state.selectedModelIds];
  const game = getCurrentGame();
  const dataset = getCurrentDataset();

  if (!game) {
    setRunState('error', 'Please choose a dataset first.');
    return;
  }

  if (!dataset.length) {
    setRunState('error', 'The selected dataset has no dialogue lines.');
    return;
  }

  if (!selectedModels.length) {
    setRunState('error', 'Please select at least one model.');
    return;
  }

  state.running = true;
  state.stopRequested = false;
  state.completedCalls = 0;
  state.totalCalls = selectedModels.length * dataset.length;
  state.latestReport = null;

  elements.gameSelect.disabled = true;
  elements.runBenchmark.disabled = true;
  elements.stopBenchmark.disabled = false;
  elements.downloadReport.disabled = true;
  elements.statCompletedCalls.textContent = '0';
  elements.progressBar.style.width = '0%';
  setRunState('running', `Running ${state.totalCalls} ${game.shortLabel || game.label} model-line calls...`);

  const options = {
    maxTokens: parseInt(elements.maxTokens.value, 10) || 160,
    temperature: parseFloat(elements.temperature.value) || 0.1,
    timeoutMs: parseInt(elements.timeoutMs.value, 10) || 25000,
    concurrency: parseInt(elements.concurrency.value, 10) || 3,
    useNoThink: elements.useNoThink.checked,
  };

  const tasks = [];
  for (const modelId of selectedModels) {
    for (const line of dataset) {
      tasks.push({ gameId: game.id, modelId, lineId: line.id });
    }
  }

  const resultsByModel = new Map();
  let nextTaskIndex = 0;

  const workers = Array.from({ length: Math.max(1, options.concurrency) }, async () => {
    while (nextTaskIndex < tasks.length && !state.stopRequested) {
      const task = tasks[nextTaskIndex];
      nextTaskIndex += 1;

      setProgressText(`Testing ${task.modelId} / ${task.lineId}...`);
      const result = await evaluateTask(task, options);
      const current = resultsByModel.get(task.modelId) || [];
      current.push(result);
      resultsByModel.set(task.modelId, current);

      state.completedCalls += 1;
      elements.statCompletedCalls.textContent = String(state.completedCalls);
      elements.progressBar.style.width = `${Math.min(100, (state.completedCalls / state.totalCalls) * 100)}%`;
      setProgressText(`Completed ${state.completedCalls}/${state.totalCalls} calls`);
    }
  });

  await Promise.all(workers);

  state.running = false;
  elements.gameSelect.disabled = false;
  elements.runBenchmark.disabled = false;
  elements.stopBenchmark.disabled = true;

  const report = buildClientReport(game, selectedModels, resultsByModel, options);
  state.latestReport = report;
  renderReport(report);
  elements.downloadReport.disabled = false;

  if (!state.stopRequested && state.completedCalls === state.totalCalls) {
    await saveReportToHistory(report);
  }

  if (state.stopRequested) {
    setRunState('idle', `Stopped early at ${state.completedCalls}/${state.totalCalls} calls.`);
  } else {
    setRunState('done', `Completed ${state.completedCalls}/${state.totalCalls} calls.`);
  }
}

function stopBenchmark() {
  state.stopRequested = true;
  setRunState('idle', 'Stopping after current in-flight requests...');
}

async function evaluateTask(task, options) {
  try {
    const response = await fetch('/api/evaluate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        gameId: task.gameId,
        modelId: task.modelId,
        lineId: task.lineId,
        maxTokens: options.maxTokens,
        temperature: options.temperature,
        timeoutMs: options.timeoutMs,
        useNoThink: options.useNoThink,
      }),
    });

    const payload = await response.json();
    return payload.normalized || buildClientErrorResult(task, 'Missing normalized benchmark payload');
  } catch (error) {
    return buildClientErrorResult(task, error.message || String(error));
  }
}

function buildClientErrorResult(task, message) {
  const line = getLine(task.gameId, task.lineId);
  return {
    lineId: task.lineId,
    speaker: line?.speaker || '-',
    source: line?.text || '',
    rawContent: '',
    cleanedContent: '',
    finishReason: null,
    thinkingLeak: false,
    usable: false,
    accuracyScore: 0,
    overallScore: 0,
    responseMs: 0,
    error: message,
  };
}

function buildClientReport(game, selectedModels, resultsByModel, options) {
  const models = selectedModels.map((modelId) => summarizeModel(modelId, resultsByModel.get(modelId) || []));
  models.sort((left, right) => {
    if (right.overallAverage !== left.overallAverage) {
      return right.overallAverage - left.overallAverage;
    }
    return (left.averageLatencyMs || Number.MAX_SAFE_INTEGER) - (right.averageLatencyMs || Number.MAX_SAFE_INTEGER);
  });

  return {
    generatedAt: new Date().toISOString(),
    gameId: game.id,
    gameLabel: game.label,
    gameShortLabel: game.shortLabel || game.label,
    sourceUrl: game.sourceUrl || null,
    options,
    dataset: getCurrentDataset(),
    models,
  };
}

function summarizeModel(modelId, results) {
  const successful = results.filter((item) => !item.error);
  const usable = results.filter((item) => item.usable);
  const leaks = results.filter((item) => item.thinkingLeak);
  const averageLatencyMs = average(successful.map((item) => item.responseMs));
  const accuracyAverage = average(successful.map((item) => item.accuracyScore));
  const overallAverage = average(successful.map((item) => item.overallScore));
  const usableRate = results.length ? (usable.length / results.length) * 100 : 0;
  const leakRate = results.length ? (leaks.length / results.length) * 100 : 0;

  return {
    modelId,
    verdict: determineVerdict(usableRate, averageLatencyMs, accuracyAverage, leakRate),
    averageLatencyMs: round(averageLatencyMs || 0, 1),
    accuracyAverage: round(accuracyAverage || 0, 1),
    overallAverage: round(overallAverage || 0, 1),
    usableRate: round(usableRate, 1),
    leakRate: round(leakRate, 1),
    results,
  };
}

function determineVerdict(usableRate, averageLatencyMs, accuracyAverage, leakRate) {
  if (usableRate >= 80 && averageLatencyMs && averageLatencyMs <= 3000 && accuracyAverage >= 70 && leakRate <= 20) {
    return 'Recommended for realtime subtitles';
  }
  if (usableRate >= 60 && averageLatencyMs && averageLatencyMs <= 8000 && accuracyAverage >= 60) {
    return 'Usable with caveats';
  }
  if (usableRate >= 40 && accuracyAverage >= 45) {
    return 'Borderline for live subtitles';
  }
  return 'Not suitable for low-latency subtitles';
}

function renderReport(report) {
  renderSummary(report);
  renderLeaderboard(report);
  renderModelDetails(report);
}

function renderSummary(report) {
  if (!report.models.length) {
    elements.summaryCards.innerHTML = '<div class="empty-state">No completed results yet.</div>';
    return;
  }

  const winner = report.models[0];
  const fastest = [...report.models].filter((item) => item.averageLatencyMs > 0).sort((a, b) => a.averageLatencyMs - b.averageLatencyMs)[0];
  const cleanest = [...report.models].sort((a, b) => a.leakRate - b.leakRate || b.usableRate - a.usableRate)[0];
  const strongest = [...report.models].sort((a, b) => b.accuracyAverage - a.accuracyAverage)[0];

  elements.summaryCards.classList.remove('empty-state');
  elements.summaryCards.innerHTML = [
    createSummaryCard('Best Overall', winner.modelId, `Overall ${winner.overallAverage}`, winner.verdict),
    createSummaryCard('Fastest', fastest?.modelId || '-', `${fastest?.averageLatencyMs || '-'} ms avg`, `${fastest?.usableRate || 0}% usable`),
    createSummaryCard('Best Accuracy', strongest?.modelId || '-', `Accuracy ${strongest?.accuracyAverage || 0}`, `${strongest?.usableRate || 0}% usable`),
    createSummaryCard('Cleanest Output', cleanest?.modelId || '-', `Leak ${cleanest?.leakRate || 0}%`, `${cleanest?.usableRate || 0}% usable`),
  ].join('');
}

function createSummaryCard(label, title, metric, note) {
  return `
    <article class="summary-card">
      <div class="summary-card-topline">
        <div>
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(title)}</strong>
        </div>
      </div>
      <p>${escapeHtml(metric)}</p>
      <p class="subcopy">${escapeHtml(note)}</p>
    </article>
  `;
}

function renderLeaderboard(report) {
  if (!report.models.length) {
    elements.leaderboard.className = 'table-shell empty-state';
    elements.leaderboard.innerHTML = 'No benchmark rows to show yet.';
    return;
  }

  elements.leaderboard.className = 'table-shell';
  elements.leaderboard.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Model</th>
          <th>Verdict</th>
          <th>Accuracy</th>
          <th>Avg Latency</th>
          <th>Think Leak</th>
          <th>Usable</th>
          <th>Overall</th>
        </tr>
      </thead>
      <tbody>
        ${report.models.map((model, index) => `
          <tr>
            <td><span class="lb-rank rank-${index + 1}">${index + 1}</span></td>
            <td>${formatModelCell(model.modelId)}</td>
            <td>${formatVerdict(model.verdict)}</td>
            <td class="lb-num">${model.accuracyAverage}</td>
            <td class="lb-num">${model.averageLatencyMs} ms</td>
            <td class="lb-leak ${model.leakRate > 0 ? 'warn' : 'ok'}">${model.leakRate}%</td>
            <td class="lb-num">${model.usableRate}%</td>
            <td>${formatScoreBar(model.overallAverage)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function formatModelCell(modelId = '') {
  const parts = String(modelId).split('/');
  if (parts.length >= 2) {
    const provider = parts.shift();
    return `<span class="lb-model">${escapeHtml(parts.join('/'))} <span class="lb-provider">· ${escapeHtml(provider)}</span></span>`;
  }
  return `<span class="lb-model">${escapeHtml(modelId)}</span>`;
}

function formatVerdict(verdict = '') {
  const v = String(verdict).toLowerCase();
  let cls = 'v-bad';
  if (v.includes('recommended')) cls = 'v-good';
  else if (v.includes('usable')) cls = 'v-ok';
  else if (v.includes('borderline')) cls = 'v-weak';
  const short = v.includes('recommended') ? '推荐' : v.includes('usable') ? '可用' : v.includes('borderline') ? '勉强' : '不适合';
  return `<span class="verdict ${cls}" title="${escapeHtml(verdict)}">${short}</span>`;
}

function formatScoreBar(score = 0) {
  const pct = Math.max(0, Math.min(100, Number(score) || 0));
  return `<div class="score-cell"><div class="score-bar"><span style="width:${pct}%"></span></div><span class="score-val">${score}</span></div>`;
}

function renderModelDetails(report) {
  if (!report.models.length) {
    elements.modelDetails.className = 'detail-stack empty-state';
    elements.modelDetails.innerHTML = 'No benchmark details yet.';
    return;
  }

  elements.modelDetails.className = 'detail-stack';
  elements.modelDetails.innerHTML = report.models.map((model) => `
    <article class="detail-card">
      <div class="detail-topline">
        <div>
          <h3>${escapeHtml(model.modelId)}</h3>
          <p class="subcopy">${escapeHtml(model.verdict)}</p>
        </div>
        <div class="badge-row">
          <span class="badge favorite">Overall ${model.overallAverage}</span>
          <span class="badge supported">Usable ${model.usableRate}%</span>
          <span class="badge ${model.leakRate > 0 ? 'unsure' : 'supported'}">Leak ${model.leakRate}%</span>
        </div>
      </div>
      <div class="detail-grid">
        <div class="metric-card"><span class="metric-label">Avg Latency</span><strong>${model.averageLatencyMs} ms</strong></div>
        <div class="metric-card"><span class="metric-label">Accuracy</span><strong>${model.accuracyAverage}</strong></div>
        <div class="metric-card"><span class="metric-label">Usable Rate</span><strong>${model.usableRate}%</strong></div>
        <div class="metric-card"><span class="metric-label">Think Leak</span><strong>${model.leakRate}%</strong></div>
      </div>
      <div class="result-table-shell">
        <table>
          <thead>
            <tr>
              <th>Line</th>
              <th>Latency</th>
              <th>Finish</th>
              <th>Leak</th>
              <th>Usable</th>
              <th>Accuracy</th>
              <th class="translation-cell">Source</th>
              <th class="translation-cell">Translation</th>
            </tr>
          </thead>
          <tbody>
            ${model.results.map((result) => `
              <tr>
                <td>${escapeHtml(result.lineId)}<br /><span class="subcopy">${escapeHtml(result.speaker)}</span></td>
                <td>${result.responseMs} ms</td>
                <td>${escapeHtml(result.finishReason || result.error || '-')}</td>
                <td>${result.thinkingLeak ? 'Yes' : 'No'}</td>
                <td>${result.usable ? 'Yes' : 'No'}</td>
                <td>${result.accuracyScore}</td>
                <td class="translation-cell">${escapeHtml(result.source)}</td>
                <td class="translation-cell">${escapeHtml(result.cleanedContent || result.rawContent || result.error || '')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </article>
  `).join('');
}

function renderEmptyReport() {
  elements.summaryCards.className = 'summary-cards empty-state';
  elements.summaryCards.innerHTML = 'Run a benchmark to see best overall, fastest, most accurate, and cleanest models.';
  elements.leaderboard.className = 'table-shell empty-state';
  elements.leaderboard.innerHTML = 'Choose models and run a benchmark to populate the live leaderboard.';
  elements.modelDetails.className = 'detail-stack empty-state';
  elements.modelDetails.innerHTML = 'Per-line translation output, latency, and usability details will appear here.';
}

async function loadHistory() {
  const game = getCurrentGame();
  const searchParams = new URLSearchParams({ limit: String(HISTORY_API_LIMIT) });
  if (game?.id) {
    searchParams.set('gameId', game.id);
  }

  try {
    const response = await fetch(`/api/history?${searchParams.toString()}`);
    const payload = await response.json();
    state.historyAvailable = payload.available !== false;
    state.history = Array.isArray(payload.entries) ? payload.entries : [];
  } catch {
    state.historyAvailable = false;
    state.history = [];
  }

  renderHistory();
}

async function saveReportToHistory(report) {
  try {
    const response = await fetch('/api/history', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        entry: buildHistoryEntryFromReport(report),
      }),
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || 'Failed to save history');
    }

    state.historyAvailable = payload.available !== false;
    state.history = Array.isArray(payload.entries) ? payload.entries : state.history;
    renderHistory();
  } catch (error) {
    state.historyAvailable = false;
    renderHistory();
    setProgressText(`Benchmark finished, but cloud history save failed: ${error.message || error}`);
  }
}

function buildHistoryEntryFromReport(report) {
  return {
    id: `${report.gameId}:${report.generatedAt}`,
    generatedAt: report.generatedAt,
    gameId: report.gameId,
    gameLabel: report.gameLabel,
    gameShortLabel: report.gameShortLabel,
    options: report.options,
    models: report.models.map((model) => ({
      modelId: model.modelId,
      verdict: model.verdict,
      averageLatencyMs: model.averageLatencyMs,
      accuracyAverage: model.accuracyAverage,
      overallAverage: model.overallAverage,
      usableRate: model.usableRate,
      leakRate: model.leakRate,
    })),
  };
}

async function clearHistory() {
  const game = getCurrentGame();
  if (!state.historyAvailable || !state.history.length || !game) {
    return;
  }

  const confirmed = window.confirm(`Clear all saved cloud benchmark history for ${game.label}?`);
  if (!confirmed) {
    return;
  }

  try {
    const searchParams = new URLSearchParams({ gameId: game.id });
    const response = await fetch(`/api/history?${searchParams.toString()}`, {
      method: 'DELETE',
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || 'Failed to clear history');
    }

    state.historyAvailable = payload.available !== false;
    state.history = [];
    renderHistory();
  } catch (error) {
    setProgressText(`Cloud history clear failed: ${error.message || error}`);
  }
}

function renderHistory() {
  const game = getCurrentGame();
  const historyEntries = Array.isArray(state.history) ? state.history : [];
  const ranking = buildHistoryRanking(historyEntries);

  if (!game) {
    elements.historySummary.textContent = 'No dataset selected.';
    elements.historyLeaderboard.className = 'table-shell empty-state';
    elements.historyLeaderboard.innerHTML = 'Select a game to view saved benchmark history.';
    elements.clearHistory.disabled = true;
    return;
  }

  if (!state.historyAvailable) {
    elements.historySummary.textContent = `Cloud history is unavailable for ${game.label}. Configure the D1 binding to persist leaderboard data across sessions.`;
    elements.historyLeaderboard.className = 'table-shell empty-state';
    elements.historyLeaderboard.innerHTML = 'History storage is currently unavailable.';
    elements.clearHistory.disabled = true;
    return;
  }

  elements.historySummary.textContent = historyEntries.length
    ? `${historyEntries.length} saved runs for ${game.label}. Rankings reward consistency across runs, with average overall score and latency weighted most heavily.`
    : `No saved runs for ${game.label} yet. Completed benchmark runs will appear here automatically.`;

  elements.clearHistory.disabled = historyEntries.length === 0;

  if (!ranking.length) {
    elements.historyLeaderboard.className = 'table-shell empty-state';
    elements.historyLeaderboard.innerHTML = 'No historical rankings yet.';
    return;
  }

  elements.historyLeaderboard.className = 'table-shell';
  elements.historyLeaderboard.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Model</th>
          <th>Runs</th>
          <th>Consistency</th>
          <th>Avg Overall</th>
          <th>Best Overall</th>
          <th>Best Accuracy</th>
          <th>Best Latency</th>
          <th>Avg Usable</th>
          <th>Last Seen</th>
        </tr>
      </thead>
      <tbody>
        ${ranking.map((row, index) => `
          <tr>
            <td><span class="lb-rank rank-${index + 1}">${index + 1}</span></td>
            <td>${formatModelCell(row.modelId)} ${formatVerdict(row.latestVerdict)}</td>
            <td class="lb-num">${row.runs}</td>
            <td class="lb-num">${row.consistencyScore}</td>
            <td>${formatScoreBar(row.averageOverall)}</td>
            <td class="lb-num">${row.bestOverall}</td>
            <td class="lb-num">${row.bestAccuracy}</td>
            <td class="lb-num">${row.bestLatencyMs > 0 ? `${row.bestLatencyMs} ms` : '-'}</td>
            <td class="lb-num">${row.averageUsableRate}%</td>
            <td class="lb-num">${escapeHtml(formatTimestamp(row.lastSeenAt))}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function buildHistoryRanking(entries) {
  const ranking = new Map();

  entries.forEach((entry) => {
    (entry.models || []).forEach((model) => {
      const current = ranking.get(model.modelId) || {
        modelId: model.modelId,
        runs: 0,
        totalOverall: 0,
        totalUsableRate: 0,
        totalLatencyMs: 0,
        latencySamples: 0,
        bestOverall: 0,
        bestAccuracy: 0,
        bestLatencyMs: 0,
        bestUsableRate: 0,
        latestVerdict: model.verdict,
        lastSeenAt: entry.generatedAt,
      };

      current.runs += 1;
      current.totalOverall += model.overallAverage || 0;
      current.totalUsableRate += model.usableRate || 0;
      current.bestOverall = Math.max(current.bestOverall, model.overallAverage || 0);
      current.bestAccuracy = Math.max(current.bestAccuracy, model.accuracyAverage || 0);
      current.bestUsableRate = Math.max(current.bestUsableRate, model.usableRate || 0);

      if (model.averageLatencyMs > 0) {
        current.totalLatencyMs += model.averageLatencyMs;
        current.latencySamples += 1;
        current.bestLatencyMs = current.bestLatencyMs > 0
          ? Math.min(current.bestLatencyMs, model.averageLatencyMs)
          : model.averageLatencyMs;
      }

      if (!current.lastSeenAt || entry.generatedAt > current.lastSeenAt) {
        current.latestVerdict = model.verdict;
        current.lastSeenAt = entry.generatedAt;
      }

      ranking.set(model.modelId, current);
    });
  });

  return [...ranking.values()]
    .map((item) => ({
      ...item,
      averageOverall: round(item.totalOverall / item.runs, 1),
      averageUsableRate: round(item.totalUsableRate / item.runs, 1),
      averageLatencyMs: item.latencySamples ? round(item.totalLatencyMs / item.latencySamples, 1) : 0,
      bestOverall: round(item.bestOverall, 1),
      bestAccuracy: round(item.bestAccuracy, 1),
      bestLatencyMs: round(item.bestLatencyMs, 1),
      bestUsableRate: round(item.bestUsableRate, 1),
      consistencyScore: 0,
    }))
    .map((item) => ({
      ...item,
      consistencyScore: round(calculateHistoryConsistencyScore(item), 1),
    }))
    .sort((left, right) => {
      if (right.consistencyScore !== left.consistencyScore) {
        return right.consistencyScore - left.consistencyScore;
      }
      if (right.averageOverall !== left.averageOverall) {
        return right.averageOverall - left.averageOverall;
      }
      if (right.averageUsableRate !== left.averageUsableRate) {
        return right.averageUsableRate - left.averageUsableRate;
      }
      const leftLatency = left.averageLatencyMs || Number.MAX_SAFE_INTEGER;
      const rightLatency = right.averageLatencyMs || Number.MAX_SAFE_INTEGER;
      return leftLatency - rightLatency;
    });
}

function calculateHistoryConsistencyScore(item) {
  const latencyScore = scoreHistoryLatency(item.averageLatencyMs);
  const runCountBonus = Math.min(item.runs, 6);

  return (
    item.averageOverall * 0.45
    + item.averageUsableRate * 0.15
    + latencyScore * 0.35
    + runCountBonus
  );
}

function scoreHistoryLatency(latencyMs) {
  if (!latencyMs || latencyMs <= 0) {
    return 0;
  }
  if (latencyMs <= 2000) {
    return 100;
  }
  if (latencyMs <= 3000) {
    return 92;
  }
  if (latencyMs <= 4000) {
    return 82;
  }
  if (latencyMs <= 5000) {
    return 70;
  }
  if (latencyMs <= 6500) {
    return 55;
  }
  if (latencyMs <= 8000) {
    return 40;
  }
  if (latencyMs <= 10000) {
    return 25;
  }
  if (latencyMs <= 12000) {
    return 12;
  }
  return 0;
}

function downloadReport() {
  if (!state.latestReport) {
    return;
  }

  const blob = new Blob([JSON.stringify(state.latestReport, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${state.latestReport.gameId}-benchmark-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function setRunState(mode, text) {
  elements.runState.textContent = mode === 'done' ? 'Done' : mode === 'running' ? 'Running' : mode === 'error' ? 'Error' : 'Idle';
  elements.runState.className = `status-pill ${mode}`;
  setProgressText(text);
}

function setProgressText(text) {
  elements.progressText.textContent = text;
}

function getCurrentGame() {
  return state.games.find((game) => game.id === state.currentGameId) || null;
}

function getCurrentDataset() {
  return state.currentGameId ? (state.datasets[state.currentGameId] || []) : [];
}

function getLine(gameId, lineId) {
  const dataset = state.datasets[gameId] || [];
  return dataset.find((line) => line.id === lineId) || null;
}

function formatTimestamp(value) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value, digits = 0) {
  return Number((value || 0).toFixed(digits));
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
