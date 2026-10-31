// 入口：网址带 ?test=1 时进 v0.1 压力测试版（调怪的数量、看帧数），否则进正式游戏。
const test = new URLSearchParams(location.search).has('test');
if (test) {
  document.title = '压力测试（开发用）'; document.getElementById('boot')?.remove();
  import('./stress.js?v=20261031n');
} else {
  for (const id of ['hud', 'buttons']) document.getElementById(id)?.remove();
  import('./game.js?v=20261031n').catch((e) => {   // 网络不好、代码没下完：封面上提示点一下重新加载
    console.error(e);
    const p = document.querySelector('#boot p'); if (p) { p.textContent = '网络不太好，点一下重新加载'; document.getElementById('boot').onclick = () => location.reload(); }
  });
}
