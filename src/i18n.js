/**
 * 《INVESTITURE: Relic Forge / 封神锻炉：天劫破阵》全局双语模块
 * - 默认英文（en）面向欧美及全球玩家
 * - 支持游戏顶部一键实时切换 EN / 中（简体中文 zh），持久化至 localStorage
 * - 严守视觉规范：绝不包含任何日文字符
 */

const LANG_STORAGE_KEY = 'irf_lang_v1';

const DICT = {
  en: {
    titleMain: 'INVESTITURE',
    titleSub: 'RELIC FORGE',
    tagline: 'FIVE ELEMENTS · SHANG BRONZE DEFENSE',
    bootLoading: 'KINDLING THE BRONZE FURNACE...',
    bootReady: 'FORGE READY!',
    essenceUnit: 'ESSENCE',
    bestScore: 'BEST',
    bestWave: 'MAX WAVE',
    warlordsHeader: 'WARLORDS',
    warlordsTip: 'SELECT YOUR GUARDIAN',
    equipped: 'EQUIPPED',
    ownedTap: 'OWNED · TAP',
    unlockCost: (cost) => `UNLOCK · ${cost}`,
    unlockedBanner: (name) => `UNLOCKED ${name}!`,
    needEssence: (n) => `NEED ${n} MORE ESSENCE`,
    playNow: 'FORGE & DEFEND',
    leaderboard: 'GLOBAL LEADERBOARD',
    leaderboardTitle: 'GLOBAL TOP 10',
    leaderboardLive: 'LIVE SINGAPORE CLOUD RANKINGS',
    leaderboardLocal: 'LOCAL RANKING (CLOUD READY)',
    leaderboardEmpty: 'NO RECORDS YET. CLAIM #1!',
    close: 'CLOSE',
    controlsTip: 'DRAG RELIC BLOCKS INTO THE 5×5 BAGUA FORGE\nFILL ROWS OR COLUMNS TO UNLEASH MYTHIC ARTS',
    sfxOn: 'SFX ON',
    sfxOff: 'SFX OFF',
    langBtn: 'EN / 中',
    wave: (n) => `WAVE ${n}`,
    bossWave: (n) => `BOSS · WAVE ${n}`,
    scoreLabel: (n) => `SCORE ${n}`,
    gateHp: (hp, max) => `GATE ${hp}/${max}`,
    spiritQi: 'SPIRIT QI',
    pauseTitle: 'PAUSED',
    resume: 'RESUME',
    mainMenu: 'MAIN MENU',
    resonanceTitle: 'HEAVENLY RESONANCE ×2!',
    resonanceBonus: 'DOUBLE MYTHIC FURY!',
    noMovesHint: 'FORGE BLOCKED!',
    gateFallenHint: 'BRONZE GATE BREACHED!',
    reviveTitle: 'TAIYI TRUE FIRE',
    reviveDesc: 'Clear 2 crowded rows, push back demons,\nand restore 60% Gate HP to keep fighting!',
    reviveBtn: 'REVIVE WITH TAIYI FIRE (AD)',
    giveUpBtn: 'END RUN',
    decreeTitle: 'PRIMORDIAL DECREE',
    decreeSub: 'CHOOSE 1 MYTHIC BLESSING',
    decreeReroll: 'REROLL DECREES (AD)',
    decreeRerolled: 'DECREES REFRESHED!',
    tribulationRotate: 'TRIBULATION: BAGUA ROTATED 90°!',
    tribulationSeal: 'TRIBULATION: THUNDER SEALED 2 TILES!',
    tribulationPill: 'TRIBULATION: MYSTIC ELIXIR SPAWNED!',
    sealBroken: 'SEAL BROKEN! +QI',
    realPillMsg: 'IMMORTAL ELIXIR! FIVE-ELEMENT BLAST!',
    fakePillMsg: 'DEMON DECOY! AMBUSH!',
    resultNewBest: 'NEW RECORD!',
    resultOver: 'FORGE FALLEN',
    finalScore: 'FINAL SCORE',
    statWave: 'WAVE',
    statSlain: 'SLAIN',
    statEssence: 'ESSENCE',
    doubleEssenceBtn: (n) => `2X ESSENCE (AD) · +${n}`,
    doubleClaimed: (n) => `2X ESSENCE CLAIMED (+${n})`,
    playAgain: 'FORGE AGAIN',
    top3Title: 'GLOBAL TOP 3',
    adSkipped: 'AD NOT COMPLETED',
    savedLocal: (n) => `SAVED LOCALLY · ESSENCE: ${n}`,
    savedCloud: (n) => `CLOUD SYNCED · ESSENCE: ${n}`,
    elements: {
      fire: 'FIRE SPEAR!',
      metal: 'GOD WHIP!',
      earth: 'HEAVEN SEAL!',
      water: 'SKY SILK!',
      wood: 'JADE LOTUS!'
    },
    warlords: {
      nezha: { name: 'NEZHA', passive: 'Fire Spear +35% DMG & extra pierce' },
      yangjian: { name: 'YANG JIAN', passive: 'Armor pierce & God Whip +1 chain' },
      leizhenzi: { name: 'LEIZHENZI', passive: 'Resonance deals 2.6× thunder fury' },
      jiangziya: { name: 'JIANG ZIYA', passive: '+30% Spirit Qi & +15 Gate heal' }
    },
    decrees: {
      fire_split: { name: 'TRIPLE FIRE SPEAR', desc: 'Fire Spear splits into 3 flames (+35% DMG)' },
      metal_chain: { name: 'CHAIN GOD WHIP', desc: 'God Whip jumps to +2 extra demons' },
      earth_stun: { name: 'STUNNING SEAL', desc: 'Heaven Seal widens & stuns for 2.2s' },
      water_surge: { name: 'TIDAL SKY SILK', desc: 'Sky Silk knockback +50% & frost DMG' },
      wood_bastion: { name: 'LOTUS BASTION', desc: 'Every clear heals Gate +8 & shield +6' },
      resonance_echo: { name: 'RESONANCE ECHO', desc: 'Resonance triggers a bonus Heaven Seal' },
      forge_greed: { name: 'ESSENCE CAULDRON', desc: 'Gain +35% Iron Essence from demons' },
      iron_gate: { name: 'SHANG IRON GATE', desc: 'Max Gate HP +40 & heal 40 instantly' }
    }
  },
  zh: {
    titleMain: '封神锻炉',
    titleSub: '天劫破阵',
    tagline: '五行炼宝 · 商周青铜守阵',
    bootLoading: '正在燃起商周青铜锻炉...',
    bootReady: '锻炉就绪！',
    essenceUnit: '玄铁精魄',
    bestScore: '最高分',
    bestWave: '最高波次',
    warlordsHeader: '封神战将',
    warlordsTip: '点击切换或解锁守阵战将',
    equipped: '出战中',
    ownedTap: '已解锁 · 点击出战',
    unlockCost: (cost) => `解锁 · ${cost} 精魄`,
    unlockedBanner: (name) => `已解锁战将：${name}！`,
    needEssence: (n) => `还差 ${n} 玄铁精魄`,
    playNow: '开炉破阵',
    leaderboard: '全球封神榜',
    leaderboardTitle: '全球封神榜 TOP 10',
    leaderboardLive: '新加坡云端实时榜单（已启用防刷分）',
    leaderboardLocal: '本机离线榜单（云端同步就绪）',
    leaderboardEmpty: '暂无上榜记录，快来登顶！',
    close: '关闭',
    controlsTip: '单指拖拽五行法宝块放入 5×5 八卦锻炉\n填满任意整行或整列即刻轰出封神神通',
    sfxOn: '音效开',
    sfxOff: '音效关',
    langBtn: '中 / EN',
    wave: (n) => `第 ${n} 波`,
    bossWave: (n) => `妖王 · 第 ${n} 波`,
    scoreLabel: (n) => `战功 ${n}`,
    gateHp: (hp, max) => `阵门 ${hp}/${max}`,
    spiritQi: '元始灵气',
    pauseTitle: '阵法暂停',
    resume: '继续破阵',
    mainMenu: '返回主界面',
    resonanceTitle: '天道共鸣 ×2！',
    resonanceBonus: '双倍神通爆发！',
    noMovesHint: '八卦锻炉已满！',
    gateFallenHint: '青铜阵门失守！',
    reviveTitle: '太乙真火复活',
    reviveDesc: '焚清锻炉最拥挤的 2 行、击退阵前妖魔\n并恢复 60% 阵门血量继续破阵！',
    reviveBtn: '太乙真火复活（广告）',
    giveUpBtn: '结束本局',
    decreeTitle: '元始敕令',
    decreeSub: '三选一构筑你的封神流派',
    decreeReroll: '天机重抽（广告）',
    decreeRerolled: '敕令已重抽！',
    tribulationRotate: '天劫异变：八卦盘顺时针旋转 90°！',
    tribulationSeal: '天劫异变：紫雷封印 2 格（旁消可解）！',
    tribulationPill: '天劫异变：真假灵丹落入锻炉！',
    sealBroken: '紫雷破封！灵气大涨',
    realPillMsg: '太上金丹！五行震荡波爆发！',
    fakePillMsg: '魔化伪丹！妖影突袭！',
    resultNewBest: '刷新纪录！',
    resultOver: '天劫落幕',
    finalScore: '本局战功',
    statWave: '坚守波次',
    statSlain: '斩妖数',
    statEssence: '玄铁精魄',
    doubleEssenceBtn: (n) => `精魄翻倍（广告）+${n}`,
    doubleClaimed: (n) => `已领双倍精魄（+${n}）`,
    playAgain: '再战封神',
    top3Title: '全球封神榜前三',
    adSkipped: '未完整观看激励广告',
    savedLocal: (n) => `已存本机 · 玄铁精魄：${n}`,
    savedCloud: (n) => `云端已同步 · 玄铁精魄：${n}`,
    elements: {
      fire: '火尖枪·穿透烈焰！',
      metal: '打神鞭·连锁惊雷！',
      earth: '番天印·镇岳崩地！',
      water: '混天绫·惊涛击退！',
      wood: '青莲护阵·回春护盾！'
    },
    warlords: {
      nezha: { name: '哪吒', passive: '火尖枪伤害 +35% 且额外穿透' },
      yangjian: { name: '杨戬', passive: '无视妖魔护甲，打神鞭连锁 +1' },
      leizhenzi: { name: '雷震子', passive: '天道共鸣威力升至 2.6 倍紫雷' },
      jiangziya: { name: '姜子牙', passive: '元始灵气 +30%，木系/敕令额外回血' }
    },
    decrees: {
      fire_split: { name: '火尖枪裂变', desc: '火焰束裂变为三叉烈焰（伤害+35%）' },
      metal_chain: { name: '打神鞭弹射+2', desc: '连锁闪电额外弹射 2 名妖魔' },
      earth_stun: { name: '番天印镇压', desc: '砸击范围扩大并眩晕妖魔 2.2 秒' },
      water_surge: { name: '混天绫巨浪', desc: '全屏击退 +50% 并附带霜波伤害' },
      wood_bastion: { name: '青莲圣愈', desc: '每次消行自动为阵门回血 +8 护盾 +6' },
      resonance_echo: { name: '天道回响', desc: '触发天道共鸣时额外砸落一座番天印' },
      forge_greed: { name: '玄铁聚鼎', desc: '斩杀妖魔获得的玄铁精魄 +35%' },
      iron_gate: { name: '商周铜门', desc: '阵门血量上限 +40 并立即回复 40' }
    }
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

  setLang(nextLang) {
    this.lang = nextLang === 'zh' ? 'zh' : 'en';
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(LANG_STORAGE_KEY, this.lang);
      }
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
