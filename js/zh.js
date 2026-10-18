/* 中文 for HoppiTTy Hop: the words on the page, the toasts, the game-over lines, the ? panel and the 3D word bursts
   (Kit.lang, from kit/lang.js). The kids' names and the game's name and logo stay in English on purpose. */
(function () {
  const L = Kit.lang;
  L.keep(['HoppiTTy Hop', 'TEDDY', 'TOMMY', 'Teddy', 'Tommy', 'ZOOM', 'LUNA', 'BOLT', 'BRUNO', 'Claude Code', 'Esc']);

  L.add({
    // title screen
    'Hop across roads, rivers and train tracks with Teddy & Tommy!': '和 Teddy、Tommy 一起跳过马路、小河和铁轨！',
    'PICK YOUR HOPPER': '选择你的角色', 'Pick your hopper': '选择你的角色', 'ZOMBIE': '僵尸',
    'EASY OFF': '简单 关', 'EASY ON': '简单 开',
    'Easy mode (E): slower cars, longer logs, more time between trains': '简单模式 (E)：车开得慢，木头更长，火车隔得更久',
    'hop': '跳', 'call': '叫', 'easy mode': '简单模式', 'sound': '声音',
    'Tap to hop forward · swipe to hop any way': '点一下往前跳 · 滑一下往那边跳',
    "'S BEST": ' 的最高分',
    // HUD and buttons (their tooltips too)
    'Pause (P)': '暂停 (P)', 'Pause': '暂停', 'Sound (M)': '声音 (M)', 'Sound on or off': '声音开关',
    'Call your buddy (T)': '叫兄弟来帮忙 (T)', 'Call Tommy (T)': '叫 Tommy 来帮忙 (T)', 'Call Teddy (T)': '叫 Teddy 来帮忙 (T)',
    'Your buddy has your back': '兄弟在保护你', 'HOP! 🐶': '快跳！🐶',
    '↑ ← → ↓ TO HOP': '↑ ← → ↓ 跳起来', 'TAP TO HOP · SWIPE TO TURN': '点一下往前跳 · 滑一下换方向',
    // pause and game over
    'P · Esc · Space · Tap': 'P · Esc · 空格 · 点一下',
    'BUSTED!': '哎呀！', 'SPLASH!': '扑通！', 'ROWS': '跳了几行', 'COINS': '金币', '★ NEW BEST! ★': '★ 新纪录！★',
    '↻ HOP AGAIN': '↻ 再跳一次', 'Pick another hopper': '换一个角色', 'CHANGE': '换人',
    '🚗 BEEP BEEP! A CAR!': '🚗 嘀嘀！是汽车！', '🍦 THE ICE-CREAM TRUCK!': '🍦 是冰淇淋车！', '🚌 THE BUS GOT YOU!': '🚌 是公交车！',
    '🚇 WHOOSH! THE TRAIN!': '🚇 呼——是火车！', '💦 INTO THE RIVER!': '💦 掉进河里啦！', '💦 THE LOG FLOATED AWAY!': '💦 木头漂走啦！',
    '🐶 THE INSPECTOR CAUGHT YOU!': '🐶 检票员抓到你啦！',
    // toasts while hopping
    'KEEP HOPPING!': '快接着跳！', 'NOT TODAY, INSPECTOR!': '检票员，今天不行哦！', 'LOADING…': '加载中…',
    // 3D word bursts (drawn on a canvas through Kit.lang.t)
    'POW!': '砰！', 'SAVED!': '得救啦！',
    // the ? panel (js/keys.js)
    'hop forward': '往前跳', 'hop sideways': '往旁边跳', 'hop back': '往后跳', 'start a run': '开始一局',
    "Tap anywhere to hop forward, or swipe. Tap your brother's face (bottom right) to call him.":
      '点一下往前跳，或者滑一下。点右下角兄弟的头像叫他来。',
  });

  const TREAT = { 'ICE CREAM': '冰淇淋', WATER: '水', 'JUICE BOX': '果汁', COOKIE: '饼干', WATERMELON: '西瓜', BANANA: '香蕉' };
  L.rule(/^BEST (\d+)( 🐣)?$/, '最高分 $1$2');
  L.rule(/^(.+)'S BEST( 🐣)?$/, '$1 的最高分$2');
  L.rule(/^(\d+) ROWS! 🎉$/, '跳过 $1 行啦！🎉');
  L.rule(/^(.+) SAVED YOU!$/, '$1 救了你！');
  L.rule(/^(.+)'S HERE!$/, '$1 来啦！');
  L.rule(/^(\S+) (ICE CREAM|WATER|JUICE BOX|COOKIE|WATERMELON|BANANA) FROM (.+)!$/, (m, emoji, item, who) => `${emoji} ${who} 送来的${TREAT[item]}！`);
})();
