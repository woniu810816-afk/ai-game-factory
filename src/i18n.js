/**
 * 《INVESTITURE: Relic Forge》V1.0 核心玩法 MVP 双语字典
 * - 默认简洁地道英文（en），顶部提供轻量 EN / 中 一键实时切换（zh）
 * - 严守视觉红线：绝不包含任何日文字符
 */

const LANG_STORAGE_KEY = 'irf_mvp_lang_v1';

const DICT = {
  en: {
    titleMain: 'INVESTITURE',
    titleSub: 'RELIC FORGE',
    mvpTag: '8-LANE TURN-BASED BRONZE PUZZLE DEFENSE',
    bootLoading: 'KINDLING THE BRONZE FORGE...',
    bootReady: 'READY!',
    langBtn: 'EN / 中',
    sfxOn: 'SFX ON',
    sfxOff: 'SFX OFF',
    playBtn: 'PLAY',
    bestScore: (n) => `BEST SCORE: ${n}`,
    ruleFlame: 'FLAME · Pierce & Burn',
    ruleThunder: 'THUNDER · Chain Lightning',
    ruleTide: 'TIDE · Knockback & Shield',
    menuHint: '1 PLACEMENT = 1 ENEMY STEP · ZERO TIMER\nCLEAR COLUMNS TO STRIKE ALIGNED LANES · CLEAR ROWS TO SWEEP',
    waveLabel: (cur, max) => `WAVE ${cur}/${max}`,
    bossWaveLabel: (cur, max) => `BOSS ${cur}/${max}`,
    scoreLabel: (n) => `SCORE ${n}`,
    gateLabel: (hp, max, sh) => (sh > 0 ? `GATE ${hp}/${max} (+${sh})` : `GATE ${hp}/${max}`),
    resonanceTitle: 'RESONANCE ×2!',
    previewCol: (lane) => `STRIKE LANE ${lane}`,
    previewRow: 'SWEEP FRONT LINE',
    previewRes: 'RESONANCE ×2!',
    turnHint: 'PLACE BLOCK TO ACT · ENEMIES MARCH 1 STEP',
    bossIncoming: 'WAVE 10 · BRONZE DEMON KING!',
    castCol: {
      fire: 'FLAME PIERCE!',
      thunder: 'THUNDER CHAIN!',
      tide: 'TIDE PUSH + SHIELD!'
    },
    castRow: {
      fire: 'FLAME SWEEP!',
      thunder: 'SKY LIGHTNING!',
      tide: 'TIDE WAVE + SHIELD!'
    },
    victoryTitle: 'VICTORY!',
    victorySub: 'THE BRONZE DEMON KING HAS FALLEN',
    defeatGateTitle: 'GATE BREACHED',
    defeatBoardTitle: 'FORGE FULL',
    defeatSub: 'THE SHANG BRONZE GATE FELL',
    statScore: 'SCORE',
    statWave: 'WAVE',
    statSlain: 'SLAIN',
    playAgain: 'PLAY AGAIN',
    mainMenu: 'MENU'
  },
  zh: {
    titleMain: '封神锻炉',
    titleSub: '天劫破阵',
    mvpTag: '8列对齐 · 同步回合制五行破阵',
    bootLoading: '正在点亮商周青铜锻炉...',
    bootReady: '锻炉就绪！',
    langBtn: '中 / EN',
    sfxOn: '音效开',
    sfxOff: '音效关',
    playBtn: '开炉破阵',
    bestScore: (n) => `历史最高战功：${n}`,
    ruleFlame: '火 · 高伤穿透灼烧',
    ruleThunder: '金 · 邻道连锁天雷',
    ruleTide: '水 · 击退妖魔护盾',
    menuHint: '每落 1 子，妖魔推进 1 格 · 无倒计时焦虑\n消竖列直轰对应纵道 · 消横行横扫八道前排',
    waveLabel: (cur, max) => `第 ${cur}/${max} 波`,
    bossWaveLabel: (cur, max) => `妖王 ${cur}/${max}`,
    scoreLabel: (n) => `战功 ${n}`,
    gateLabel: (hp, max, sh) => (sh > 0 ? `阵门 ${hp}/${max} (+${sh})` : `阵门 ${hp}/${max}`),
    resonanceTitle: '天道共鸣 ×2！',
    previewCol: (lane) => `锁定第 ${lane} 纵道`,
    previewRow: '横扫八道前排',
    previewRes: '共鸣双倍威力！',
    turnHint: '拖放拼图出招 · 落子后妖魔同步前移 1 格',
    bossIncoming: '第 10 波 · 巨型青铜妖王降临！',
    castCol: {
      fire: '火尖枪·穿透灼烧！',
      thunder: '打神鞭·三连天雷！',
      tide: '玄水涛·击退护盾！'
    },
    castRow: {
      fire: '赤焰斩·横扫前排！',
      thunder: '九霄雷·多目标天雷！',
      tide: '惊涛波·全屏击退！'
    },
    victoryTitle: '封神破阵！',
    victorySub: '已成功斩杀第 10 波巨型青铜妖王',
    defeatGateTitle: '青铜阵门失守',
    defeatBoardTitle: '八卦锻炉已满',
    defeatSub: '商周阵门在妖潮中陷落',
    statScore: '最终战功',
    statWave: '坚守波次',
    statSlain: '斩妖数',
    playAgain: '再来一局',
    mainMenu: '主界面'
  }
};

class I18nManager {
  constructor() {
    this.lang = this._loadLang();
  }

  _loadLang() {
    try {
      if (typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem(LANG_STORAGE_KEY);
        if (saved === 'en' || saved === 'zh') return saved;
      }
    } catch (_) {}
    return 'en';
  }

  setLang(next) {
    this.lang = next === 'zh' ? 'zh' : 'en';
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(LANG_STORAGE_KEY, this.lang);
    } catch (_) {}
    return this.lang;
  }

  toggle() {
    return this.setLang(this.lang === 'en' ? 'zh' : 'en');
  }

  get pack() {
    return DICT[this.lang] || DICT.en;
  }

  t(key, ...args) {
    const val = this.pack[key];
    if (typeof val === 'function') return val(...args);
    return val !== undefined ? val : key;
  }
}

export const i18n = new I18nManager();
