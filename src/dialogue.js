// 对白和台词（台词稿见 docs/对白.md）。改台词只改这个文件。
// 说话人：romeo 罗密欧、juliet 朱丽叶、mercutio 茂丘西奥、tybalt 提伯尔特、narrator 旁白（没有头像）。

export const PEOPLE = {
  romeo: { name: '罗密欧', img: 'assets/portraits/romeo.jpg', side: 'left' },
  juliet: { name: '朱丽叶', img: 'assets/portraits/juliet.jpg', side: 'right' },
  mercutio: { name: '茂丘西奥', img: 'assets/portraits/mercutio.jpg', side: 'right' },
  tybalt: { name: '提伯尔特', img: 'assets/portraits/tybalt.jpg', side: 'right' },
  narrator: { name: '', img: null, side: 'center' },
};

// 幕间对话：[说话人, 台词]。{ choice: '问题', who } 表示这里"对话里选回答"，三个回答是三张技能卡。
export const SCENES = {
  prologue: [
    ['narrator', '维罗纳城里，蒙太古家和卡普莱特家是几代的世仇。'],
    ['mercutio', '罗密欧！卡普莱特家今晚开假面舞会，我们混进去！'],
    ['romeo', '去仇家的舞会？会被认出来的。'],
    ['mercutio', '戴上面具嘛。……算了，你这颗黄脑袋，戴不戴都显眼。'],
    ['romeo', '……走。'],
  ],
  act1End: [
    ['romeo', '她是谁？连烛光都没有她亮。'],
    ['juliet', '好心的朝圣者，你的手也太冒失了。'],
  ],
  act1To2: [
    ['narrator', '舞会散了，罗密欧才知道：她是仇家的独生女。'],
    ['mercutio', '仇家的女儿！你还要去找她？凭什么？'],
    { choice: '罗密欧会怎么回答？', who: 'romeo' },
    ['romeo', '仇家又怎样。翻墙！'],
  ],
};

// 打斗中的喊话：第一幕按时间（秒）触发
export const ACT1_LINES = [
  { t: 0.5, who: 'romeo', text: '乐队……怎么自己动起来了？' },
  { t: 2.5, who: 'mercutio', text: '两家的仇恨附在乐器上了！唱你的情歌！' },
  { t: 5, who: 'mercutio', text: '左手拖着走，右手拖着瞄！' },
  { t: 9, who: 'mercutio', text: '右手不碰，你也会自己唱。' },
  { t: 16, who: 'mercutio', text: '一大群鸟嘴面具要冲过来了，别一个一个打！', tag: 'warnBird' },
  { t: 34, who: 'tybalt', text: '这声音……是蒙太古家的小子！', tag: 'tybalt' },
  { t: 37, who: 'mercutio', text: '别理那头牛，先活下来。' },
];

export const EVENT_LINES = {
  firstLevel: { who: 'mercutio', text: '唱得好！挑一首新歌！' },
  lowHp: { who: 'romeo', text: '这舞会也太热情了……' },
  levelUp: [
    { who: 'mercutio', text: '好歌！再来一首！' },
    { who: 'mercutio', text: '这首我会跟着哼。' },
    { who: 'romeo', text: '灵感来了。' },
  ],
};

export const DEATH = {
  1: '罗密欧没能见到朱丽叶。故事还没开始，就结束了。',
  2: '阳台上的灯亮到天亮，也没等到他。',
  3: '两家的仇恨里，又多了一个名字。',
};

// 每个技能配一句情话（技能卡上的小字、对话里选回答）
export const LOVE = {
  chord: '一首歌不够，我为你唱三个声部。',
  echo: '就算背对着你，我的歌也会回到你身边。',
  sustain: '我的歌能穿过所有的墙。',
  forte: '我要唱得整个维罗纳都听见。',
  arpeggio: '我的歌会从一个人传到下一个人。',
  presto: '一刻也等不及了。',
  drum: '我的心跳得像一面鼓。',
  orbit: '我的歌会一直绕着你。',
  stride: '为了你，什么墙我都翻得过。',
  hymn: '只要想到你，我就不会倒下。',
};

// 名画卡（画是我们重画的油画，卡上写原作的出处）
export const PAINTINGS = {
  1: {
    img: 'assets/paintings/act1-masquerade.jpg',
    title: '《罗密欧与朱丽叶在假面舞会上》',
    by: '威廉·汉密尔顿 画，弗朗切斯科·巴尔托洛齐 刻，1785 年',
    where: '美国大都会艺术博物馆藏',
    facts: [
      '这幅版画下面刻的，正是朱丽叶那句台词："好心的朝圣者，你的手也太冒失了。"（第一幕第五场）',
      '我们重画的版本里，背后盯着罗密欧的那个人，换成了提伯尔特。',
    ],
  },
};
