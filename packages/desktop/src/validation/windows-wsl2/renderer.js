'use strict';

const translations = {
  en: {
    eyebrow: 'validation_only_non_binding',
    title: 'OPL Windows WSL2 Validation',
    subtitle:
      'Read-only readiness for the disposable Linux fixture. This candidate does not provide chat, login, update, repair, or installation.',
    refresh: 'Refresh',
    loading: 'Reading bounded validation status...',
    failed: 'The bounded status readback failed.',
    boundaryTitle: 'Not Available In This Candidate',
    boundaries: [
      'ACP conversation',
      'Authenticated bootstrap',
      'WebSocket conversation',
      'Login, update, repair, installer, and arbitrary guest commands',
    ],
    cards: {
      guest: 'Guest identity',
      aioncore: 'AionCore health',
      codex: 'Direct Codex App Server',
      framework: 'Framework state',
    },
  },
  zh: {
    eyebrow: 'validation_only_non_binding',
    title: 'OPL Windows WSL2 技术验证',
    subtitle: '仅只读检查一次性 Linux fixture 的就绪状态；此候选不提供聊天、登录、更新、修复或安装。',
    refresh: '刷新',
    loading: '正在读取受限验证状态...',
    failed: '受限状态读取失败。',
    boundaryTitle: '此候选不提供的能力',
    boundaries: ['ACP 对话', '认证 bootstrap', 'WebSocket 对话', '登录、更新、修复、安装和任意 guest 命令'],
    cards: {
      guest: 'Guest 身份',
      aioncore: 'AionCore 健康状态',
      codex: 'Direct Codex App Server',
      framework: 'Framework 状态',
    },
  },
};

const locale = navigator.language.toLowerCase().startsWith('zh') ? translations.zh : translations.en;
const byId = (id) => document.getElementById(id);

function setupCopy() {
  byId('eyebrow').textContent = locale.eyebrow;
  byId('title').textContent = locale.title;
  byId('subtitle').textContent = locale.subtitle;
  byId('refresh').textContent = locale.refresh;
  byId('boundary-title').textContent = locale.boundaryTitle;
  const list = byId('boundary-list');
  for (const item of locale.boundaries) {
    const li = document.createElement('li');
    li.textContent = item;
    list.append(li);
  }
}

function addCard(title, status) {
  const card = document.createElement('article');
  card.className = 'status-card';
  const heading = document.createElement('h2');
  heading.textContent = title;
  const state = document.createElement('span');
  state.className = `state state-${status.state || 'unavailable'}`;
  state.textContent = status.state || 'unavailable';
  const detail = document.createElement('p');
  detail.className = 'detail';
  detail.textContent = status.detail || locale.failed;
  card.append(heading, state, detail);
  return card;
}

function render(status) {
  const grid = byId('status-grid');
  grid.replaceChildren(
    addCard(locale.cards.guest, status.guest),
    addCard(locale.cards.aioncore, status.aioncore),
    addCard(locale.cards.codex, status.codex),
    addCard(locale.cards.framework, status.framework)
  );
}

async function refresh() {
  const button = byId('refresh');
  button.disabled = true;
  byId('notice').textContent = locale.loading;
  try {
    render(await window.oplWindowsWsl2Validation.refresh());
    byId('notice').textContent = '';
  } catch {
    byId('notice').textContent = locale.failed;
  } finally {
    button.disabled = false;
  }
}

setupCopy();
byId('refresh').addEventListener('click', () => void refresh());
void refresh();
