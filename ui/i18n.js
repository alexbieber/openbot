// OpenBot UI Internationalization
// Supported: en, zh-CN, zh-TW, pt-BR, de, es

export const LOCALES = {
  en: {
    name: 'English',
    dir: 'ltr',
    t: {
      chat: 'Chat', memory: 'Memory', agents: 'Agents', skills: 'Skills',
      channels: 'Channels', cron: 'Cron', tokens: 'Tokens', approvals: 'Approvals',
      devices: 'Devices', debug: 'Debug', config: 'Config', logs: 'Logs', update: 'Update',
      send: 'Send', typeMessage: 'Type a message…',
      newSession: 'New session',
      settings: 'Settings',
      loading: 'Loading…',
      error: 'Error',
      connected: 'Connected',
      disconnected: 'Disconnected',
      save: 'Save', cancel: 'Cancel', delete: 'Delete', approve: 'Approve', deny: 'Deny',
      search: 'Search',
      noData: 'No data available.',
      confirmDelete: 'Are you sure you want to delete this?',
      darkMode: 'Dark mode', lightMode: 'Light mode',
    },
  },
  'zh-CN': {
    name: '中文 (简体)',
    dir: 'ltr',
    t: {
      chat: '对话', memory: '记忆', agents: '助手', skills: '技能',
      channels: '频道', cron: '定时', tokens: '用量', approvals: '审批',
      devices: '设备', debug: '调试', config: '配置', logs: '日志', update: '更新',
      send: '发送', typeMessage: '输入消息…',
      newSession: '新对话',
      settings: '设置',
      loading: '加载中…',
      error: '错误',
      connected: '已连接',
      disconnected: '已断开',
      save: '保存', cancel: '取消', delete: '删除', approve: '批准', deny: '拒绝',
      search: '搜索',
      noData: '暂无数据。',
      confirmDelete: '确定要删除吗？',
      darkMode: '深色模式', lightMode: '浅色模式',
    },
  },
  'zh-TW': {
    name: '中文 (繁體)',
    dir: 'ltr',
    t: {
      chat: '對話', memory: '記憶', agents: '助理', skills: '技能',
      channels: '頻道', cron: '排程', tokens: '用量', approvals: '審批',
      devices: '裝置', debug: '除錯', config: '設定', logs: '日誌', update: '更新',
      send: '傳送', typeMessage: '輸入訊息…',
      newSession: '新對話',
      settings: '設定',
      loading: '載入中…',
      error: '錯誤',
      connected: '已連線',
      disconnected: '已斷線',
      save: '儲存', cancel: '取消', delete: '刪除', approve: '核准', deny: '拒絕',
      search: '搜尋',
      noData: '目前沒有資料。',
      confirmDelete: '確定要刪除嗎？',
      darkMode: '深色模式', lightMode: '淺色模式',
    },
  },
  'pt-BR': {
    name: 'Português (BR)',
    dir: 'ltr',
    t: {
      chat: 'Chat', memory: 'Memória', agents: 'Agentes', skills: 'Habilidades',
      channels: 'Canais', cron: 'Agendador', tokens: 'Tokens', approvals: 'Aprovações',
      devices: 'Dispositivos', debug: 'Depuração', config: 'Configuração', logs: 'Logs', update: 'Atualizar',
      send: 'Enviar', typeMessage: 'Digite uma mensagem…',
      newSession: 'Nova sessão',
      settings: 'Configurações',
      loading: 'Carregando…',
      error: 'Erro',
      connected: 'Conectado',
      disconnected: 'Desconectado',
      save: 'Salvar', cancel: 'Cancelar', delete: 'Excluir', approve: 'Aprovar', deny: 'Negar',
      search: 'Pesquisar',
      noData: 'Nenhum dado disponível.',
      confirmDelete: 'Tem certeza que deseja excluir?',
      darkMode: 'Modo escuro', lightMode: 'Modo claro',
    },
  },
  de: {
    name: 'Deutsch',
    dir: 'ltr',
    t: {
      chat: 'Chat', memory: 'Speicher', agents: 'Agenten', skills: 'Fähigkeiten',
      channels: 'Kanäle', cron: 'Zeitplan', tokens: 'Token', approvals: 'Genehmigungen',
      devices: 'Geräte', debug: 'Debugging', config: 'Konfiguration', logs: 'Protokolle', update: 'Aktualisierung',
      send: 'Senden', typeMessage: 'Nachricht eingeben…',
      newSession: 'Neue Sitzung',
      settings: 'Einstellungen',
      loading: 'Laden…',
      error: 'Fehler',
      connected: 'Verbunden',
      disconnected: 'Getrennt',
      save: 'Speichern', cancel: 'Abbrechen', delete: 'Löschen', approve: 'Genehmigen', deny: 'Ablehnen',
      search: 'Suchen',
      noData: 'Keine Daten verfügbar.',
      confirmDelete: 'Wirklich löschen?',
      darkMode: 'Dunkelmodus', lightMode: 'Hellmodus',
    },
  },
  es: {
    name: 'Español',
    dir: 'ltr',
    t: {
      chat: 'Chat', memory: 'Memoria', agents: 'Agentes', skills: 'Habilidades',
      channels: 'Canales', cron: 'Programador', tokens: 'Tokens', approvals: 'Aprobaciones',
      devices: 'Dispositivos', debug: 'Depuración', config: 'Configuración', logs: 'Registros', update: 'Actualizar',
      send: 'Enviar', typeMessage: 'Escribe un mensaje…',
      newSession: 'Nueva sesión',
      settings: 'Configuración',
      loading: 'Cargando…',
      error: 'Error',
      connected: 'Conectado',
      disconnected: 'Desconectado',
      save: 'Guardar', cancel: 'Cancelar', delete: 'Eliminar', approve: 'Aprobar', deny: 'Denegar',
      search: 'Buscar',
      noData: 'No hay datos disponibles.',
      confirmDelete: '¿Estás seguro de que quieres eliminar esto?',
      darkMode: 'Modo oscuro', lightMode: 'Modo claro',
    },
  },
};

export function detectLocale() {
  const saved = localStorage.getItem('openbot_locale');
  if (saved && LOCALES[saved]) return saved;
  const nav = navigator.language || navigator.userLanguage || 'en';
  if (nav.startsWith('zh-TW') || nav.startsWith('zh-HK')) return 'zh-TW';
  if (nav.startsWith('zh')) return 'zh-CN';
  if (nav.startsWith('pt')) return 'pt-BR';
  if (nav.startsWith('de')) return 'de';
  if (nav.startsWith('es')) return 'es';
  return 'en';
}

export class I18n {
  constructor(locale) {
    this.locale = locale || detectLocale();
    this.strings = LOCALES[this.locale]?.t || LOCALES.en.t;
  }

  t(key) {
    return this.strings[key] || LOCALES.en.t[key] || key;
  }

  setLocale(locale) {
    if (!LOCALES[locale]) return false;
    this.locale = locale;
    this.strings = LOCALES[locale].t;
    localStorage.setItem('openbot_locale', locale);
    return true;
  }

  getLocaleList() {
    return Object.entries(LOCALES).map(([code, l]) => ({ code, name: l.name, dir: l.dir }));
  }
}
