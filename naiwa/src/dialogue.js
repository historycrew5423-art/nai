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
  act2End: [
    ['juliet', '你若真心爱我，明天就请神父为我们成婚。'],
    ['romeo', '明天，我一定去。'],
  ],
  act2To3: [
    ['narrator', '第二天，神父偷偷为两人主持了婚礼。'],
    ['juliet', '从今天起，你拿什么守护我？'],
    { choice: '罗密欧会怎么回答？', who: 'romeo' },
    ['narrator', '可就在中午的广场上，罗密欧撞见了提伯尔特。'],
    ['tybalt', '蒙太古的小子，拔剑！'],
    ['romeo', '我不想和你打……我们现在是亲戚了。'],
    ['mercutio', '他不打，我来！'],
  ],
  act3End: [
    ['narrator', '提伯尔特倒下了。亲王下令：罗密欧天亮前离开维罗纳，永远不许回来。'],
    ['juliet', '你要走了吗？天还没亮。那是夜莺，不是云雀。'],
    ['romeo', '是云雀。天亮了，我得走了。'],
  ],
  act3To4: [
    ['narrator', '家里逼朱丽叶马上嫁人。神父给了她一小瓶药：喝下去会像死了一样，睡上四十二个小时。'],
    ['narrator', '她被送进了家族的墓室。送信的人没找到罗密欧，他只听说，朱丽叶死了。'],
    ['romeo', '她的嘴唇……还是红的。'],
    ['romeo', '她没有死，她只是睡着了。'],
    { choice: '你想对沉睡的她说什么？', who: 'romeo' },
    ['romeo', '在她醒来之前，谁也别想碰她。'],
  ],
  goodEnd: [
    ['juliet', '罗密欧？你……还活着？'],
    ['romeo', '我们都活着。'],
    ['juliet', '那就走吧，离开维罗纳。'],
    ['narrator', '这一次，故事被你改写了。'],
  ],
  badEnd: [
    ['narrator', '最后一支蜡烛灭了。'],
    ['narrator', '朱丽叶醒来时，只看见倒在身边的罗密欧。'],
  ],
};

// 打斗中的喊话：第一幕按时间（秒）触发
// 缝合版：小怪和喷字是一样一样“上新”的（时间见 src/pacing.js 的 PACE），喊话提前一点预告下一个梗
export const ACT1_LINES = [
  { t: 0.6, who: 'romeo', text: '哈？卡普莱特家的舞会上怎么全是表情包？' },
  { t: 3.2, who: 'mercutio', text: '仇恨附在表情包上了！手指拖着走，张嘴喷它们！' },
  { t: 6.2, who: 'mercutio', text: '一大群咕咕嘎嘎冲过来了！', tag: 'warnBird' },
  { t: 16.8, who: 'mercutio', text: '香蕉猫哭着冲过来了……别心软！' },
  { t: 22.5, who: 'mercutio', text: '走几步会自动闪身步，电脑上按空格也能闪。' },
  { t: 27, who: 'mercutio', text: '那只圆滚滚的猫……要转起来了！' },
  { t: 34, who: 'tybalt', text: '这声音……是蒙太古家的小子！', tag: 'tybalt' },
  { t: 37, who: 'mercutio', text: '别理那头牛，先活下来。' },
];

// 第二幕：朱丽叶在阳台上，只闻其声。三头犬的出场和倒下在 game.js 里触发
export const ACT2_LINES = [
  { t: 0.5, who: 'juliet', text: '罗密欧啊罗密欧，你为什么偏偏是罗密欧？' },
  { t: 3, who: 'romeo', text: '等我打完这群家丁再回答你！' },
  { t: 12, who: 'juliet', text: '名字有什么要紧？玫瑰换个名字，一样香。' },
  { t: 18, who: 'juliet', text: '小心，看门的三头犬放出来了！它皮厚，用最重的歌！' },
];
// 第三幕：广场决斗。茂丘西奥倒下和提伯尔特出场在 game.js 里按时间触发
export const ACT3_LINES = [
  { t: 0.5, who: 'tybalt', text: '卡普莱特的人，给我上！' },
  { t: 3, who: 'mercutio', text: '罗密欧，背靠背！' },
  { t: 9, who: 'mercutio', text: '号角在远处放冷箭！别站着不动！' },
  { t: 16, who: 'mercutio', text: '鲁特琴举着琴身当盾！绕着它打！' },
];
// 第四幕：墓室。朱丽叶说梦话
export const ACT4_LINES = [
  { t: 0.5, who: 'romeo', text: '亡魂……都冲着她来了。' },
  { t: 8, who: 'juliet', text: '（梦话）罗密欧……' },
  { t: 18, who: 'juliet', text: '（梦话）好黑……好冷……' },
  { t: 28, who: 'juliet', text: '（梦话）别走……天还没亮……' },
  { t: 35, who: 'juliet', text: '（梦话）是云雀吗……天亮了吗？' },
];
export const BOSS_LINES = {
  dogIn: { who: 'romeo', text: '三个脑袋……那我唱三遍。' },
  dogDown: { who: 'juliet', text: '它睡着了！' },
  mercutioFall: { who: 'mercutio', text: '我中招了……愿瘟疫降临你们两家！' },
  mercutioFall2: { who: 'romeo', text: '茂丘西奥！！' },
  tybaltIn: { who: 'romeo', text: '提伯尔特，你给我站住！' },
  tybaltIn2: { who: 'tybalt', text: '来啊，唱歌的！' },
  tybaltHalf: { who: 'tybalt', text: '吵死了！你的“哈哈哈”吵死了！' },
  tybaltDown: { who: 'tybalt', text: '……这歌，原来不难听。' },
  calmHalf: { who: 'romeo', text: '离她远点！' },
  calmLow: { who: 'romeo', text: '撑住，朱丽叶，就快天亮了！' },
};

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
  4: '罗密欧倒在了她的身边。',
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
  2: {
    img: 'assets/paintings/act2-brown-balcony.jpg',
    title: '《罗密欧与朱丽叶》',
    by: '福特·马多克斯·布朗 画，1870 年',
    where: '美国特拉华艺术博物馆藏',
    facts: [
      '布朗画的其实不是阳台定情，而是婚后第一个清晨的告别：罗密欧一条腿已经跨过栏杆，绳梯就挂在旁边（第三幕第五场）。',
      '布朗和拉斐尔前派的画家走得很近，这幅画也是那种浓烈鲜艳的配色。',
    ],
  },
  3: {
    img: 'assets/paintings/act3-dicksee-farewell.jpg',
    title: '《罗密欧与朱丽叶》',
    by: '弗兰克·迪克西 画，1884 年',
    where: '英国南安普敦市立美术馆藏',
    facts: [
      '迪克西画的就是这一刻：第三幕第五场，罗密欧被放逐，天亮前在阳台上和朱丽叶告别。',
      '朱丽叶说是夜莺在叫、天还没亮；罗密欧说是云雀，天已经亮了。',
    ],
  },
  bad: {
    img: 'assets/paintings/act4-tomb-tragic.jpg',
    title: '《罗密欧与朱丽叶：墓室》',
    by: '德比的赖特 画，1790 年',
    where: '英国德比博物馆与美术馆藏',
    facts: [
      '莎士比亚写下的结局就是这样：朱丽叶醒来，发现罗密欧已经死去。',
      '德比的赖特最擅长画一盏灯照亮黑暗的场面，亮处和暗处对比很强。',
    ],
  },
  good: {
    img: 'assets/paintings/act4-tomb-rewritten.jpg',
    title: '《罗密欧与朱丽叶：改写的结局》',
    by: '我们的画，用德比的赖特《墓室》（1790 年）的画风画成',
    where: '这一局，由你改写',
    facts: [
      '原剧里罗密欧也注意到了她的嘴唇和脸颊还是红的，却没有想明白，喝下了毒药。这一次，他想明白了。',
      '原版的结局，是赖特那幅《墓室》：没守住朱丽叶，就会看到它。',
    ],
  },
};
